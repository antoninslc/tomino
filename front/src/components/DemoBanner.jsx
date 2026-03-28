import { useState } from 'react'
import { api } from '../api'

export default function DemoBanner({ isDemo }) {
  const [loading, setLoading] = useState(false)

  if (!isDemo) return null

  const handleReset = async () => {
    if (loading) return
    setLoading(true)
    try {
      await api.post('/demo/reset')
      window.location.href = '/'
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: 'rgba(18, 22, 28, 0.97)',
      borderTop: '1px solid rgba(201, 168, 76, 0.3)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 20px',
      gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          fontFamily: 'var(--mono)',
          fontSize: '.6rem',
          letterSpacing: '.14em',
          color: 'var(--gold)',
          background: 'rgba(201,168,76,.1)',
          border: '1px solid rgba(201,168,76,.25)',
          borderRadius: 6,
          padding: '2px 8px',
          flexShrink: 0,
        }}>
          DECOUVERTE
        </div>
        <span style={{ fontSize: '.88rem', color: 'var(--text-3)' }}>
          Vous visualisez des données fictives. Vos vraies données ne sont pas affectées.
        </span>
      </div>
      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        style={{
          flexShrink: 0,
          fontFamily: 'var(--mono)',
          fontSize: '.78rem',
          fontWeight: 600,
          color: 'var(--gold)',
          background: 'rgba(201,168,76,.08)',
          border: '1px solid rgba(201,168,76,.3)',
          borderRadius: 8,
          padding: '6px 14px',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.6 : 1,
          whiteSpace: 'nowrap',
          transition: 'background .15s, border-color .15s',
        }}
        onMouseEnter={e => {
          if (!loading) {
            e.currentTarget.style.background = 'rgba(201,168,76,.15)'
            e.currentTarget.style.borderColor = 'rgba(201,168,76,.5)'
          }
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(201,168,76,.08)'
          e.currentTarget.style.borderColor = 'rgba(201,168,76,.3)'
        }}
      >
        {loading ? 'Purge en cours...' : 'Quitter la decouverte'}
      </button>
    </div>
  )
}
