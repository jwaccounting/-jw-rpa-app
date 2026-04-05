import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import Providers from '@/components/providers'
const sarabun = Sarabun({ subsets: ['thai','latin'], weight: ['300','400','500','600'], variable: '--font-sarabun' })
export const metadata: Metadata = { title: 'JW RPA', description: 'Express Accounting Import' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='th'>
      <body className={sarabun.variable}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}