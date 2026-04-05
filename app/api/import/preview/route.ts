// app/api/import/preview/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseExcel } from '@/lib/excel-parser'
import { checkLicense } from '@/lib/license'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import type { JournalType } from '@/types'

export async function POST(req: NextRequest) {
  try {
    // ตรวจสอบ session
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
    }

    const userId = session.user.id ?? ''

    // ตรวจสอบ License
    const license = await checkLicense(userId)
    if (!license.valid) {
      return NextResponse.json({ error: `License: ${license.reason}` }, { status: 403 })
    }

    const formData = await req.formData()
    const file  = formData.get('file')  as File
    const type  = formData.get('type')  as JournalType
    const sheet = formData.get('sheet') as string

    if (!file || !type) {
      return NextResponse.json({ error: 'กรุณาเลือกไฟล์และประเภท' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { preview } = parseExcel(buffer, sheet, type)

    return NextResponse.json({ preview, license })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
