@echo off
chcp 65001 > nul

echo [ChulpanFriend] Starting Autopilot Asset Factory...
echo.

node scratch/generate_assets_factory.js

echo.
echo =====================================================================
echo [OK] Autopilot completed. Daily report updated.
echo =====================================================================
pause
