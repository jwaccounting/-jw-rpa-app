// lib/excel-parser.ts
// อ่าน Excel และแปลงเป็น ImportPreview + rows สำหรับส่งไปยัง Agent

import * as XLSX from 'xlsx'
import type { JournalType, ImportPreview } from '@/types'

const ENCODING_MAP: Record<JournalType, {
  colDate: number
  colDocno: number
  colAcct: number
  colDesc: number
  colDebit: number
  colCredit: number
  rowStart: number
}> = {
  JV: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  PV: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  RV: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  SV: { colDate:2, colDocno:1, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  UV: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  BW: { colDate:1, colDocno:2, colAcct:-1, colDesc:3, colDebit:-1, colCredit:-1, rowStart:1 },
  INV: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  RE: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  RR: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  PS: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
  ST: { colDate:1, colDocno:2, colAcct:3, colDesc:5, colDebit:6, colCredit:7, rowStart:1 },
}

export function parseExcel(buffer: Buffer, sheetName: string, type: JournalType): {
  preview: ImportPreview
  rawData: any[]
} {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(`ไม่พบ Sheet "${sheetName}" ในไฟล์ Excel\nSheet ที่มี: ${wb.SheetNames.join(', ')}`)
  }

  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })

  const cfg = ENCODING_MAP[type]
  const pvs: Record<string, any> = {}
  let curDocno = ''
  let curDate = ''
  let curDesc = ''

  for (let i = cfg.rowStart; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.length === 0) continue

    const acct = row[cfg.colAcct]
    if (!acct || String(acct).trim() === '') continue

    const docno = row[cfg.colDocno]
    if (docno && String(docno).trim() !== '') {
      curDocno = String(docno).trim()
      curDate  = String(row[cfg.colDate] || '').trim()
      curDesc  = String(row[cfg.colDesc] || '').trim()
      if (!pvs[curDocno]) {
        pvs[curDocno] = { docno: curDocno, date: curDate, desc: curDesc, lines: [] }
      }
    }

    if (!curDocno) continue

    const debit  = parseFloat(String(row[cfg.colDebit]  || '0').replace(/,/g, '')) || 0
    const credit = parseFloat(String(row[cfg.colCredit] || '0').replace(/,/g, '')) || 0
    const desc   = String(row[cfg.colDesc] || curDesc).trim()

    pvs[curDocno].lines.push({
      acct:   String(acct).trim(),
      desc,
      debit,
      credit,
    })
  }

  const vouchers = Object.values(pvs).map((pv: any) => ({
    docno: pv.docno,
    date: pv.date,
    desc: pv.desc,
    lines: pv.lines.length,
    debitTotal:  pv.lines.reduce((s: number, l: any) => s + l.debit, 0),
    creditTotal: pv.lines.reduce((s: number, l: any) => s + l.credit, 0),
  }))

  const totalRows = Object.values(pvs).reduce((s: number, pv: any) => s + pv.lines.length, 0)

  return {
    preview: { vouchers, totalVouchers: vouchers.length, totalRows },
    rawData: Object.values(pvs),
  }
}
