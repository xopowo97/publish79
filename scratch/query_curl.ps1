$envFile = Join-Path $PSScriptRoot "../.env"
$env = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line.Split('=', 2)
        if ($parts.Count -eq 2) {
            $key = $parts[0].Trim()
            $val = $parts[1].Trim().Trim("'").Trim('"')
            $env[$key] = $val
        }
    }
}

$url = $env["SUPABASE_URL"].TrimEnd('/')
$key = $env["SUPABASE_SERVICE_ROLE_KEY"]

Write-Host "curl.exe를 사용하여 Supabase의 book_marketing_assets 전체 목록을 조회합니다..."

$targetUrl = "$url/rest/v1/book_marketing_assets?select=*"
$output = & curl.exe -s -H "apikey: $key" -H "Authorization: Bearer $key" $targetUrl

Write-Host "`n=== book_marketing_assets 전체 결과 ==="
Write-Host $output
