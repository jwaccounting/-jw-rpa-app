'use client'
import Sidebar from '@/components/layout/Sidebar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#fff' }}>
      <Sidebar company="JW Accounting" daysLeft={19} />
      <main style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        {children}
      </main>
    </div>
  )
}
