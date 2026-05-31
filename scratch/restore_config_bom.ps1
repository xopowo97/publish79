# Supabase Configuration
$SUPABASE_URL = 'https://fquzouhstheqvuzzhxqs.supabase.co'
$SUPABASE_KEY = 'sb_publishable_BOtAPo474zF0XsKOxhKxsQ_wBqY1pcn'

$headers = @{
    'apikey' = $SUPABASE_KEY
    'Authorization' = "Bearer $SUPABASE_KEY"
    'Content-Type' = 'application/json'
}

# Helper function to simulate encoding breakage
function BreakEncoding($orig) {
    if ($null -eq $orig) { return $orig }
    # Convert string to CP949 (EUC-KR) byte array
    $cp949Bytes = [System.Text.Encoding]::GetEncoding("euc-kr").GetBytes($orig)
    # Decode as UTF-8 (this produces replacement chars 65533 for invalid sequences)
    return [System.Text.Encoding]::UTF8.GetString($cp949Bytes)
}

Write-Host "Building dynamic translation dictionaries..."
$gradeMap = New-Object 'System.Collections.Generic.Dictionary[string,string]'
$standardGrades = @('신규등급', '일반등급(표준)', 'VIP등급', '기업등급', '테스트등급', '인쇄소 협약단가')
foreach ($g in $standardGrades) {
    $broken = BreakEncoding $g
    if (-not $gradeMap.ContainsKey($broken)) {
        $gradeMap.Add($broken, $g)
    }
}

# Spec Name Mapper (based on standard IDs in script.js)
$specNames = New-Object 'System.Collections.Generic.Dictionary[string,string]'
$specNames.Add("1", '36판(103x182)')
$specNames.Add("2", '국반판(105x148)')
$specNames.Add("3", '30절판(125x205)')
$specNames.Add("4", 'B6(128x182)')
$specNames.Add("5", '46판(128x188)')
$specNames.Add("6", '다찌판(128x210)')
$specNames.Add("7", 'A5국판(148x210)')
$specNames.Add("8", '크라운판(176x248)')
$specNames.Add("9", 'B5(182x257)')
$specNames.Add("10", '46배판(188x257)')
$specNames.Add("11", '국배판(210x297)')
$specNames.Add("1778735936807", '자가규격(시트)')
$specNames.Add("101", '36판(103x182)')
$specNames.Add("102", '국반판(105x148)')
$specNames.Add("103", '30절판(125x205)')
$specNames.Add("104", 'B6(128x182)')
$specNames.Add("105", '46판(128x188)')
$specNames.Add("106", '다찌판(128x210)')
$specNames.Add("107", 'A5국판(148x210)')
$specNames.Add("108", '신국판(152x225)')
$specNames.Add("109", '크라운판(176x248)')
$specNames.Add("110", 'B5(182x257)')
$specNames.Add("111", '46배판(188x257)')
$specNames.Add("112", '국배판(210x297)')
$specNames.Add("1778735948004", '자가규격(롤)')
$specNames.Add("201", '표지날개있음(권당)')
$specNames.Add("202", '표지날개없음(권당)')
$specNames.Add("203", '표지흑백단면인쇄(권당)')
$specNames.Add("204", '표지컬러양면인쇄(권당)')
$specNames.Add("205", '100g용지할증(Page당)')
$specNames.Add("206", '120g용지할증(Page당)')
$specNames.Add("207", '표지흑백양면인쇄(권당)')
$specNames.Add("208", '표지컬러단면인쇄(권당)')
$specNames.Add("209", '단면할증')

# Dynamic Commons Key Mapper
$commonsKeyMap = New-Object 'System.Collections.Generic.Dictionary[string,string]'
$categories = @{
    '표지인쇄' = @('표지-흑백단면', '표지-흑백양면', '표지-컬러단면', '표지-컬러양면')
    '코팅방식' = @('무광', '유광')
    '표지날개' = @('날개 있음', '날개 없음')
    '제본방식' = @('무선제본', '중철제본')
    '내지인쇄' = @('내지-흑백단면', '내지-흑백양면', '내지-컬러단면', '내지-컬러양면', '내지-부분컬러', '내지-부분컬러양면', '내지-부분컬러단면')
    '용지할증' = @('100g용지할증', '120g용지할증')
    '단면할증' = @('단면할증기본')
}

foreach ($cat in $categories.Keys) {
    foreach ($item in $categories[$cat]) {
        $cleanKey = "$cat`_$item"
        $brokenKey = BreakEncoding $cleanKey
        if (-not $commonsKeyMap.ContainsKey($brokenKey)) {
            $commonsKeyMap.Add($brokenKey, $cleanKey)
        }
    }
}

Write-Host "Fetching current master_config..."
$configUrl = "$SUPABASE_URL/rest/v1/master_config?id=eq.config"
$res = Invoke-RestMethod -Uri $configUrl -Headers $headers
if (-not $res) {
    Write-Error "Failed to fetch master_config"
    exit
}

$configObj = $res[0]
$data = $configObj.data

Write-Host "Restoring grades array..."
$data.grades = @('신규등급', '일반등급(표준)', 'VIP등급', '기업등급', '테스트등급')

Write-Host "Restoring pricesByGrade structure..."
$pricesByGrade = $data.pricesByGrade
$newPricesByGrade = @{}

