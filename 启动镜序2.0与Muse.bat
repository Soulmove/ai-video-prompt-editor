@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [镜序 2.0 + Muse] 正在启动本机工作台 (127.0.0.1:4174) 与 Muse 引擎 (18610/18611)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Jingxu-Muse.ps1" %*
if errorlevel 1 (
    echo.
    echo [错误] 启动过程中遇到问题，请查看上方提示。
    pause
    exit /b 1
)
echo.
echo 提示：如需关闭本次启动的后台服务，可运行:
echo   powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Jingxu-Muse.ps1" -Action Stop
timeout /t 3 >nul
