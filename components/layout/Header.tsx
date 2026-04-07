'use client'
import { useState, useEffect, useCallback } from 'react'
import DbfPathSelector from '@/components/DbfPathSelector'

type AgentStatus = 'checking' | 'online' | 'offline'

// เรียก agent โดยตรงจาก browser เพื่อให้ใช้ได้กับ Vercel deployment
const getAgentBase = () =>
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'http://localhost:9999'
    : '/api/agent'

export default function Header() {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('checking')
  const [dbfPath, setDbfPath] = useState('')
  const [dbfOk, setDbfOk] = useState(false)

  const checkAgent = useCallback(async () => {
    try {
      const res = await fetch(`${getAgentBase()}/status`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAgentStatus('online')
      setDbfPath(data.dbf_folder || '')
      setDbfOk(!!data.dbf_ok)
    } catch {
      setAgentStatus('offline')
    }
  }, [])

  useEffect(() => {
    checkAgent()
    const id = setInterval(checkAgent, 15000)
    return () => clearInterval(id)
  }, [checkAgent])

  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '0 20px', height: '48px', minHeight: '48px',
      borderBottom: '1px solid #f0f0ee',
      background: '#fff',
      fontFamily: 'var(--font-sarabun, sans-serif)',
    }}>

      {/* Agent status badge */}
      <div
        onClick={checkAgent}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '3px 10px', borderRadius: '99px',
          border: '1px solid',
          fontSize: '12px', fontWeight: 500,
          cursor: 'pointer', userSelect: 'none',
          transition: 'opacity 0.15s',
          ...(agentStatus === 'online'
            ? { background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }
            : agentStatus === 'offline'
            ? { background: '#fef2f2', borderColor: '#fca5a5', color: '#dc2626' }
            : { background: '#f8fafc', borderColor: '#e2e8f0', color: '#94a3b8' }),
        }}
      >
        <span style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: agentStatus === 'online' ? '#22c55e'
            : agentStatus === 'offline' ? '#ef4444' : '#cbd5e1',
          ...(agentStatus === 'online'
            ? { boxShadow: '0 0 0 2px #bbf7d0', animation: 'pulse 2s infinite' }
            : {}),
        }} />
        {agentStatus === 'checking' ? 'กำลังเชื่อมต่อ…'
          : agentStatus === 'online' ? 'Agent เชื่อมต่อแล้ว'
          : 'Agent ออฟไลน์'}
      </div>

      {/* spacer */}
      <div style={{ flex: 1 }} />

      {/* DBF path label */}
      {agentStatus === 'online' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '11px', color: '#aaa', whiteSpace: 'nowrap' }}>
            ที่เก็บข้อมูล
            <span style={{
              marginLeft: '4px', padding: '1px 6px', borderRadius: '4px',
              fontSize: '10px', fontWeight: 500,
              background: dbfOk ? '#dcfce7' : '#fef9c3',
              color: dbfOk ? '#166534' : '#854d0e',
            }}>
              {dbfOk ? 'จริง' : 'ไม่พบไฟล์'}
            </span>
          </div>
          <DbfPathSelector
            currentPath={dbfPath}
            onPathChange={(newPath) => {
              setDbfPath(newPath)
              // รีเช็คสถานะหลังเปลี่ยน path
              setTimeout(checkAgent, 500)
            }}
          />
        </div>
      )}

      {agentStatus === 'offline' && (
        <div style={{ fontSize: '12px', color: '#dc2626' }}>
          ⚠️ ไม่พบ agent.exe — รันที่เครื่อง Windows ก่อน
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 2px #bbf7d0; }
          50% { box-shadow: 0 0 0 4px #86efac; }
        }
      `}</style>
    </header>
  )
}
