'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    } else {
      router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f3', fontFamily: 'var(--font-sarabun, sans-serif)',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '22px', fontWeight: 500, color: '#111' }}>JW RPA</div>
          <div style={{ fontSize: '13px', color: '#888', marginTop: '4px' }}>Express Accounting Import System</div>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff', border: '1px solid #ebebeb',
          borderRadius: '16px', padding: '28px',
        }}>
          <h1 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '20px', color: '#111' }}>
            เข้าสู่ระบบ
          </h1>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>
                อีเมล
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={{
                  width: '100%', border: '1px solid #e0e0e0', borderRadius: '8px',
                  padding: '9px 12px', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box', color: '#111',
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: '#555', marginBottom: '6px' }}>
                รหัสผ่าน
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%', border: '1px solid #e0e0e0', borderRadius: '8px',
                  padding: '9px 12px', fontSize: '13px', outline: 'none',
                  boxSizing: 'border-box', color: '#111',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: '8px', padding: '10px 12px',
                fontSize: '12px', color: '#dc2626', marginBottom: '14px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', background: loading ? '#9ca3af' : '#2563eb',
                color: '#fff', border: 'none', borderRadius: '8px',
                padding: '10px', fontSize: '13px', fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#aaa', marginTop: '16px' }}>
          JW Accounting Co., Ltd. · v1.0.0
        </p>
      </div>
    </div>
  )
}
