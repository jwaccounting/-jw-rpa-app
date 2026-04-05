// app/api/import/execute/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseExcel } from '@/lib/excel-parser'
import { checkLicense, incrementImportCount } from '@/lib/license'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { JournalType } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 })
    }

    const userId = session.user.id ?? ''

    // ตรวจ License อีกครั้งก่อน import จริง
    const license = await checkLicense(userId)
    if (!license.valid) {
      return NextResponse.json({ error: `License: ${license.reason}` }, { status: 403 })
    }

    const formData = await req.formData()
    const file  = formData.get('file')  as File
    const type  = formData.get('type')  as JournalType
    const sheet = formData.get('sheet') as string

    const buffer = Buffer.from(await file.arrayBuffer())
    const { preview, rawData } = parseExcel(buffer, sheet, type)

    // ส่งข้อมูลไปยัง Agent บน PC ลูกค้า
    const agentUrl = process.env.AGENT_URL // เช่น http://localhost:9999
    let successRows = 0
    let errorRows = 0

    if (agentUrl) {
      const agentRes = await fetch(`${agentUrl}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data: rawData }),
      })
      const agentData = await agentRes.json()
      successRows = agentData.success || 0
      errorRows   = agentData.error   || 0
    } else {
      // Dev mode — จำลองว่าสำเร็จ
      successRows = preview.totalVouchers
    }

    // บันทึก History
    await prisma.importHistory.create({
      data: {
        userId,
        type,
        fileName:    file.name,
        sheetName:   sheet,
        totalRows:   preview.totalVouchers,
        successRows,
        errorRows,
        status:      errorRows === 0 ? 'SUCCESS' : successRows > 0 ? 'PARTIAL' : 'FAILED',
        dbfPath:     process.env.DBF_PATH || 'Z:\\Aulgor',
      }
    })

    // เพิ่ม usage count
    await incrementImportCount(userId)

    return NextResponse.json({ success: successRows, error: errorRows })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
