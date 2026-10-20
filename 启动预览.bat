@echo off
chcp 65001 >nul
cd /d F:\web\personal-site
echo.
echo 正在构建网站，请稍等...
call npm run build
if errorlevel 1 (
  echo.
  echo 构建失败。把窗口里的红色错误发给 AI。
  pause
  exit /b 1
)
echo.
echo 构建完成，正在打开预览...
start "EXPLODINGTNT 网站预览" cmd /k "npm run preview -- --port 4321 --host 127.0.0.1"
timeout /t 4 >nul
start "" "http://127.0.0.1:4321/"
echo.
echo 预览地址：http://127.0.0.1:4321/
echo 后台地址：http://127.0.0.1:4321/admin/
echo.
echo 预览窗口不要关；关掉那个黑窗口，网站就停了。
pause
