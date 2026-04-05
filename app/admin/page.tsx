'use client'
// app/admin/page.tsx  (เฉพาะ role=ADMIN เท่านั้น)

import { useState, useEffect } from 'react'

interface UserLicense {
  id: string
  email: string
  name: string
  company: string
  license: {
    key: string
    expireDate: string
    isActive: boolean
    daysLeft: number
    usedImports: number
    maxImports: number | null
  } | null
}

export default function AdminPage() {
  const [users, setUsers]       = useState<UserLicense[]>([])
  const [loading, setLoading]   = useState(true)
  const [creating, setCreating] = useState(false)

  // Form state สำหรับสร้าง license ใหม่
  const [form, setForm] = useState({
    email: '', name: '', company: '', password: '',
    days: '30', maxImports: '',
  })

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoading(false) })
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    // refresh
    const res = await fetch('/api/admin/users')
    const d   = await res.json()
    setUsers(d.users || [])
    setForm({ email:'', name:'', company:'', password:'', days:'30', maxImports:'' })
    setCreating(false)
  }

  const extendLicense = async (userId: string, days: number) => {
    await fetch('/api/admin/extend-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, days }),
    })
    const res = await fetch('/api/admin/users')
    setUsers((await res.json()).users || [])
  }

  const toggleLicense = async (userId: string, active: boolean) => {
    await fetch('/api/admin/toggle-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, active }),
    })
    const res = await fetch('/api/admin/users')
    setUsers((await res.json()).users || [])
  }

  return (
    <div className="p-6">
      <h1 className="text-[18px] font-medium mb-6">จัดการ License</h1>

      {/* สร้างผู้ใช้ใหม่ */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <h2 className="text-[13px] font-medium mb-4">สร้างผู้ใช้ใหม่ + License</h2>
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">ชื่อบริษัท</label>
              <input value={form.company} onChange={e => setForm({...form, company: e.target.value})}
                placeholder="บริษัท XYZ จำกัด" required
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400"/>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">ชื่อผู้ใช้</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="สมชาย ใจดี" required
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400"/>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">อีเมล</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                placeholder="user@company.com" required
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">รหัสผ่าน</label>
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                placeholder="••••••••" required
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400"/>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">จำนวนวัน</label>
              <select value={form.days} onChange={e => setForm({...form, days: e.target.value})}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400">
                <option value="7">7 วัน (ทดลอง)</option>
                <option value="30">30 วัน (1 เดือน)</option>
                <option value="90">90 วัน (3 เดือน)</option>
                <option value="180">180 วัน (6 เดือน)</option>
                <option value="365">365 วัน (1 ปี)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">จำนวนครั้งสูงสุด (ว่าง=ไม่จำกัด)</label>
              <input type="number" value={form.maxImports} onChange={e => setForm({...form, maxImports: e.target.value})}
                placeholder="ไม่จำกัด"
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:border-blue-400"/>
            </div>
          </div>
          <button type="submit" disabled={creating}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-[13px] font-medium px-5 py-2 rounded-lg transition-colors">
            {creating ? 'กำลังสร้าง...' : 'สร้างผู้ใช้ + License'}
          </button>
        </form>
      </div>

      {/* ตารางผู้ใช้ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-[13px] font-medium">ผู้ใช้ทั้งหมด ({users.length} ราย)</span>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-400 text-[13px]">กำลังโหลด...</div>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-gray-100">
                {['บริษัท/ชื่อ','อีเมล','License Key','หมดอายุ','คงเหลือ','ใช้ไป','สถานะ','จัดการ'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-gray-500 font-medium text-[11px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const lic = u.license
                const daysLeft = lic?.daysLeft ?? 0
                const dayColor = !lic ? 'text-gray-400' : daysLeft > 10 ? 'text-green-600' : daysLeft > 3 ? 'text-amber-600' : 'text-red-600'
                return (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{u.company}</div>
                      <div className="text-gray-400">{u.name}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.email}</td>
                    <td className="px-4 py-3 font-mono text-gray-600 text-[11px]">
                      {lic?.key || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {lic ? new Date(lic.expireDate).toLocaleDateString('th-TH') : '—'}
                    </td>
                    <td className={`px-4 py-3 font-medium ${dayColor}`}>
                      {lic ? `${daysLeft} วัน` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {lic ? `${lic.usedImports}${lic.maxImports ? '/'+lic.maxImports : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {lic ? (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${lic.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {lic.isActive ? 'ใช้งาน' : 'ระงับ'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">ไม่มี</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {[30, 90].map(d => (
                          <button key={d} onClick={() => extendLicense(u.id, d)}
                            className="text-[11px] px-2 py-1 border border-gray-200 rounded text-blue-600 hover:bg-blue-50">
                            +{d}ว
                          </button>
                        ))}
                        {lic && (
                          <button onClick={() => toggleLicense(u.id, !lic.isActive)}
                            className={`text-[11px] px-2 py-1 border rounded ${lic.isActive ? 'border-red-200 text-red-500 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                            {lic.isActive ? 'ระงับ' : 'เปิด'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
