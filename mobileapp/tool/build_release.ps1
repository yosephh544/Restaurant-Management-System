param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
$releaseAppRoot = Split-Path -Parent $PSScriptRoot
$releaseConfigPath = Join-Path $releaseAppRoot 'config/production.json'
if (-not (Test-Path -LiteralPath $releaseConfigPath)) {
    throw 'Create config/production.json from config/production.example.json and set the server profile key.'
}
$releaseSettings = Get-Content -Raw -LiteralPath $releaseConfigPath | ConvertFrom-Json
foreach ($settingName in @('API_BASE_URL', 'RESPONSE_ENCRYPTION_KEY')) {
    if ([string]::IsNullOrWhiteSpace($releaseSettings.$settingName)) {
        throw "Set $settingName in config/production.json before building the release APK."
    }
}
$releaseServer = $null
if (-not [Uri]::TryCreate($releaseSettings.API_BASE_URL, [UriKind]::Absolute, [ref]$releaseServer) -or
    $releaseServer.Scheme -notin @('http', 'https') -or
    $releaseServer.AbsolutePath.TrimEnd('/') -ne '/api/v1' -or
    $releaseServer.UserInfo -or $releaseServer.Query -or $releaseServer.Fragment) {
    throw 'API_BASE_URL must be an HTTP/HTTPS server URL ending in /api/v1.'
}
if ($ValidateOnly) {
    Write-Output 'Release server and profile-key settings are present. No APK was built.'
    return
}
Push-Location -LiteralPath $releaseAppRoot
try {
    & flutter build apk --release "--dart-define-from-file=$releaseConfigPath"
    if ($LASTEXITCODE -ne 0) {
        throw "Release APK build failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
