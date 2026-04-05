// types/index.ts

export type JournalType = 'JV' | 'PV' | 'RV' | 'SV' | 'UV' | 'BW' | 'INV' | 'RE' | 'RR' | 'PS' | 'ST'

export interface ModuleConfig {
  code: JournalType
  name: string
  nameTh: string
  desc: string
  jnltyp: string
  tables: string[]
  status: 'ready' | 'coming'
  color: string
  pills: string[]
}

export const MODULES: ModuleConfig[] = [
  {
    code: 'JV',
    name: 'General Journal',
    nameTh: 'สมุดรายวันทั่วไป',
    desc: 'บันทึกรายการปรับปรุง ปิดบัญชี ทุกรายการทั่วไป',
    jnltyp: '05',
    tables: ['GLJNL', 'GLJNLIT'],
    status: 'ready',
    color: 'purple',
    pills: ['รายการปรับปรุง', 'ปิดบัญชี', 'รายการอื่นๆ'],
  },
  {
    code: 'PV',
    name: 'Payment Voucher',
    nameTh: 'สมุดรายวันจ่าย',
    desc: 'บันทึกการจ่ายเงิน ค่าใช้จ่าย เงินเดือน ประกันสังคม',
    jnltyp: '01',
    tables: ['GLJNL', 'GLJNLIT'],
    status: 'ready',
    color: 'blue',
    pills: ['บันทึกบัญชี จดVAT', 'บันทึกบัญชี ไม่จดVAT', 'Payroll SSO'],
  },
  {
    code: 'RV',
    name: 'Receipt Voucher',
    nameTh: 'สมุดรายวันรับ',
    desc: 'บันทึกรับเงิน รายได้ค่าบริการ รับชำระลูกหนี้',
    jnltyp: '02',
    tables: ['GLJNL', 'GLJNLIT'],
    status: 'ready',
    color: 'teal',
    pills: ['รับเงินค่าบริการ', 'รับชำระอื่นๆ'],
  },
  {
    code: 'SV',
    name: 'Sales Voucher',
    nameTh: 'สมุดรายวันขาย',
    desc: 'บันทึกรายได้จากการขายสินค้า/บริการ',
    jnltyp: '03',
    tables: ['GLJNL', 'GLJNLIT'],
    status: 'ready',
    color: 'green',
    pills: ['SV จดVAT', 'SV ไม่จดVAT'],
  },
  {
    code: 'UV',
    name: 'Purchase Voucher',
    nameTh: 'สมุดรายวันซื้อ',
    desc: 'บันทึกซื้อสินค้า/วัตถุดิบ ทั้งจดและไม่จด VAT',
    jnltyp: '??',  // ต้องทดสอบกับ Express
    tables: ['GLJNL', 'GLJNLIT'],
    status: 'ready',
    color: 'amber',
    pills: ['รายการซื้อ จดVAT', 'รายการซื้อ ไม่จดVAT'],
  },
  {
    code: 'BW',
    name: 'Bank Withdrawal',
    nameTh: 'ถอนเงินสดจากธนาคาร',
    desc: 'ถอนเงิน S1/F1/C1 เชื่อมกับ BKTRN + GLJNL',
    jnltyp: '00',
    tables: ['GLJNL', 'GLJNLIT', 'BKTRN'],
    status: 'ready',
    color: 'amber',
    pills: ['รายการถอนเงิน S1', 'รายการถอนเงิน F1', 'รายการถอนเงิน C1'],
  },
  {
    code: 'INV',
    name: 'Invoice',
    nameTh: 'ใบแจ้งหนี้',
    desc: 'ออกใบแจ้งหนี้ลูกหนี้ เชื่อมกับ ARTRN',
    jnltyp: '??',
    tables: ['ARTRN', 'STCRD', 'GLJNL'],
    status: 'coming',
    color: 'coral',
    pills: [],
  },
  {
    code: 'RE',
    name: 'Receipt (AR)',
    nameTh: 'รับชำระหนี้',
    desc: 'บันทึกรับชำระจากลูกหนี้ ตัดยอด AR อัตโนมัติ',
    jnltyp: '??',
    tables: ['ARTRN', 'GLJNL'],
    status: 'coming',
    color: 'coral',
    pills: [],
  },
  {
    code: 'RR',
    name: 'Purchase (AP)',
    nameTh: 'ระบบซื้อ AP',
    desc: 'บันทึกซื้อสินค้า เชื่อมกับเจ้าหนี้ AP + สต็อก',
    jnltyp: '??',
    tables: ['APTRN', 'GLJNL'],
    status: 'coming',
    color: 'coral',
    pills: [],
  },
  {
    code: 'PS',
    name: 'Payment (AP)',
    nameTh: 'จ่ายชำระหนี้',
    desc: 'บันทึกจ่ายชำระเจ้าหนี้ ตัดยอด AP อัตโนมัติ',
    jnltyp: '??',
    tables: ['APTRN', 'GLJNL'],
    status: 'coming',
    color: 'coral',
    pills: [],
  },
  {
    code: 'ST',
    name: 'Stock Import',
    nameTh: 'นำเข้าสต็อก',
    desc: 'นำเข้าข้อมูลสินค้า ปรับยอดสต็อก STMAS + STTRN',
    jnltyp: '-',
    tables: ['STMAS', 'STTRN'],
    status: 'coming',
    color: 'coral',
    pills: [],
  },
]

export interface ImportRow {
  docno: string
  date: string
  acct: string
  acctName: string
  desc: string
  debit: number
  credit: number
}

export interface ImportPreview {
  vouchers: {
    docno: string
    date: string
    desc: string
    lines: number
    debitTotal: number
    creditTotal: number
  }[]
  totalVouchers: number
  totalRows: number
}

export interface LicenseInfo {
  isActive: boolean
  expireDate: string
  daysLeft: number
  usedImports: number
  maxImports: number | null
}
