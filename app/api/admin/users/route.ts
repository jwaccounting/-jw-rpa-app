// app/api/admin/users/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    include: { license: true },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    company: u.company,
    license: u.license ? {
      key: u.license.key,
      expireDate: u.license.expireDate.toISOString(),
      isActive: u.license.isActive,
      daysLeft: Math.max(0, Math.ceil((u.license.expireDate.getTime() - now.getTime()) / 86400000)),
      usedImports: u.license.usedImports,
      maxImports: u.license.maxImports,
    } : null,
  }))

  return NextResponse.json({ users: result })
}
