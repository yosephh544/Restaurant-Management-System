$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$logoPath = Join-Path $projectRoot 'assets/images/logo.jpg'
$sourceImage = [Drawing.Image]::FromFile($logoPath)

function Save-BrandIcon {
    param([string] $RelativePath, [int] $Size, [double] $ArtworkFraction = 1)

    $outputPath = [IO.Path]::GetFullPath((Join-Path $projectRoot $RelativePath))
    if (-not $outputPath.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar)) {
        throw "Icon output must stay inside the project: $outputPath"
    }
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($outputPath)) | Out-Null
    $bitmap = [Drawing.Bitmap]::new($Size, $Size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([Drawing.Color]::FromArgb(0, 78, 33))
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $scale = $Size * $ArtworkFraction / [Math]::Max($sourceImage.Width, $sourceImage.Height)
        $width = $sourceImage.Width * $scale
        $height = $sourceImage.Height * $scale
        $bounds = [Drawing.RectangleF]::new(($Size - $width) / 2, ($Size - $height) / 2, $width, $height)
        $graphics.DrawImage($sourceImage, $bounds)
        $bitmap.Save($outputPath, [Drawing.Imaging.ImageFormat]::Png)
    } finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    $densities = @(
        @{ Name = 'mdpi'; Size = 48; AdaptiveSize = 108 },
        @{ Name = 'hdpi'; Size = 72; AdaptiveSize = 162 },
        @{ Name = 'xhdpi'; Size = 96; AdaptiveSize = 216 },
        @{ Name = 'xxhdpi'; Size = 144; AdaptiveSize = 324 },
        @{ Name = 'xxxhdpi'; Size = 192; AdaptiveSize = 432 }
    )
    foreach ($density in $densities) {
        $resourcePath = 'android/app/src/main/res/mipmap-' + $density.Name
        Save-BrandIcon ($resourcePath + '/ic_launcher.png') $density.Size
        # Keep the complete logo within the safe region of circle/squircle masks.
        Save-BrandIcon ($resourcePath + '/ic_launcher_foreground.png') $density.AdaptiveSize (2 / 3)
    }

    $iosIconDirectory = 'ios/Runner/Assets.xcassets/AppIcon.appiconset'
    $catalog = Get-Content -LiteralPath (Join-Path $projectRoot ($iosIconDirectory + '/Contents.json')) -Raw | ConvertFrom-Json
    foreach ($entry in $catalog.images | Sort-Object filename -Unique) {
        $points = [double]::Parse($entry.size.Split('x')[0], [Globalization.CultureInfo]::InvariantCulture)
        $scale = [int]$entry.scale.Replace('x', '')
        Save-BrandIcon ($iosIconDirectory + '/' + $entry.filename) ([int]($points * $scale))
    }
    Write-Output 'Generated Majete Corner launcher icons for Android and iOS.'
} finally {
    $sourceImage.Dispose()
}
