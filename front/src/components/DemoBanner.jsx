import { useEffect, useState } from 'react'
import { api } from '../api'

const BANNER_H = 36

export default function DemoBanner({ isDemo }) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const h = isDemo ? `${BANNER_H}px` : '0px'
    document.documentElement.style.setProperty('--demo-banner-h', h)
    document.body.style.paddingTop = isDemo ? `${BANNER_H}px` : ''
    return () => {
      document.documentElement.style.setProperty('--demo-banner-h', '0px')
      document.body.style.paddingTop = ''
    }
  }, [isDemo])

  if (!isDemo) return null

  const handleReset = async () => {
    if (loading) return
    setLoading(true)
    try {
      await api.post('/demo/reset')
      window.location.href = '/welcome'
    } catch {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      height: BANNER_H,
      zIndex: 99999,
      background: 'var(--green)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: '0 20px',
    }}>
      <span style={{
        fontSize: '.82rem',
        fontWeight: 600,
        color: '#0a0a0a',
        letterSpacing: '.01em',
      }}>
        Vous êtes en mode Visite libre — les données sont fictives.
      </span>
      <button
        type="button"
        onClick={handleReset}
        disabled={loading}
        style={{
          fontSize: '.78rem',
          fontWeight: 700,
          color: 'var(--green)',
          background: '#0a0a0a',
          border: 'none',
          borderRadius: 6,
          padding: '3px 12px',
          cursor: loading ? 'wait' : 'pointer',
          opacity: loading ? 0.7 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? 'Purge...' : 'Quitter'}
      </button>
    </div>
  )
}
