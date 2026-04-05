// lib/license.ts
import { prisma } from './prisma'

export async function checkLicense(userId: string) {
  const license = await prisma.license.findUnique({
    where: { userId },
  })

  if (!license) {
    return { valid: false, reason: 'ไม่พบ License' }
  }

  if (!license.isActive) {
    return { valid: false, reason: 'License ถูกระงับ' }
  }

  const now = new Date()
  if (now > license.expireDate) {
    return { valid: false, reason: 'License หมดอายุแล้ว' }
  }

  if (license.maxImports !== null && license.usedImports >= license.maxImports) {
    return { valid: false, reason: 'ใช้งานครบจำนวนครั้งที่กำหนด' }
  }

  const daysLeft = Math.ceil(
    (license.expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )

  return {
    valid: true,
    daysLeft,
    expireDate: license.expireDate.toISOString(),
    usedImports: license.usedImports,
    maxImports: license.maxImports,
  }
}

export async function incrementImportCount(userId: string) {
  await prisma.license.update({
    where: { userId },
    data: { usedImports: { increment: 1 } },
  })
}

export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segments = [4, 4, 4, 4]
  return segments
    .map(len => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join(''))
    .join('-')
  // ตัวอย่าง: JWRP-A7K2-XM9N-PQ4T
}
