# Renders the Chrome Web Store promo tiles from promo.html with Chrome:
#   store\promo-small.png (440x280), store\promo-marquee.png (1400x560)
# and the Spotify Recently played screenshot from screenshot-recent.html: store\screenshot-2.png (1280x800)
$ErrorActionPreference = 'Stop'
$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
$src = (Resolve-Path "$PSScriptRoot\promo.html").Path -replace '\\', '/'
$jobs = @(
  @{ brand = 'spotify'; size = 'small';   w = 440;  h = 280; out = "$PSScriptRoot\promo-small.png" },
  @{ brand = 'spotify'; size = 'marquee'; w = 1400; h = 560; out = "$PSScriptRoot\promo-marquee.png" }
)
$shot = (Resolve-Path "$PSScriptRoot\screenshot-recent.html").Path -replace '\\', '/'
$jobs += @{ url = "file:///$shot"; w = 1280; h = 800; out = "$PSScriptRoot\screenshot-2.png" }
foreach ($j in $jobs) {
  $out = [IO.Path]::GetFullPath($j.out)
  $url = if ($j.url) { $j.url } else { "file:///${src}?brand=$($j.brand)&size=$($j.size)" }
  # Start-Process: Chrome writes harmless warnings to stderr, which would stop the script.
  Start-Process -FilePath $chrome -Wait -WindowStyle Hidden -ArgumentList @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    "--window-size=$($j.w),$($j.h)", "`"--screenshot=$out`"", "`"$url`"")
  Write-Host "$out"
}
