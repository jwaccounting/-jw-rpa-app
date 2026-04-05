# JW RPA — Express Accounting Import

ระบบนำเข้าข้อมูลบัญชีจาก Excel สู่ Express Accounting (BIT9)
ผ่าน Web App + Agent บน PC ลูกค้า

## โครงสร้างโปรเจกต์

```
jw-rpa-app/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Layout หลัก
│   ├── dashboard/page.tsx      # หน้าหลัก/Dashboard
│   ├── import/[type]/page.tsx  # หน้านำเข้า (PV/RV/SV/UV/JV/BW)
│   ├── history/page.tsx        # ประวัติการนำเข้า
│   ├── settings/page.tsx       # ตั้งค่าระบบ
│   ├── login/page.tsx          # หน้า Login
│   └── api/
│       ├── auth/               # NextAuth
│       ├── import/
│       │   ├── preview/        # ดูตัวอย่างก่อนนำเข้า
│       │   └── execute/        # นำเข้าจริง (ส่งไป Agent)
│       ├── license/            # ตรวจสอบ/จัดการ License
│       └── history/            # ดึงประวัติ
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx         # Sidebar navigation
│   ├── ui/                     # Reusable UI components
│   └── modules/                # Module-specific components
├── lib/
│   ├── prisma.ts               # Prisma client
│   ├── auth.ts                 # NextAuth config
│   ├── license.ts              # License check/management
│   └── excel-parser.ts         # อ่าน Excel → data
├── types/index.ts              # TypeScript types + MODULES config
├── prisma/schema.prisma        # Database schema
├── agent/
│   └── agent.py               # Python Agent (ติดตั้งบน PC ลูกค้า)
├── .env.example                # Environment variables template
└── package.json
```

## เริ่มต้นใช้งาน

### 1. ติดตั้ง Dependencies

```bash
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
cp .env.example .env.local
# แก้ค่าใน .env.local
```

### 3. ตั้งค่า Database (Supabase)

```bash
npx prisma generate
npx prisma db push
```

### 4. รัน Dev Server

```bash
npm run dev
```

### 5. ติดตั้ง Agent บน PC ลูกค้า

```bash
cd agent
pip install flask dbf
python agent.py
```

หรือ build เป็น .exe:
```bash
pip install pyinstaller
pyinstaller --onefile agent.py
```

## Module JNLTYP Reference

| Module | JNLTYP | DBF Tables              |
|--------|--------|-------------------------|
| JV     | 05     | GLJNL + GLJNLIT        |
| PV     | 01     | GLJNL + GLJNLIT        |
| RV     | 02     | GLJNL + GLJNLIT        |
| SV     | 03     | GLJNL + GLJNLIT        |
| UV     | ??     | GLJNL + GLJNLIT (ต้องทดสอบ) |
| BW     | 00     | GLJNL + GLJNLIT + BKTRN |

## Deploy

### Web App → Vercel
```bash
# Push to GitHub แล้ว connect กับ Vercel
git push origin main
```

### Agent → PC ลูกค้า
- Build .exe และส่งให้ลูกค้าติดตั้ง
- Agent จะรันที่ port 9999 เสมอ
- Web App ส่งข้อมูลผ่าน localhost:9999
