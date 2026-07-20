$envFile = Join-Path $PSScriptRoot "../.env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env file not found at $envFile"
    exit 1
}

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

$url = $env["SUPABASE_URL"]
$key = $env["SUPABASE_SERVICE_ROLE_KEY"]

if (-not $url -or -not $key) {
    Write-Error "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env"
    exit 1
}

$base = $url.TrimEnd('/') + '/rest/v1'
$headers = @{
    "apikey"        = $key
    "Authorization" = "Bearer $key"
    "Accept"        = "application/json"
    "User-Agent"    = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

# 1. reprint_candidates에서 위버멘쉬 검색
Write-Host "Connecting to Supabase at $url..."
try {
    $bookUrl = "$base/reprint_candidates?select=*&title=like.*위버멘쉬*"
    $books = Invoke-RestMethod -Uri $bookUrl -Method Get -Headers $headers
    
    Write-Host "`n=== reprint_candidates 내 위버멘쉬 검색 결과 ===`n"
    if ($books.Count -eq 0) {
        Write-Host "위버멘쉬 도서가 존재하지 않습니다."
    } else {
        foreach ($b in $books) {
            Write-Host "- 제목: $($b.title) | 저자: $($b.author) | ISBN: $($b.isbn13) | 저작권: $($b.copyright_status)"
        }
    }
} catch {
    Write-Error "Error fetching reprint_candidates: $_"
}

# 2. book_marketing_assets에서 위버멘쉬 에셋 조회
try {
    $assetUrl = "$base/book_marketing_assets?select=*"
    $assets = Invoke-RestMethod -Uri $assetUrl -Method Get -Headers $headers

    Write-Host "`n=== book_marketing_assets 내 전체 적재 현황 ===`n"
    if ($assets.Count -eq 0) {
        Write-Host "마케팅 에셋 테이블에 적재된 책이 하나도 없습니다."
    } else {
        $i = 1
        foreach ($a in $assets) {
            Write-Host "[$i] ISBN: $($a.isbn) | 상태: $($a.status)"
            Write-Host "    - 숏폼 비디오 URL: `"$($a.shorts_video_url)`""
            $hasCard = $null -ne $a.card_news_data
            Write-Host "    - 카드뉴스 존재 여부: $hasCard"
            $i++
        }
    }
} catch {
    Write-Error "Error fetching book_marketing_assets: $_"
}
