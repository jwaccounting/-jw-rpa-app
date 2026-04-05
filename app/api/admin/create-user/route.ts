// app/api/admin/create-user/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateLicenseKey } from '@/lib/license'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { addDays } from 'date-fns'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { email, name, company, password, days, maxImports } = await req.json()

  const hashed = await bcrypt.hash(password, 10)
  const expireDate = addDays(new Date(), parseInt(days) || 30)
  const key = generateLicenseKey()

  const user = await prisma.user.create({
    data: {
      email, name, company,
      password: hashed,
      license: {
        create: {
          key,
          expireDate,
          maxImports: maxImports ? parseInt(maxImports) : null,
        }
      }
    }
  })

  return NextResponse.json({ ok: true, key })
}
