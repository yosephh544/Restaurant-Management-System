[CmdletBinding()]
param(
    [ValidateSet('Preview', 'Reset')]
    [string]$Mode = 'Preview',
    [Parameter(Mandatory = $true)]
    [string]$ExpectedServer,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedDatabase
)

$ErrorActionPreference = 'Stop'
$taskRepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskApiRoot = Join-Path $taskRepoRoot 'Api/Api'
$taskConfiguration = Get-Content -LiteralPath (Join-Path $taskApiRoot 'appsettings.json') -Raw | ConvertFrom-Json
$taskConnectionText = $taskConfiguration.ConnectionStrings.DefaultConnection
$taskDevelopmentPath = Join-Path $taskApiRoot 'appsettings.Development.json'
if (Test-Path -LiteralPath $taskDevelopmentPath) {
    $taskDevelopment = Get-Content -LiteralPath $taskDevelopmentPath -Raw | ConvertFrom-Json
    if ($taskDevelopment.ConnectionStrings.DefaultConnection) {
        $taskConnectionText = $taskDevelopment.ConnectionStrings.DefaultConnection
    }
}
if ($env:ConnectionStrings__DefaultConnection) {
    $taskConnectionText = $env:ConnectionStrings__DefaultConnection
}
$taskBuilder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new([string]$taskConnectionText)
if ($taskBuilder.DataSource -ne $ExpectedServer -or $taskBuilder.InitialCatalog -ne $ExpectedDatabase) {
    throw 'The configured database does not match the explicitly supplied server and database.'
}
if ($ExpectedDatabase.ToLowerInvariant() -in @('master', 'model', 'msdb', 'tempdb')) {
    throw 'System databases cannot be reset.'
}
$taskBuilder['Connect Timeout'] = 15
$taskConnection = [System.Data.SqlClient.SqlConnection]::new($taskBuilder.ConnectionString)
$taskTransaction = $null

# Child rows precede their parents; configuration and sign-in records are preserved.
$taskResetTables = @(
    'bill_audits', 'waiter_tips', 'bill_items', 'order_cancellations',
    'payments', 'bills', 'order_items', 'orders', 'dining_sessions', 'daily_number_sequences'
)
$taskKeptTables = @(
    'users', 'menu_items', 'menu_categories', 'restaurant_settings', 'restaurant_tables',
    'roles', 'permissions', 'role_permissions', 'shifts', 'user_shifts', 'shift_exceptions',
    'refresh_tokens', 'password_reset_requests', '__EFMigrationsHistory'
)

function Read-TaskRows([string]$Query) {
    $taskCommand = $taskConnection.CreateCommand()
    $taskCommand.CommandText = $Query
    $taskCommand.CommandTimeout = 30
    if ($taskTransaction) { $taskCommand.Transaction = $taskTransaction }
    try {
        $taskReader = $taskCommand.ExecuteReader()
        try {
            while ($taskReader.Read()) {
                $taskRow = [ordered]@{}
                for ($taskColumn = 0; $taskColumn -lt $taskReader.FieldCount; $taskColumn++) {
                    $taskRow[$taskReader.GetName($taskColumn)] = if ($taskReader.IsDBNull($taskColumn)) {
                        $null
                    } else { $taskReader.GetValue($taskColumn) }
                }
                [pscustomobject]$taskRow
            }
        } finally { $taskReader.Dispose() }
    } finally { $taskCommand.Dispose() }
}

function Invoke-TaskSql([string]$Query) {
    $taskCommand = $taskConnection.CreateCommand()
    $taskCommand.CommandText = $Query
    $taskCommand.CommandTimeout = 30
    if ($taskTransaction) { $taskCommand.Transaction = $taskTransaction }
    try { $taskCommand.ExecuteNonQuery() } finally { $taskCommand.Dispose() }
}

function Read-TaskCounts([string[]]$Tables) {
    $taskCounts = [ordered]@{}
    foreach ($taskTable in $Tables) {
        $taskCounts[$taskTable] = @(Read-TaskRows "SELECT COUNT_BIG(*) AS count FROM [dbo].[$taskTable]")[0].count
    }
    $taskCounts
}

