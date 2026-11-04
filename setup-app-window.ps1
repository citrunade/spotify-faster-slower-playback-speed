# Creates the "Spotify Stretch" app window: a separate Chrome profile that opens the
# Spotify web player in its own window (no tabs or address bar), where the extension
# switches itself on without a click.
#
# Run:  powershell -ExecutionPolicy Bypass -File setup-app-window.ps1

$ErrorActionPreference = 'Stop'
$extId   = 'mjjkocjanbcalbkmdbakfckbijfibpne'   # ID Chrome gives this folder when loaded unpacked from C:\SpotifyStretch
$chrome  = Join-Path ${env:ProgramFiles} 'Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $chrome)) { $chrome = Join-Path ${env:LOCALAPPDATA} 'Google\Chrome\Application\chrome.exe' }
$profileDir = Join-Path $env:LOCALAPPDATA 'SpotifyStretch\ChromeProfile'
New-Item -ItemType Directory -Force $profileDir | Out-Null

$icon = Join-Path $env:APPDATA 'Spotify\Spotify.exe'
if (-not (Test-Path $icon)) { $icon = $chrome }

# The allowlist switch is on every shortcut: whichever window starts this profile first sets it.
$common = "--user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --allowlisted-extension-id=$extId"
$shell  = New-Object -ComObject WScript.Shell

function New-Shortcut($path, $arguments, $description) {
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = $chrome
  $s.Arguments = $arguments
  $s.IconLocation = "$icon,0"
  $s.Description = $description
  $s.WorkingDirectory = Split-Path $chrome
  $s.Save()
  Write-Host "Created $path"
}

$app = "$common --app=https://open.spotify.com/ --window-size=1280,800"
$desktop  = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
New-Shortcut (Join-Path $desktop  'Spotify Stretch.lnk') $app 'Spotify web player, sped up at original pitch'
New-Shortcut (Join-Path $programs 'Spotify Stretch.lnk') $app 'Spotify web player, sped up at original pitch'
# Chrome refuses chrome:// pages from the command line, so this opens a normal window of the
# same profile; type chrome://extensions there once to load the extension.
New-Shortcut (Join-Path $programs 'Spotify Stretch - setup.lnk') $common 'Normal Chrome window of the Spotify Stretch profile (for the one-time extension install)'
