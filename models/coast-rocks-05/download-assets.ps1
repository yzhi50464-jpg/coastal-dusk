$ErrorActionPreference = 'Stop'
# Official source files only. The runtime module never performs downloads.
$assetRoot = $PSScriptRoot
$api = Invoke-RestMethod 'https://api.polyhaven.com/files/coast_rocks_05'
$gltf = $api.gltf.'1k'.gltf
$selection = @(@{ Path = 'coast_rocks_05_1k.gltf'; Info = $gltf })
foreach ($name in @('coast_rocks_05.bin', 'textures/coast_rocks_05_diff_1k.jpg', 'textures/coast_rocks_05_nor_gl_1k.jpg', 'textures/coast_rocks_05_arm_1k.jpg')) {
  $selection += @{ Path = $name; Info = $gltf.include.$name }
}
New-Item -ItemType Directory -Path (Join-Path $assetRoot 'original/textures') -Force | Out-Null
$files = foreach ($item in $selection) {
  $relativePath = 'original/' + $item.Path
  $destination = Join-Path $assetRoot $relativePath
  if (-not $item.Info.url.StartsWith('https://dl.polyhaven.org/')) { throw 'Unexpected download host' }
  $complete = $false
  if (Test-Path -LiteralPath $destination) {
    $complete = (Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant() -eq $item.Info.md5
    if (-not $complete -and (Get-Item -LiteralPath $destination).Length -ne 0) { throw "Existing original differs from official MD5: $relativePath" }
  }
  if (-not $complete) {
    # Windows PowerShell's transport returned EOF for the large source BIN.
    # HTTP/1.1 curl retries are bounded and verify the official checksum below.
    & curl.exe --http1.1 --fail --location --silent --show-error --connect-timeout 20 --max-time 180 --retry 2 --retry-delay 2 --output $destination $item.Info.url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $relativePath" }
  }
  $md5 = (Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant()
  if ($md5 -ne $item.Info.md5) { throw "Official MD5 mismatch: $relativePath" }
  $bytes = (Get-Item -LiteralPath $destination).Length
  if ($bytes -ne $item.Info.size) { throw "Official size mismatch: $relativePath" }
  [pscustomobject][ordered]@{ path = $relativePath; url = $item.Info.url; bytes = $bytes; officialMD5 = $item.Info.md5; downloadedMD5 = $md5; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{
  asset = 'Coast Rocks 05'; source = 'https://polyhaven.com/a/coast_rocks_05'; api = 'https://api.polyhaven.com/files/coast_rocks_05'
  author = 'Rob Tuytel'; license = 'CC0 1.0'; licenseURL = 'https://polyhaven.com/license'; legalCode = 'https://creativecommons.org/publicdomain/zero/1.0/'
  downloadedUTC = [DateTime]::UtcNow.ToString('o'); files = @($files)
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $assetRoot 'sources.json') -Encoding utf8
$files | Format-Table path, bytes, downloadedMD5 -AutoSize
