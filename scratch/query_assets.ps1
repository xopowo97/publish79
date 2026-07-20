# scratch/query_assets.ps1
$envPath = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envPath) {
    $envContent = Get-Content -Path $envPath -Encoding UTF8
    foreach ($line in $envContent) {
        if ($line -match "^SUPABASE_URL=(.+)$") {
            $SUPABASE_URL = $Matches[1].Replace("`r", "").Replace("`n", "").Trim()
        }
        if ($line -match "^SUPABASE_SERVICE_ROLE_KEY=(.+)$") {
            $SERVICE_KEY = $Matches[1].Replace("`r", "").Replace("`n", "").Trim()
        }
    }
}

if (-not $SUPABASE_URL -or -not $SERVICE_KEY) {
    Write-Error "Missing env keys"
    exit 1
}

$base = $SUPABASE_URL.Replace("/rest/v1", "").Replace("`r", "").Replace("`n", "").Trim().TrimEnd('/') + "/rest/v1"

$headers = @{
    "apikey" = $SERVICE_KEY
    "Authorization" = "Bearer $SERVICE_KEY"
    "Accept" = "application/json"
    "User-Agent" = "Supabase-Backend"
}

Write-Host "1. reprint_candidates 5 Items:"
$candsRes = Invoke-RestMethod -Uri "$base/reprint_candidates?limit=5" -Method Get -Headers $headers
$candsRes | ForEach-Object {
    Write-Host "  - ID: $($_.id) | Title: $($_.title) | ISBN: $($_.isbn)"
}

Write-Host "`n2. book_marketing_assets 10 Items:"
$assetsRes = Invoke-RestMethod -Uri "$base/book_marketing_assets?order=updated_at.desc&limit=10" -Method Get -Headers $headers
$assetsRes | ForEach-Object {
    Write-Host "  - ISBN: $($_.isbn) | Status: $($_.status) | Updated: $($_.updated_at) | Error: $($_.summary_script)"
}
