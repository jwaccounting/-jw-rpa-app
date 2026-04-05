# ============================================================
# วางไฟล์นี้ที่: E:\jw-rpa-app\agent\license_checker.py
# Copyright (c) 2024 JW Accounting Co., Ltd.
# ============================================================

import subprocess
import hashlib
import requests
import json
import os
import sys
import ctypes
from datetime import datetime

# ---- แก้ค่าเหล่านี้ ----
SUPABASE_URL      = "https://hklwbvpasiukjxvrrkxb.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrbHdidnBhc2l1a2p4dnJya3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MDQyOTcsImV4cCI6MjA5MDM4MDI5N30.EQGlDfMs6HH3PwQ__Oo-Kc8Lzf47gSABUe90ttQWSGg"
AGENT_VERSION     = "1.0.0"

CACHE_FILE         = os.path.join(os.environ.get("TEMP", "C:\\Temp"), ".jwlic")
PING_FILE          = os.path.join(os.environ.get("TEMP", "C:\\Temp"), ".jwping")
CACHE_HOURS        = 24
OFFLINE_GRACE_DAYS = 7


def get_machine_id() -> str:
    try:
        result = subprocess.check_output(
            "wmic csproduct get uuid",
            shell=True, stderr=subprocess.DEVNULL
        ).decode("utf-8", errors="ignore").strip()
        for line in result.splitlines():
            line = line.strip()
            if line and line.upper() != "UUID":
                hashed = hashlib.sha256(line.upper().encode()).hexdigest()[:32].upper()
                return f"{hashed[:8]}-{hashed[8:16]}-{hashed[16:24]}-{hashed[24:32]}"
    except Exception:
        pass
    import platform
    fallback = f"{platform.node()}-{os.environ.get('USERNAME','')}"
    hashed = hashlib.sha256(fallback.encode()).hexdigest()[:32].upper()
    return f"{hashed[:8]}-{hashed[8:16]}-{hashed[16:24]}-{hashed[24:32]}"


def _check_online(machine_id: str) -> dict:
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        }
        url = (f"{SUPABASE_URL}/rest/v1/licenses"
               f"?machine_id=eq.{machine_id}"
               f"&select=customer_name,is_active,expire_date,plan")
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code != 200:
            return {"valid": False, "message": "Server Error"}
        data = res.json()
        if not data:
            _log(machine_id, "denied")
            return {"valid": False, "message": "เครื่องนี้ไม่ได้รับอนุญาต\nกรุณาติดต่อ JW Accounting"}
        lic = data[0]
        if not lic.get("is_active", False):
            _log(machine_id, "denied")
            return {"valid": False, "message": "License ถูกระงับ\nกรุณาติดต่อ JW Accounting"}
        if lic.get("expire_date"):
            exp = datetime.fromisoformat(lic["expire_date"].replace("Z", "+00:00"))
            if datetime.now(exp.tzinfo) > exp:
                _log(machine_id, "expired")
                return {"valid": False, "message": f"License หมดอายุ ({exp.strftime('%d/%m/%Y')})\nกรุณาติดต่อ JW Accounting"}
        _log(machine_id, "granted")
        return {"valid": True, "customer_name": lic.get("customer_name", ""), "plan": lic.get("plan", "standard")}
    except requests.exceptions.ConnectionError:
        return {"valid": None, "message": "offline"}
    except Exception as e:
        return {"valid": None, "message": str(e)}


def _save_cache(machine_id, result):
    try:
        with open(CACHE_FILE, "w") as f:
            json.dump({"machine_id": machine_id, "result": result, "cached_at": datetime.now().isoformat()}, f)
    except Exception:
        pass

def _load_cache(machine_id, max_hours=None, max_days=None):
    try:
        with open(CACHE_FILE) as f:
            c = json.load(f)
        if c.get("machine_id") != machine_id:
            return None
        elapsed = (datetime.now() - datetime.fromisoformat(c["cached_at"])).total_seconds()
        if max_hours and elapsed > max_hours * 3600:
            return None
        if max_days and elapsed > max_days * 86400:
            return None
        return c["result"]
    except Exception:
        return None


# ============================================================
# Step 2: Ping-home
# ============================================================
def _save_ping():
    try:
        with open(PING_FILE, "w") as f:
            json.dump({"last_ping": datetime.now().isoformat()}, f)
    except Exception:
        pass

def _get_days_since_last_ping() -> float:
    try:
        with open(PING_FILE) as f:
            data = json.load(f)
        last_ping = datetime.fromisoformat(data["last_ping"])
        return (datetime.now() - last_ping).total_seconds() / 86400
    except Exception:
        return 999

def _check_ping_grace() -> bool:
    days = _get_days_since_last_ping()
    if days <= OFFLINE_GRACE_DAYS:
        remaining = OFFLINE_GRACE_DAYS - days
        print(f"[LICENSE] Offline grace period: เหลืออีก {remaining:.1f} วัน")
        return True
    return False


def _log(machine_id, action):
    try:
        headers = {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            "Content-Type": "application/json"
        }
        requests.post(
            f"{SUPABASE_URL}/rest/v1/license_logs",
            headers=headers,
            json={"machine_id": machine_id, "action": action, "agent_ver": AGENT_VERSION},
            timeout=5
        )
    except Exception:
        pass

def _show_error(msg):
    try:
        ctypes.windll.user32.MessageBoxW(
            0,
            f"{msg}\n\nMachine ID: {get_machine_id()}",
            "JW Accounting - License Error",
            0x10
        )
    except Exception:
        print(f"[LICENSE ERROR] {msg}")


def verify_license() -> bool:
    machine_id = get_machine_id()

    # ตรวจ cache ก่อน (24 ชั่วโมง)
    cached = _load_cache(machine_id, max_hours=CACHE_HOURS)
    if cached and cached.get("valid"):
        print(f"[LICENSE] OK (cache) - {cached.get('customer_name','')}")
        return True

    print(f"[LICENSE] Checking... {machine_id}")
    result = _check_online(machine_id)

    if result["valid"] is True:
        _save_cache(machine_id, result)
        _save_ping()  # บันทึกเวลา ping สำเร็จ
        print(f"[LICENSE] GRANTED - {result.get('customer_name','')}")
        return True

    if result["valid"] is None:
        # Offline → ตรวจ ping grace period
        if _check_ping_grace():
            return True
        days = _get_days_since_last_ping()
        _show_error(
            f"ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้\n"
            f"ไม่ได้เชื่อมต่อมา {days:.0f} วันแล้ว (เกิน {OFFLINE_GRACE_DAYS} วัน)\n"
            f"กรุณาเชื่อมต่ออินเตอร์เน็ตเพื่อต่ออายุสิทธิ์"
        )
        return False

    _show_error(result.get("message", "ไม่ได้รับอนุญาต"))
    return False


def show_machine_id():
    mid = get_machine_id()
    try:
        ctypes.windll.user32.MessageBoxW(
            0,
            f"Machine ID ของเครื่องนี้:\n\n{mid}\n\nกรุณาแจ้ง Machine ID นี้ให้\nJW Accounting เพื่อลงทะเบียน",
            "JW Accounting - Machine ID",
            0x40
        )
    except Exception:
        print(f"Machine ID: {mid}")
    return mid


if __name__ == "__main__":
    if "--show-id" in sys.argv:
        show_machine_id()
    else:
        print(verify_license())