foreach ($prop in $pricesByGrade.PSObject.Properties) {
    $brokenGradeName = $prop.Name
    $gradeData = $prop.Value
    
    # Resolve clean grade name
    $cleanGradeName = $null
    if ($gradeMap.ContainsKey($brokenGradeName)) {
        $cleanGradeName = $gradeMap[$brokenGradeName]
    } else {
        $cleanGradeName = $brokenGradeName
    }
    Write-Host "  Processing grade: $brokenGradeName -> $cleanGradeName"
    
    # 1. Restore commons spec names
    if ($gradeData.commons) {
        foreach ($c in $gradeData.commons) {
            $idStr = $c.id.ToString()
            if ($specNames.ContainsKey($idStr)) {
                $c.n = $specNames[$idStr]
            }
        }
    }
    
    # 2. Restore sheetSpecs names
    if ($gradeData.sheetSpecs) {
        foreach ($s in $gradeData.sheetSpecs) {
            $idStr = $s.id.ToString()
            if ($specNames.ContainsKey($idStr)) {
                $s.n = $specNames[$idStr]
            }
        }
    }
    
    # 3. Restore rollSpecs names
    if ($gradeData.rollSpecs) {
        foreach ($r in $gradeData.rollSpecs) {
            $idStr = $r.id.ToString()
            if ($specNames.ContainsKey($idStr)) {
                $r.n = $specNames[$idStr]
            }
        }
    }
    
    # 4. Restore sheetCommons keys
    if ($gradeData.sheetCommons) {
        $newSheetCommons = @{}
        foreach ($commonProp in $gradeData.sheetCommons.PSObject.Properties) {
            $brokenKey = $commonProp.Name
            $val = $commonProp.Value
            
            $cleanKey = $null
            if ($commonsKeyMap.ContainsKey($brokenKey)) {
                $cleanKey = $commonsKeyMap[$brokenKey]
            } else {
                $cleanKey = $brokenKey
            }
            $newSheetCommons[$cleanKey] = $val
        }
        $gradeData.sheetCommons = $newSheetCommons
    }
    
    # 5. Restore rollCommons keys
    if ($gradeData.rollCommons) {
        $newRollCommons = @{}
        foreach ($commonProp in $gradeData.rollCommons.PSObject.Properties) {
            $brokenKey = $commonProp.Name
            $val = $commonProp.Value
            
            $cleanKey = $null
            if ($commonsKeyMap.ContainsKey($brokenKey)) {
                $cleanKey = $commonsKeyMap[$brokenKey]
            } else {
                $cleanKey = $brokenKey
            }
            $newRollCommons[$cleanKey] = $val
        }
        $gradeData.rollCommons = $newRollCommons
    }
    
    # Store in new pricesByGrade
    $newPricesByGrade[$cleanGradeName] = $gradeData
}

$data.pricesByGrade = $newPricesByGrade

Write-Host "Restoring static metadata arrays..."
$data.coverPapers = @('스노우지 200g', '스노우지 250g', '아트지 200g', '아트지 250g', '랑데뷰 내츄럴 210g', '랑데뷰 내츄럴 240g', '랑데뷰 울트라화이트 210g', '랑데뷰 울트라화이트 240g')
$data.innerPapers = @('백모조80g', '백모조100g', '백모조120g', '미색모조80g', '미색모조100g')
$data.facePapers = @('없음', '매직칼라 옥색 120g', '매직칼라 노랑색 120g', '매직칼라 연분홍색 120g', '매직칼라 연두색 120g', '밍크지 군청색 120g', '밍크지 연청색 120g', '밍크지 적색 120g')
$data.coating = @('무광', '유광')
$data.binding = @('무선제본', '중철제본')
$data.wing = @('날개 있음', '날개 없음')
$data.coverPrinting = @('표지-흑백단면', '표지-흑백양면', '표지-컬러단면', '표지-컬러양면')
$data.innerPrinting = @('내지-흑백단면', '내지-흑백양면', '내지-컬러단면', '내지-컬러양면', '내지-부분컬러', '내지-부분컬러양면', '내지-부분컬러단면')
$data.faceInsert = @('없음', '면지있음(앞뒤1장)4P', '면지있음(앞뒤2장)8P')

# Assemble final payload
$payloadObj = @(
    @{
        id = 'config'
        data = $data
    }
)

$payloadJson = $payloadObj | ConvertTo-Json -Depth 100
$payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payloadJson)

Write-Host "Upserting restored config back to Supabase..."
$upsertHeaders = @{
    'apikey' = $SUPABASE_KEY
    'Authorization' = "Bearer $SUPABASE_KEY"
    'Content-Type' = 'application/json'
    'Prefer' = 'return=representation,resolution=merge-duplicates'
}
$upsertUrl = "$SUPABASE_URL/rest/v1/master_config"
$resUpdate = Invoke-RestMethod -Uri $upsertUrl -Method Post -Headers $upsertHeaders -Body $payloadBytes

Write-Host "Verification: Reading back updated master_config..."
$verifyRes = Invoke-RestMethod -Uri $configUrl -Headers $headers
$verifyObj = $verifyRes[0]

$verifyGrades = $verifyObj.data.grades
Write-Host "Verify grades: $($verifyGrades -join ', ')"

$verifyGradeKeys = $verifyObj.data.pricesByGrade.PSObject.Properties | Select-Object -ExpandProperty Name
Write-Host "Verify pricesByGrade keys: $($verifyGradeKeys -join ', ')"

Write-Host "Restoration Process Finished!"

