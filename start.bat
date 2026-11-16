@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist node_modules (
  echo 首次运行，正在安装依赖...
  call npm install --no-audit --no-fund
)

echo.
echo 正在启动《求是》备考重点提炼站...
echo 浏览器将自动打开 http://127.0.0.1:5178
echo 关闭本窗口即停止服务。
echo.

start "" cmd /c "timeout /t 2 >nul & start http://127.0.0.1:5178"
node src/server.js

pause
