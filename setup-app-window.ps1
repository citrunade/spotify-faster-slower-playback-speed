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
# --test-type hides the "unsupported command-line flag" warning bar that switch causes.
$common = "--user-data-dir=`"$profileDir`" --no-first-run --no-default-browser-check --allowlisted-extension-id=$extId --test-type"
$shell  = New-Object -ComObject WScript.Shell

# Taskbar identity Chrome gives the app window (read from the running window). Putting the same
# ID on the shortcut makes Windows group the window under the pinned shortcut and use its
# full-resolution icon instead of Chrome's small page icon.
$appUserModelId = 'Chrome.open.spotify.com_/.ChromeProfle.Default'

Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Runtime.InteropServices.ComTypes;
public static class LinkId {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")] class ShellLink {}
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore { int GetCount(out uint c); int GetAt(uint i, out PK k); int GetValue(ref PK k, out PV v); int SetValue(ref PK k, ref PV v); int Commit(); }
  [StructLayout(LayoutKind.Sequential, Pack=4)] struct PK { public Guid f; public uint p; }
  [StructLayout(LayoutKind.Sequential)] struct PV { public ushort vt, a, b, c; public IntPtr p; public IntPtr p2; }
  public static void Set(string lnk, string id) {
    object link = new ShellLink();
    ((IPersistFile)link).Load(lnk, 2);
    var store = (IPropertyStore)link;
    PK key = new PK { f = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), p = 5 };
    PV val = new PV { vt = 31, p = Marshal.StringToCoTaskMemUni(id) };
    Marshal.ThrowExceptionForHR(store.SetValue(ref key, ref val));
    Marshal.ThrowExceptionForHR(store.Commit());
    ((IPersistFile)link).Save(lnk, true);
    Marshal.FreeCoTaskMem(val.p);
  }
}
'@

function New-Shortcut($path, $arguments, $description, $id) {
  $s = $shell.CreateShortcut($path)
  $s.TargetPath = $chrome
  $s.Arguments = $arguments
  $s.IconLocation = "$icon,0"
  $s.Description = $description
  $s.WorkingDirectory = Split-Path $chrome
  $s.Save()
  if ($id) { [LinkId]::Set($path, $id) }
  Write-Host "Created $path"
}

$app = "$common --app=https://open.spotify.com/ --window-size=1280,800"
$desktop  = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
New-Shortcut (Join-Path $desktop  'Spotify Stretch.lnk') $app 'Spotify web player, sped up at original pitch' $appUserModelId
New-Shortcut (Join-Path $programs 'Spotify Stretch.lnk') $app 'Spotify web player, sped up at original pitch' $appUserModelId
# Refresh a taskbar pin of the app shortcut, if there is one (pins are copies of the shortcut).
$pinned = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\Spotify Stretch.lnk'
if (Test-Path $pinned) { New-Shortcut $pinned $app 'Spotify web player, sped up at original pitch' $appUserModelId }
# Chrome refuses chrome:// pages from the command line, so this opens a normal window of the
# same profile; type chrome://extensions there once to load the extension.
New-Shortcut (Join-Path $programs 'Spotify Stretch - setup.lnk') $common 'Normal Chrome window of the Spotify Stretch profile (for the one-time extension install)'
