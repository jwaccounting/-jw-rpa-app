"""
agent_service.py - Windows Service wrapper สำหรับ JW RPA Agent
วางไว้ที่: E:/jw-rpa-app/agent/agent_service.py
"""
import sys
import os
import threading
import servicemanager
import socket
import win32event
import win32service
import win32serviceutil

# เพิ่ม path ของ agent
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

class JWRPAService(win32serviceutil.ServiceFramework):
    _svc_name_ = "JW-RPA-Agent"
    _svc_display_name_ = "JW RPA Agent"
    _svc_description_ = "JW RPA Agent - Express Accounting Import Service (Port 9999)"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.server = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.hWaitStop)
        if self.server:
            func = getattr(self.server, 'shutdown', None)
            if func:
                threading.Thread(target=func).start()

    def SvcDoRun(self):
        self.ReportServiceStatus(win32service.SERVICE_RUNNING)
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, '')
        )
        self.main()

    def main(self):
        # เปลี่ยน working directory ไปที่โฟลเดอร์ agent
        os.chdir(os.path.dirname(os.path.abspath(__file__)))

        # import และรัน Flask app จาก agent.py
        from license_checker import verify_license
        if not verify_license():
            servicemanager.LogErrorMsg("JW RPA Agent: License verification failed")
            return

        from agent import app
        # รัน Flask ใน thread
        def run_flask():
            app.run(host='127.0.0.1', port=9999, debug=False, use_reloader=False)

        flask_thread = threading.Thread(target=run_flask, daemon=True)
        flask_thread.start()

        # รอจนกว่าจะได้รับสัญญาณ stop
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)


if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(JWRPAService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(JWRPAService)
