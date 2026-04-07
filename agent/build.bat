@echo off
echo ========================================
echo  JW RPA Agent - Build EXE
echo ========================================
cd /d "E:\jw-rpa-app\agent"

echo [1/3] ติดตั้ง PyInstaller...
pip install pyinstaller --quiet

echo [2/3] Build agent.exe ...
pyinstaller ^
  --onefile ^
  --noconsole ^
  --name "jw-rpa-agent" ^
  --add-data "config.ini;." ^
  --hidden-import "dbf" ^
  --hidden-import "flask_cors" ^
  --hidden-import "openpyxl" ^
  --hidden-import "requests" ^
  --hidden-import "license_checker" ^
  --hidden-import "import_in" ^
  agent.py

echo [3/3] เตรียมโฟลเดอร์แจกจ่าย...
if not exist "dist\JW-RPA-Setup" mkdir "dist\JW-RPA-Setup"
copy "dist\jw-rpa-agent.exe" "dist\JW-RPA-Setup\jw-rpa-agent.exe"
copy "config.ini"             "dist\JW-RPA-Setup\config.ini"
copy "install.bat"            "dist\JW-RPA-Setup\install.bat"

echo.
echo ========================================
echo  เสร็จแล้ว! โฟลเดอร์ที่แจกจ่ายได้:
echo  E:\jw-rpa-app\agent\dist\JW-RPA-Setup\
echo ========================================
pause
