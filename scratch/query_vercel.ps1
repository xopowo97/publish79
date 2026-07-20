# Vercel 라이브 API를 통해 Supabase에 위버멘쉬 에셋이 존재하는지 안전하게 조회
$targetIsbns = @("9791191043326", "9788901243665", "9788970131498")

Write-Host "Vercel API를 통해 Supabase 마케팅 에셋 현황을 조회합니다..."

foreach ($isbn in $targetIsbns) {
    $url = "https://publish79.vercel.app/api/reprint-candidates?isbn=$isbn"
    try {
        $res = Invoke-RestMethod -Uri $url -Method Get
        Write-Host "`n[ISBN: $isbn] 조회 결과:"
        if ($res.success -and $res.asset) {
            Write-Host "✅ 에셋 발견!" -ForegroundColor Green
            Write-Host "  - 상태(status): $($res.asset.status)"
            Write-Host "  - 숏폼 비디오 URL: `"$($res.asset.shorts_video_url)`""
            Write-Host "  - 카드뉴스 데이터: $($res.asset.card_news_data | ConvertTo-Json -Depth 5)"
        } else {
            Write-Host "❌ 에셋이 존재하지 않거나 에셋 빌드가 성공하지 못했습니다. (status가 success가 아님)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️ API 호출 실패: $_" -ForegroundColor Red
    }
}
