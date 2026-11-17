param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$workerPath = Join-Path $taskRoot 'apps/worker'
$wranglerEntry = Join-Path $workerPath 'node_modules/wrangler/bin/wrangler.js'
Write-Host 'Target: distilled-news-sources-qa; creates collection queues and applies additive D1 migrations.'
Write-Host 'No deploy, paid provider requests, credential changes or budget changes are performed.'
if (-not $Apply) {
  Write-Host 'Review documentation/CONNECTOR_SCALE_1000.md, then rerun with -Apply.'
  exit 0
}
Push-Location $workerPath
try {
  if (-not (Test-Path -LiteralPath $wranglerEntry)) { throw 'Install workspace dependencies before preparation.' }
  $backupPath = Join-Path $taskRoot ('.review-tmp/qa-before-connector-scale-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.sql')
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backupPath) | Out-Null
  & node $wranglerEntry d1 export distilled-news-sources-qa --remote --output $backupPath --config wrangler.sources-qa.toml
  if ($LASTEXITCODE -ne 0) { throw 'QA backup failed; migrations were not started.' }
  $queues = & node $wranglerEntry queues list --config wrangler.sources-qa.toml
  if ($LASTEXITCODE -ne 0) { throw 'Could not list queues; verify the QA Cloudflare account.' }
  foreach ($queueName in @('distilled-news-sources-qa-collection', 'distilled-news-sources-qa-collection-dlq')) {
    if (($queues -join "`n") -notmatch [regex]::Escape($queueName)) {
      & node $wranglerEntry queues create $queueName --config wrangler.sources-qa.toml
      if ($LASTEXITCODE -ne 0) { throw "Could not create $queueName" }
    }
  }
  & node $wranglerEntry d1 migrations apply distilled-news-sources-qa --remote --config wrangler.sources-qa.toml
  if ($LASTEXITCODE -ne 0) { throw 'QA migrations failed.' }
} finally { Pop-Location }
