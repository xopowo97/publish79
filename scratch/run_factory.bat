@echo off
chcp 65001 > nul

echo [ChulpanFriend] Starting Autopilot Asset Factory...
echo.

:: 윈도우 스케줄러 기동 시 경로 이탈 에러(MODULE_NOT_FOUND) 방지를 위한 절대 경로 강제 이동
cd /d "C:\Users\seo sang won\001.작업파일\004. 출판친구\018. 안티그래비티"

node scratch/generate_assets_factory.js

echo.
echo =====================================================================
echo [OK] Autopilot completed. Daily report updated.
echo =====================================================================
pause
