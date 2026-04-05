// app/api/history/route.ts
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const records = await prisma.importHistory.findMany({
    where: { userId: session.user.id },
    orderBy: { importedAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ records })
}
