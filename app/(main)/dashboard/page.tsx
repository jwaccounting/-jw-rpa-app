'use client'
import Link from 'next/link'

const READY = [
  { code: 'JV', name: 'สมุดรายวันทั่วไป', en: 'General Journal', desc: 'บันทึกการปรับปรุง ปิดบัญชี ทุกรายการทั่วไป', jnltyp: '05', tables: 'GLJNL+GLJNLIT', color: '#7c3aed', bg: '#ede9fe' },
  { code: 'PV', name: 'สมุดรายวันจ่าย', en: 'Payment Voucher', desc: 'บันทึกการจ่ายเงิน ค่าใช้จ่าย เงินเดือน ประกันสังคม', jnltyp: '01', tables: 'GLJNL+GLJNLIT', color: '#1d4ed8', bg: '#dbeafe' },
  { code: 'RV', name: 'สมุดรายวันรับ', en: 'Receipt Voucher', desc: 'บันทึกรับเงิน รายได้ค่าบริการ รับชำระลูกหนี้', jnltyp: '02', tables: 'GLJNL+GLJNLIT', color: '#0f766e', bg: '#ccfbf1' },
  { code: 'SV', name: 'สมุดรายวันขาย', en: 'Sales Voucher', desc: 'บันทึกรายได้จากการขายสินค้า/บริการ ทั้งจดและไม่จด VAT', jnltyp: '03', tables: 'GLJNL+GLJNLIT', color: '#15803d', bg: '#dcfce7' },
  { code: 'UV', name: 'สมุดรายวันซื้อ', en: 'Purchase Voucher', desc: 'บันทึกซื้อสินค้า/วัตถุดิบ ทั้งจดและไม่จด VAT', jnltyp: '??', tables: 'GLJNL+GLJNLIT', color: '#b45309', bg: '#fef3c7' },
  { code: 'BW', name: 'ถอนเงินสดจากธนาคาร', en: 'Bank Withdrawal', desc: 'ถอนเงิน S1/F1/C1 เชื่อมกับ BKTRN + GLJNL', jnltyp: '00', tables: 'GLJNL+GLJNLIT+BKTRN', color: '#b45309', bg: '#fef3c7' },
]

const COMING = [
  { code: 'INV', name: 'ใบแจ้งหนี้ / Invoice', desc: 'ออกใบแจ้งหนี้ลูกหนี้ เชื่อมกับ ARTRN', tables: 'ARTRN+STCRD+GLJNL' },
  { code: 'RE', name: 'รับชำระหนี้', desc: 'บันทึกรับชำระจากลูกหนี้ ตัดยอด AR อัตโนมัติ', tables: 'ARTRN+GLJNL' },
  { code: 'RR', name: 'ระบบซื้อ AP', desc: 'บันทึกซื้อสินค้า เชื่อมกับเจ้าหนี้ AP + สต็อก', tables: 'APTRN+GLJNL' },
  { code: 'PS', name: 'จ่ายชำระหนี้', desc: 'บันทึกจ่ายชำระเจ้าหนี้ ตัดยอด AP อัตโนมัติ', tables: 'APTRN+GLJNL' },
  { code: 'ST', name: 'นำเข้าสต็อก', desc: 'นำเข้าข้อมูลสินค้า ปรับยอดสต็อก STMAS + STTRN', tables: 'STMAS+STTRN' },
]

const s: Record<string, React.CSSProperties> = {
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '24px' },
  statCard: { background: '#f9fafb', borderRadius: '10px', padding: '14px 16px' },
  statLabel: { fontSize: '11px', color: '#888', marginBottom: '4px' },
  statVal: { fontSize: '24px', fontWeight: 500, color: '#111' },
  statSub: { fontSize: '11px', color: '#aaa', marginTop: '2px' },
  sectionTitle: { fontSize: '13px', fontWeight: 500, color: '#444', marginBottom: '12px' },
  modGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '24px' },
  modCard: {
    border: '1px solid #ebebeb', borderRadius: '12px', padding: '14px',
    cursor: 'pointer', background: '#fff', textDecoration: 'none', display: 'block',
    transition: 'border-color 0.15s',
  },
  comingCard: {
    border: '1px dashed #e0e0e0', borderRadius: '12px', padding: '14px',
    background: '#fff', opacity: 0.55,
  },
}

export default function DashboardPage() {
  return (
    <div style={{ padding: '24px', fontFamily: 'var(--font-sarabun, sans-serif)' }}>

      {/* Stats */}
      <div style={s.grid4}>
        {[
          { label: 'วันนี้นำเข้า', val: '—', sub: 'รายการ' },
          { label: 'เดือนนี้', val: '—', sub: 'ทุกประเภท' },
          { label: 'โมดูลพร้อม', val: '6', sub: 'จาก 11 โมดูล' },
          { label: 'License', val: '—', sub: 'วันคงเหลือ' },
        ].map((s2, i) => (
          <div key={i} style={s.statCard}>
            <div style={s.statLabel}>{s2.label}</div>
            <div style={s.statVal}>{s2.val}</div>
            <div style={s.statSub}>{s2.sub}</div>
          </div>
        ))}
      </div>

      {/* Ready */}
      <div style={s.sectionTitle}>โมดูลพร้อมใช้งาน ({READY.length} โมดูล)</div>
      <div style={s.modGrid}>
        {READY.map(m => (
          <Link key={m.code} href={`/import/${m.code.toLowerCase()}`} style={s.modCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 500, padding: '2px 8px',
                borderRadius: '99px', background: m.bg, color: m.color,
              }}>{m.code}</span>
              <span style={{
                fontSize: '10px', padding: '2px 7px', borderRadius: '99px',
                background: '#dcfce7', color: '#166534', fontWeight: 500,
              }}>พร้อม</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#111', marginBottom: '4px' }}>{m.name}</div>
            <div style={{ fontSize: '12px', color: '#555', lineHeight: 1.5, marginBottom: '10px' }}>
              {m.en} — {m.desc}
            </div>
            <div style={{ fontSize: '11px', color: '#aaa', fontFamily: 'monospace' }}>
              JNLTYP={m.jnltyp} · {m.tables}
            </div>
          </Link>
        ))}
      </div>

      {/* Coming */}
      <div style={s.sectionTitle}>กำลังพัฒนา ({COMING.length} โมดูล)</div>
      <div style={s.modGrid}>
        {COMING.map(m => (
          <div key={m.code} style={s.comingCard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{
                fontSize: '11px', fontWeight: 500, padding: '2px 8px',
                borderRadius: '99px', background: '#f3f4f6', color: '#666',
              }}>{m.code}</span>
              <span style={{
                fontSize: '10px', padding: '2px 7px', borderRadius: '99px',
                background: '#fef9c3', color: '#854d0e', fontWeight: 500,
              }}>เร็วๆ นี้</span>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: '#555', marginBottom: '4px' }}>{m.name}</div>
            <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.5, marginBottom: '10px' }}>{m.desc}</div>
            <div style={{ fontSize: '11px', color: '#ccc', fontFamily: 'monospace' }}>{m.tables}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
