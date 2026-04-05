'use client'
// app/history/page.tsx

import { useEffect, useState } from 'react'

interface HistoryRecord {
  id: string
  type: string
  fileName: string
  sheetName: string
  totalRows: number
  successRows: number
  errorRows: number
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  importedAt: string
}

const statusStyle = {
  SUCCESS: 'bg-green-50 text-green-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  FAILED:  'bg-red-50 text-red-700',
}
const statusLabel = { SUCCESS: 'สำเร็จ', PARTIAL: 'บางส่วน', FAILED: 'ล้มเหลว' }

const typePill: Record<string, string> = {
  JV: 'bg-purple-100 text-purple-800',
  PV: 'bg-blue-100 text-blue-800',
  RV: 'bg-teal-100 text-teal-800',
  SV: 'bg-green-100 text-green-800',
  UV: 'bg-amber-100 text-amber-800',
  BW: 'bg-orange-100 text-orange-800',
}

export default function HistoryPage() {
  const [records, setRecords]   = useState<HistoryRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('ALL')

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(d => { setRecords(d.records || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const types = ['ALL', 'JV', 'PV', 'RV', 'SV', 'UV', 'BW']
  const filtered = filter === 'ALL' ? records : records.filter(r => r.type === filter)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-[18px] font-medium">ประวัติการนำเข้า</h1>
        <div className="flex gap-1.5">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={[
                'px-3 py-1 rounded-full text-[12px] transition-colors',
                filter === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
              ].join(' ')}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">กำลังโหลด...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-[14px]">ยังไม่มีประวัติการนำเข้า</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-[11px]">เวลา</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-[11px]">ประเภท</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-[11px]">ไฟล์</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-[11px]">Sheet</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium text-[11px]">รายการ</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium text-[11px]">สำเร็จ</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-[11px]">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rec, i) => (
                <tr key={rec.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-[12px] whitespace-nowrap">
                    {new Date(rec.importedAt).toLocaleString('th-TH', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${typePill[rec.type] || 'bg-gray-100 text-gray-600'}`}>
                      {rec.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">{rec.fileName}</td>
                  <td className="px-4 py-3 text-gray-500">{rec.sheetName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{rec.totalRows}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{rec.successRows}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${statusStyle[rec.status]}`}>
                      {statusLabel[rec.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
