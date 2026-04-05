'use client'
// app/import/[type]/page.tsx

import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MODULES } from '@/types'
import type { ImportPreview } from '@/types'

export default function ImportPage() {
  const params = useParams()
  const type = (params?.type as string || 'pv').toUpperCase()
  const module = MODULES.find(m => m.code === type)

  const [selectedPill, setSelectedPill] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; error: number } | null>(null)
  const [error, setError] = useState('')

  if (!module || module.status === 'coming') {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        โมดูลนี้อยู่ระหว่างพัฒนา
      </div>
    )
  }

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setPreview(null)
    setResult(null)
    setError('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', f)
      formData.append('type', type)
      formData.append('sheet', module.pills[selectedPill] || '')

      const res = await fetch('/api/import/preview', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด')
      setPreview(data.preview)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [type, selectedPill, module.pills])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  const handleImport = async () => {
    if (!file || !preview) return
    setImporting(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      formData.append('sheet', module.pills[selectedPill] || '')

      const res = await fetch('/api/import/execute', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด')
      setResult({ success: data.success, error: data.error })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const colorMap: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-800',
    blue:   'bg-blue-100 text-blue-800',
    teal:   'bg-teal-100 text-teal-800',
    green:  'bg-green-100 text-green-800',
    amber:  'bg-amber-100 text-amber-800',
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <span className={`text-[13px] font-medium px-3 py-1 rounded-full ${colorMap[module.color] || colorMap.blue}`}>
          {module.code}
        </span>
        <div>
          <h1 className="text-[18px] font-medium">{module.nameTh}</h1>
          <p className="text-[13px] text-gray-500">{module.desc}</p>
        </div>
      </div>

      {/* Step 1 — เลือก Sheet */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-[13px] font-medium mb-3">1. เลือกประเภทข้อมูล</h2>
        <div className="flex gap-2 flex-wrap">
          {module.pills.map((p, i) => (
            <button
              key={i}
              onClick={() => { setSelectedPill(i); setPreview(null); setFile(null) }}
              className={[
                'border rounded-full px-4 py-1.5 text-[12px] transition-colors',
                selectedPill === i
                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium border-[1.5px]'
                  : 'border-gray-200 text-gray-500 hover:border-gray-400',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Sheet name ที่ระบบจะอ่าน: <span className="font-mono text-gray-600">"{module.pills[selectedPill]}"</span>
        </p>
      </div>

      {/* Step 2 — อัปโหลดไฟล์ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-[13px] font-medium mb-3">2. อัปโหลดไฟล์ Excel</h2>
        <div
          className={[
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50',
          ].join(' ')}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {loading ? (
            <p className="text-gray-500 text-[13px]">กำลังวิเคราะห์ไฟล์...</p>
          ) : file ? (
            <div>
              <p className="font-medium text-green-700 text-[13px]">{file.name}</p>
              <p className="text-[11px] text-green-600 mt-1">
                {preview ? `พบ ${preview.totalVouchers} รายการ ${preview.totalRows} บรรทัด` : 'วิเคราะห์เสร็จแล้ว'}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-gray-500 text-[13px]">คลิกหรือลาก Excel มาวางที่นี่</p>
              <p className="text-[11px] text-gray-400 mt-1">.xlsx, .xlsm</p>
            </div>
          )}
        </div>
        {error && <p className="text-[12px] text-red-600 mt-2 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      </div>

      {/* Step 3 — Preview */}
      {preview && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
          <h2 className="text-[13px] font-medium mb-3">
            3. ตรวจสอบข้อมูลก่อนนำเข้า ({preview.totalVouchers} รายการ)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">เลขที่</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">วันที่</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">รายการ</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">เดบิต</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">เครดิต</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">บรรทัด</th>
                </tr>
              </thead>
              <tbody>
                {preview.vouchers.slice(0, 10).map((v, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-gray-700">{v.docno}</td>
                    <td className="py-2 px-3 text-gray-500">{v.date}</td>
                    <td className="py-2 px-3 text-gray-700 max-w-[200px] truncate">{v.desc}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{v.debitTotal.toLocaleString('th-TH', {minimumFractionDigits:2})}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{v.creditTotal.toLocaleString('th-TH', {minimumFractionDigits:2})}</td>
                    <td className="py-2 px-3 text-right text-gray-500">{v.lines}</td>
                  </tr>
                ))}
                {preview.vouchers.length > 10 && (
                  <tr>
                    <td colSpan={6} className="py-2 px-3 text-center text-gray-400 text-[11px]">
                      ... และอีก {preview.vouchers.length - 10} รายการ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Import button */}
          {result ? (
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <p className="text-[13px] font-medium text-green-700">
                  นำเข้าสำเร็จ {result.success} รายการ
                  {result.error > 0 && ` (ผิดพลาด ${result.error} รายการ)`}
                </p>
                <p className="text-[11px] text-green-600 mt-0.5">ปิด-เปิด Express ใหม่เพื่อดูข้อมูล</p>
              </div>
              <button
                onClick={() => { setFile(null); setPreview(null); setResult(null) }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-[13px] text-gray-600 hover:bg-gray-50"
              >
                นำเข้าอีกครั้ง
              </button>
            </div>
          ) : (
            <button
              onClick={handleImport}
              disabled={importing}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium text-[13px] py-2.5 rounded-lg transition-colors"
            >
              {importing ? 'กำลังนำเข้า...' : `นำเข้า ${preview.totalVouchers} รายการ → Express`}
            </button>
          )}
        </div>
      )}

      {/* Info box */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-[12px] text-gray-500">
        <p className="font-medium text-gray-700 mb-1">ข้อมูลทางเทคนิค</p>
        <p>JNLTYP: <span className="font-mono">{module.jnltyp}</span> · ตาราง DBF: {module.tables.join(', ')}</p>
        <p className="mt-0.5">DBF Path: <span className="font-mono">Z:\Aulgor\</span> (ผ่าน Agent)</p>
      </div>
    </div>
  )
}
