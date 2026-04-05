'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { section: 'สมุดรายวัน GL' },
  { href: '/dashboard', label: 'หน้าหลัก', icon: 'grid', badge: null },
  { href: '/import/jv', label: 'JV — ทั่วไป', icon: 'doc', badge: 'พร้อม' },
  { href: '/import/pv', label: 'PV — จ่าย', icon: 'down', badge: 'พร้อม' },
  { href: '/import/rv', label: 'RV — รับ', icon: 'up', badge: 'พร้อม' },
  { href: '/import/sv', label: 'SV — ขาย', icon: 'chart', badge: 'พร้อม' },
  { href: '/import/bw', label: 'BW — ถอนเงิน', icon: 'bank', badge: 'พร้อม' },
  { section: 'สมุดรายวันซื้อ' },
  { href: '/import/uv', label: 'UV — ซื้อ', icon: 'cart', badge: 'พร้อม' },
  { section: 'ระบบ AR / AP' },
  { href: '#', label: 'INV — ใบแจ้งหนี้', icon: 'doc', badge: 'เร็วๆ นี้', disabled: true },
  { href: '#', label: 'RE — รับชำระหนี้', icon: 'arrow', badge: 'เร็วๆ นี้', disabled: true },
  { href: '#', label: 'RR — ระบบซื้อ', icon: 'box', badge: 'เร็วๆ นี้', disabled: true },
  { href: '#', label: 'PS — จ่ายชำระหนี้', icon: 'card', badge: 'เร็วๆ นี้', disabled: true },
  { section: 'สต็อก' },
  { href: '#', label: 'ST — สต็อก', icon: 'box', badge: 'เร็วๆ นี้', disabled: true },
  { section: 'จัดการ' },
  { href: '/history', label: 'ประวัติ', icon: 'clock', badge: null },
  { href: '/settings', label: 'ตั้งค่า', icon: 'gear', badge: null },
]

export default function Sidebar({ company = 'JW Accounting', daysLeft = 0 }) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: '215px', minWidth: '215px',
      background: '#f9fafb',
      borderRight: '1px solid #f0f0ee',
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflowY: 'auto',
      fontFamily: 'var(--font-sarabun, sans-serif)',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0ee' }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: '#111' }}>JW RPA</div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Express Accounting Import</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingBottom: '8px' }}>
        {NAV.map((item, i) => {
          if ('section' in item && !('href' in item)) {
            return (
              <div key={i} style={{
                padding: '10px 16px 3px',
                fontSize: '10px', color: '#aaa',
                fontWeight: 500, letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}>
                {item.section}
              </div>
            )
          }

          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href || '##'))
          const disabled = (item as any).disabled

          return (
            <Link
              key={i}
              href={(item as any).href || '#'}
              style={{
                display: 'flex', alignItems: 'center',
                gap: '7px', padding: '7px 16px',
                fontSize: '13px', textDecoration: 'none',
                color: disabled ? '#bbb' : active ? '#111' : '#666',
                fontWeight: active ? 500 : 400,
                background: active ? '#fff' : 'transparent',
                borderRight: active ? '2px solid #2563eb' : '2px solid transparent',
                pointerEvents: disabled ? 'none' : 'auto',
              }}
            >
              <span style={{ flex: 1 }}>{(item as any).label}</span>
              {(item as any).badge && (
                <span style={{
                  fontSize: '10px', padding: '1px 7px',
                  borderRadius: '99px', fontWeight: 500,
                  background: (item as any).badge === 'พร้อม' ? '#dcfce7' : '#fef9c3',
                  color: (item as any).badge === 'พร้อม' ? '#166534' : '#854d0e',
                }}>
                  {(item as any).badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ borderTop: '1px solid #f0f0ee', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '50%',
            background: '#dbeafe', color: '#1d4ed8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 500, flexShrink: 0,
          }}>
            JW
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 500 }}>{company}</div>
            <div style={{
              fontSize: '11px',
              color: daysLeft > 10 ? '#16a34a' : daysLeft > 3 ? '#d97706' : '#dc2626'
            }}>
              License: {daysLeft} วัน
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
