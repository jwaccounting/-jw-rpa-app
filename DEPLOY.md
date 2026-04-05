# DEPLOY.md — คู่มือ Deploy ทีละขั้นตอน

## ขั้นตอนที่ 1 — ตั้งค่า Database (Supabase ฟรี)

1. ไปที่ https://supabase.com → สร้าง project ใหม่
2. ไปที่ Settings → Database → Connection String
3. Copy "URI" มาใส่ใน .env.local เป็น DATABASE_URL

## ขั้นตอนที่ 2 — ตั้งค่า Project

```bash
# Clone / extract project
cd jw-rpa-app

# ติดตั้ง packages
npm install

# สร้าง .env.local
cp .env.example .env.local

# แก้ค่าใน .env.local:
# DATABASE_URL = จาก Supabase
# NEXTAUTH_SECRET = รหัสสุ่มใดก็ได้ (เช่น openssl rand -base64 32)
# NEXTAUTH_URL = https://your-app.vercel.app (แก้หลัง deploy)

# สร้าง Database tables
npx prisma generate
npx prisma db push

# สร้าง Admin user (รันครั้งแรกครั้งเดียว)
node scripts/seed-admin.js
```

## ขั้นตอนที่ 3 — Deploy ขึ้น Vercel

```bash
# ติดตั้ง Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

หรือ push ไป GitHub แล้ว connect กับ Vercel ที่ https://vercel.com

**Environment Variables บน Vercel:**
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL` (ใส่ URL จริงของ Vercel)

## ขั้นตอนที่ 4 — ส่ง Agent ให้ลูกค้า

```bash
cd agent

# ติดตั้ง
pip install -r requirements.txt pyinstaller

# Build .exe
pyinstaller --onefile --name "JW-RPA-Agent" agent.py

# ไฟล์อยู่ที่: dist/JW-RPA-Agent.exe
```

**วิธีติดตั้งที่ลูกค้า:**
1. Copy `JW-RPA-Agent.exe` ไปวางที่ PC ลูกค้า
2. ดับเบิ้ลคลิกรัน (จะเห็น CMD window แสดง "เปิดรับคำสั่ง...")
3. ถ้าต้องการให้รันอัตโนมัติตอนเปิดเครื่อง: สร้าง Shortcut ไว้ใน Startup folder

## ขั้นตอนที่ 5 — สร้างลูกค้า (Admin)

1. เปิด Web App → Login ด้วย Admin account
2. ไปที่ `/admin`
3. กรอกข้อมูลลูกค้า เลือกจำนวนวัน
4. กด "สร้างผู้ใช้ + License"
5. แจ้ง email/password ให้ลูกค้า

## สรุป Flow การทำงาน

```
ลูกค้าเปิด Browser
    ↓
Login ด้วย email/password
    ↓
ระบบตรวจ License (วันหมดอายุ)
    ↓ ถ้าผ่าน
อัปโหลด Excel → เลือกประเภท
    ↓
Web App (Vercel) แปลง Excel → DBF data
    ↓
ส่งข้อมูลไปยัง Agent บน PC ลูกค้า
    ↓
Agent เขียนลง Z:\Aulgor\GLJNL.DBF
    ↓
ลูกค้าเปิด Express → เห็นข้อมูล
```
