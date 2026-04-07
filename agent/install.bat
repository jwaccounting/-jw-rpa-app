@echo off
echo ========================================
echo  JW RPA Agent - ติดตั้ง
echo ========================================

:: ตรวจสอบ Admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo กรุณารันในฐานะ Administrator
    echo คลิกขวา install.bat แล้วเลือก "Run as administrator"
    pause
    exit /b 1
)

:: สร้างโฟลเดอร์ติดตั้ง
set INSTALL_DIR=C:\JW-RPA
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: copy ไฟล์
echo กำลัง copy ไฟล์...
copy /Y "jw-rpa-agent.exe" "%INSTALL_DIR%\jw-rpa-agent.exe"

:: copy config.ini ถ้ายังไม่มี (ไม่ทับของเดิม)
if not exist "%INSTALL_DIR%\config.ini" (
    copy /Y "config.ini" "%INSTALL_DIR%\config.ini"
    echo สร้าง config.ini ใหม่
) else (
    echo ใช้ config.ini เดิม (ไม่ทับ)
)

:: ลง Task Scheduler
echo กำลังลงทะเบียน Task Scheduler...
schtasks /delete /tn "JW-RPA-Agent" /f >nul 2>&1
schtasks /create ^
  /tn "JW-RPA-Agent" ^
  /tr "%INSTALL_DIR%\jw-rpa-agent.exe" ^
  /sc ONLOGON ^
  /ru "%USERNAME%" ^
  /rl HIGHEST ^
  /f

:: รัน agent ทันที
echo กำลังเริ่ม Agent...
start "" "%INSTALL_DIR%\jw-rpa-agent.exe"

echo.
echo ========================================
echo  ติดตั้งเสร็จแล้ว!
echo  Agent รันอยู่เบื้องหลังแล้ว
echo.
echo  *** สำคัญ ***
echo  แก้ DBF Path ได้ที่:
echo  %INSTALL_DIR%\config.ini
echo  หรือเปลี่ยนผ่านหน้าเว็บได้เลย
echo ========================================
pause
