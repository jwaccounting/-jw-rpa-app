// app/api/admin/extend-license/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { addDays } from 'date-fns'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const { userId, days } = await req.json()
  const lic = await prisma.license.findUnique({ where: { userId } })
  if (!lic) return NextResponse.json({ error: 'ไม่พบ license' }, { status: 404 })

  const base = lic.expireDate > new Date() ? lic.expireDate : new Date()
  await prisma.license.update({
    where: { userId },
    data: { expireDate: addDays(base, days), isActive: true },
  })
  return NextResponse.json({ ok: true })
}
