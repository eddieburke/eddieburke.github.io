param(
    [ValidateSet('all', 'chrome', 'edge', 'firefox')]
    [string]$Browser = 'all',
    [string]$Destination = (Join-Path $env:LOCALAPPDATA 'ArchivePocket\CaptureHelper'),
    [string]$FirefoxXpi,
    [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'extension'
$Destination = [System.IO.Path]::GetFullPath($Destination)
$chromium = Join-Path $Destination 'chromium'
$firefox = Join-Path $Destination 'firefox'
$files = @('background.js', 'bridge.js', 'extract.js', 'content.js', 'popup.js', 'popup.html', 'popup.css')
$utf8 = New-Object System.Text.UTF8Encoding($false)
foreach ($directory in @($chromium, $firefox)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    foreach ($file in $files) {
        Copy-Item -LiteralPath (Join-Path $source $file) -Destination (Join-Path $directory $file) -Force
    }
    $iconDirectory = Join-Path $directory 'icons'
    New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $source 'icons') -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $iconDirectory $_.Name) -Force }
}
$manifestText = [System.IO.File]::ReadAllText((Join-Path $source 'manifest.json'))
[System.IO.File]::WriteAllText((Join-Path $chromium 'manifest.json'), $manifestText, $utf8)
$manifest = $manifestText | ConvertFrom-Json
$manifest.background = [pscustomobject]@{ scripts = @('background.js') }
$manifest.PSObject.Properties.Remove('externally_connectable')
$manifest | Add-Member -MemberType NoteProperty -Name browser_specific_settings -Value ([pscustomobject]@{
    gecko = [pscustomobject]@{
        id = 'capture-helper@archive-pocket.local'
        strict_min_version = '142.0'
        data_collection_permissions = [pscustomobject]@{ required = @('none') }
    }
}) -Force
[System.IO.File]::WriteAllText((Join-Path $firefox 'manifest.json'), ($manifest | ConvertTo-Json -Depth 20), $utf8)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$unsignedXpi = Join-Path $Destination ('archive-pocket-firefox-' + $manifest.version + '-unsigned.xpi')
$temporaryXpi = Join-Path $Destination ([guid]::NewGuid().ToString() + '.zip')
[System.IO.Compression.ZipFile]::CreateFromDirectory($firefox, $temporaryXpi)
Move-Item -LiteralPath $temporaryXpi -Destination $unsignedXpi -Force
$signedXpi = Join-Path $Destination 'archive-pocket-firefox-signed.xpi'
if ($FirefoxXpi) {
    $FirefoxXpi = (Resolve-Path -LiteralPath $FirefoxXpi).Path
    $archive = [System.IO.Compression.ZipFile]::OpenRead($FirefoxXpi)
    try {
        if ((-not $archive.GetEntry('META-INF/mozilla.rsa') -and -not $archive.GetEntry('META-INF/cose.sig')) -or -not $archive.GetEntry('manifest.json')) {
            throw 'This Firefox package is missing Mozilla signing metadata. Submit the unsigned package to Mozilla first.'
        }
        $reader = New-Object System.IO.StreamReader($archive.GetEntry('manifest.json').Open())
        try { $signedManifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($signedManifest.browser_specific_settings.gecko.id -ne $manifest.browser_specific_settings.gecko.id -or $signedManifest.version -ne $manifest.version) {
            throw 'The signed package must contain this Capture Helper ID and version.'
        }
    } finally { $archive.Dispose() }
    if ($FirefoxXpi -ne $signedXpi) { Copy-Item -LiteralPath $FirefoxXpi -Destination $signedXpi -Force }
}
$website = 'https://eddieburke.github.io/911archhivecapture/'
$guide = @"
Capture Helper $($manifest.version)

Chrome / Edge: Developer mode -> Load unpacked -> select:
$chromium

Keep this folder. After an update, click Reload on the extension card.
App: $website

Firefox signing package:
$unsignedXpi
Submit for unlisted signing: https://addons.mozilla.org/developers/addon/submit/distribution
Then: Install.cmd firefox -FirefoxXpi "C:\path\to\signed-addon.xpi"

Test-Browsers.cmd uses temporary profiles.

"@
$guidePath = Join-Path $Destination 'INSTALL.txt'
[System.IO.File]::WriteAllText($guidePath, $guide, $utf8)
[pscustomobject]@{
    version = $manifest.version
    chromiumDirectory = $chromium
    firefoxDirectory = $firefox
    firefoxUnsignedPackage = $unsignedXpi
    browserInstallationConfirmed = $false
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Destination 'prepared.json') -Encoding UTF8
Write-Output $guide
if ($PrepareOnly) { return }
Set-Clipboard -Value $chromium
$programs = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
$binaries = @{
    chrome = 'Google\Chrome\Application\chrome.exe'
    edge = 'Microsoft\Edge\Application\msedge.exe'
    firefox = 'Mozilla Firefox\firefox.exe'
}
$targets = if ($Browser -eq 'all') { @('chrome', 'edge', 'firefox') } else { @($Browser) }
Start-Process -FilePath 'notepad.exe' -ArgumentList ('"' + $guidePath + '"') -WindowStyle Normal
foreach ($target in $targets) {
    $binary = $programs | ForEach-Object { Join-Path $_ $binaries[$target] } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $binary) { Write-Warning "$target is not installed; skipping."; continue }
    if ($target -eq 'firefox') {
        if (Test-Path -LiteralPath $signedXpi) {
            $packageUrl = ([System.Uri]$signedXpi).AbsoluteUri
            Start-Process -FilePath $binary -ArgumentList $packageUrl -WindowStyle Normal
        } else {
            Write-Warning 'Firefox was not installed: Mozilla signing is required. The unsigned signing package is ready.'
        }
    } else {
        $manager = if ($target -eq 'chrome') { 'chrome://extensions/' } else { 'edge://extensions/' }
        Start-Process -FilePath $binary -ArgumentList $website, $manager -WindowStyle Normal
        Write-Output "$target opened its normal profile. The folder for Load unpacked is already copied to the clipboard."
    }
}
