$ErrorActionPreference = 'Stop'
# Fixed target, read-only, using the Windows HTTP stack/system network settings.
$origin = 'https://distilled-news-staging.distillednews-platform.workers.dev'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dist = Join-Path $repoRoot 'apps/web/dist'
$scratch = Join-Path $repoRoot '.local-reports/briefing-latency/http-smoke'
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
function Read-StagingAsset([string]$urlPath, [string]$name) {
    $file = Join-Path $scratch $name
    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    $response = Invoke-WebRequest -Uri ($origin + $urlPath) -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30 -OutFile $file -PassThru
    $watch.Stop()
    if ($response.StatusCode -ne 200) { throw 'STAGING_HTTP_FAILURE' }
    return [pscustomobject]@{path=$urlPath;status=$response.StatusCode;contentType=$response.Headers['Content-Type'];durationMs=$watch.Elapsed.TotalMilliseconds;bytes=(Get-Item -LiteralPath $file).Length;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash;file=$file}
}
function Assert-BuildMatch($remote, [string]$localFile) {
    if ($remote.sha256 -ne (Get-FileHash -LiteralPath $localFile -Algorithm SHA256).Hash) { throw 'STAGING_ASSET_DIFFERS_FROM_BUILD' }
}
$index = Read-StagingAsset '/' 'index.html'
Assert-BuildMatch $index (Join-Path $dist 'index.html')
$paths = @([regex]::Matches((Get-Content -LiteralPath $index.file -Raw), '(?:src|href)="(/assets/[^"?#]+\.(?:js|css))"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
if (-not ($paths | Where-Object { $_.EndsWith('.js') }) -or -not ($paths | Where-Object { $_.EndsWith('.css') })) { throw 'STAGING_ASSET_REFERENCES_MISSING' }
$assets = @()
foreach ($urlPath in ($paths | Select-Object -First 6)) {
    if ($urlPath.Contains('..')) { throw 'UNEXPECTED_ASSET_PATH' }
    $remote = Read-StagingAsset $urlPath ([System.IO.Path]::GetFileName($urlPath))
    Assert-BuildMatch $remote (Join-Path $dist $urlPath.TrimStart('/'))
    $assets += $remote | Select-Object * -ExcludeProperty file
}
$session = Read-StagingAsset '/api/auth/session' 'session.json'
$sessionKeys = @((Get-Content -LiteralPath $session.file -Raw | ConvertFrom-Json).PSObject.Properties.Name | Sort-Object)
[pscustomobject]@{observedAt=[DateTime]::UtcNow.ToString('o');origin=$origin;index=($index | Select-Object * -ExcludeProperty file);assets=$assets;session=[pscustomobject]@{path=$session.path;status=$session.status;durationMs=$session.durationMs;keys=$sessionKeys};publicationVerified=$false} | ConvertTo-Json -Depth 6