try {
    $taskConnection.Open()
    if (@(Read-TaskRows 'SELECT DB_NAME() AS name')[0].name -ne $ExpectedDatabase) {
        throw 'The connected database does not match the requested target.'
    }
    $taskActualTables = @(Read-TaskRows 'SELECT t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name=''dbo''').name
    foreach ($taskTable in ($taskResetTables + $taskKeptTables)) {
        if ($taskTable -notin $taskActualTables) { throw "Required table is missing: $taskTable" }
    }
    $taskForeignKeys = @(Read-TaskRows @'
SELECT fk.name, OBJECT_SCHEMA_NAME(fk.parent_object_id) AS child_schema,
       OBJECT_NAME(fk.parent_object_id) AS child_table,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parent_schema,
       OBJECT_NAME(fk.referenced_object_id) AS parent_table
FROM sys.foreign_keys fk
'@)
    foreach ($taskForeignKey in $taskForeignKeys) {
        if ($taskForeignKey.parent_schema -eq 'dbo' -and $taskForeignKey.parent_table -in $taskResetTables -and
            ($taskForeignKey.child_schema -ne 'dbo' -or $taskForeignKey.child_table -notin $taskResetTables)) {
            throw "An unplanned dependent table prevents reset: $($taskForeignKey.child_schema).$($taskForeignKey.child_table)"
        }
    }
    if ($Mode -eq 'Preview') {
        [ordered]@{ server = $ExpectedServer; database = $ExpectedDatabase; mode = $Mode;
            activityRows = (Read-TaskCounts $taskResetTables); preservedRows = (Read-TaskCounts $taskKeptTables) } |
            ConvertTo-Json -Depth 5
        return
    }

    $taskTransaction = $taskConnection.BeginTransaction([System.Data.IsolationLevel]::Serializable)
    [void](Invoke-TaskSql 'SET LOCK_TIMEOUT 10000;')
    $taskBackup = [ordered]@{ server = $ExpectedServer; database = $ExpectedDatabase;
        createdAtUtc = [DateTime]::UtcNow.ToString('O'); tables = [ordered]@{} }
    foreach ($taskTable in $taskResetTables) {
        # Hold write locks until commit so new activity cannot escape the backup/reset.
        $taskBackup.tables[$taskTable] = @(Read-TaskRows "SELECT * FROM [dbo].[$taskTable] WITH (TABLOCKX,HOLDLOCK)")
    }
    $taskBackup.tableStates = @(Read-TaskRows 'SELECT Id, Status FROM dbo.restaurant_tables WITH (TABLOCKX,HOLDLOCK)')
    $taskPreservedBefore = Read-TaskCounts $taskKeptTables
    $taskBackupDirectory = [IO.Path]::GetFullPath((Join-Path $taskApiRoot 'obj/database-reset-backups'))
    if (-not $taskBackupDirectory.StartsWith($taskRepoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The backup directory must stay inside the repository.'
    }
    [void][IO.Directory]::CreateDirectory($taskBackupDirectory)
    $taskBackupName = 'test-activity-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff') + '.json'
    $taskBackupPath = Join-Path $taskBackupDirectory $taskBackupName
    [IO.File]::WriteAllText($taskBackupPath, ($taskBackup | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))

    $taskDeleted = [ordered]@{}
    foreach ($taskTable in $taskResetTables) {
        $taskDeleted[$taskTable] = Invoke-TaskSql "DELETE FROM [dbo].[$taskTable];"
    }
    [void](Invoke-TaskSql 'UPDATE dbo.restaurant_tables SET Status=''Available'';')
    $taskRemaining = Read-TaskCounts $taskResetTables
    foreach ($taskTable in $taskResetTables) {
        if ($taskRemaining[$taskTable] -ne 0) { throw "Reset verification failed for $taskTable" }
    }
    $taskPreservedAfter = Read-TaskCounts $taskKeptTables
    foreach ($taskTable in $taskKeptTables) {
        if ($taskPreservedBefore[$taskTable] -ne $taskPreservedAfter[$taskTable]) {
            throw "Preserved table changed unexpectedly: $taskTable"
        }
    }
    $taskTransaction.Commit()
    [ordered]@{ server = $ExpectedServer; database = $ExpectedDatabase; mode = $Mode;
        backup = $taskBackupPath; deletedRows = $taskDeleted; remainingRows = $taskRemaining;
        preservedRows = $taskPreservedAfter; tableStatus = 'Available' } | ConvertTo-Json -Depth 5
} catch {
    if ($taskTransaction) {
        try { $taskTransaction.Rollback() } catch { }
    }
    throw
} finally {
    if ($taskTransaction) { $taskTransaction.Dispose() }
    $taskConnection.Dispose()
}
