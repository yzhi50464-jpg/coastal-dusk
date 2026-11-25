$ErrorActionPreference = 'Stop'
# Download only official Poly Haven source assets; no runtime downloads occur.
$assetRoot = $PSScriptRoot
$api = Invoke-RestMethod 'https://api.polyhaven.com/files/fern_02'
$selection = @(
  @{ Path = 'fern_02_1k.blend'; Info = $api.blend.'1k'.blend },
  @{ Path = 'textures/fern_02_diff_1k.jpg'; Info = $api.Diffuse.'1k'.jpg },
  @{ Path = 'textures/fern_02_alpha_1k.png'; Info = $api.Alpha.'1k'.png },
  @{ Path = 'textures/fern_02_nor_gl_1k.jpg'; Info = $api.nor_gl.'1k'.jpg }
)
New-Item -ItemType Directory -Path (Join-Path $assetRoot 'textures') -Force | Out-Null
$files = foreach ($item in $selection) {
  $destination = Join-Path $assetRoot $item.Path
  if (-not $item.Info.url.StartsWith('https://dl.polyhaven.org/')) { throw 'Unexpected download host' }
  $present = (Test-Path -LiteralPath $destination) -and ((Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant() -eq $item.Info.md5)
  if (-not $present) { Invoke-WebRequest -Uri $item.Info.url -OutFile $destination }
  $md5 = (Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant()
  if ($md5 -ne $item.Info.md5) { throw "Official MD5 mismatch: $($item.Path)" }
  $bytes = (Get-Item -LiteralPath $destination).Length
  if ($bytes -ne $item.Info.size) { throw "Official size mismatch: $($item.Path)" }
  [ordered]@{ path = $item.Path; url = $item.Info.url; bytes = $bytes; officialMD5 = $item.Info.md5; downloadedMD5 = $md5; sha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() }
}
$manifest = [ordered]@{
  asset = 'Fern 02'; source = 'https://polyhaven.com/a/fern_02'; api = 'https://api.polyhaven.com/files/fern_02'
  authors = @(@{ name = 'Rico Cilliers'; role = 'Modeling' }, @{ name = 'Rob Tuytel'; role = 'Scanning' })
  license = 'CC0 1.0'; licenseURL = 'https://polyhaven.com/license'; legalCode = 'https://creativecommons.org/publicdomain/zero/1.0/'
  downloadedUTC = [DateTime]::UtcNow.ToString('o'); files = @($files)
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $assetRoot 'sources.json') -Encoding utf8
$files | ForEach-Object { [pscustomobject]$_ } | Format-Table path, bytes, downloadedMD5 -AutoSize
