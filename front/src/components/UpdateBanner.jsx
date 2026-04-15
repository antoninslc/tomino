import { useEffect, useRef, useState } from 'react'
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const progressTimerRef = useRef(null)

  useEffect(() => {
    // Si pas dans Tauri, on ne fait rien
    const IS_TAURI = typeof window !== 'undefined' && (
      window.__TAURI__ !== undefined ||
      window.__TAURI_INTERNALS__ !== undefined ||
      window.location.protocol === 'tauri:' ||
      window.location.hostname === 'tauri.localhost'
    )
    if (!IS_TAURI) return

    // Vérifier si l'utilisateur a dit "Plus tard" pour cette session
    if (sessionStorage.getItem('tomino_update_dismissed') === '1') return

    async function check() {
      try {
        const result = await checkUpdate()
        if (result.shouldUpdate) {
          setUpdateInfo({
            version: result.manifest?.version || 'supérieure',
            notes: result.manifest?.body || '',
          })
          setVisible(true)
        }
      } catch (err) {
        console.error('Erreur checkUpdate: ', err)
      }
    }

    check()
  }, [])

  const handleInstall = async () => {
    try {
      setInstalling(true)
      setInstallProgress(12)
      progressTimerRef.current = window.setInterval(() => {
        setInstallProgress((current) => {
          if (current >= 92) return current
          const step = current < 30 ? 10 : current < 60 ? 7 : 4
          return Math.min(current + step, 92)
        })
      }, 180)
      await installUpdate()
      setInstallProgress(100)
      await relaunch()
    } catch (err) {
      console.error('Erreur installUpdate: ', err)
      setInstalling(false)
      setInstallProgress(0)
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem('tomino_update_dismissed', '1')
    setVisible(false)
  }

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!installing || installProgress >= 100) {
      if (progressTimerRef.current) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [installing, installProgress])

  if (!visible || !updateInfo) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 200,
        backgroundColor: '#ffffff',
        border: '1px solid rgba(11,13,16,0.08)',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 8px 28px rgba(0,0,0,0.22)',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <span style={{ color: 'var(--bg)', fontWeight: 600, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
        Tomino {updateInfo.version} est disponible
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleDismiss}
          disabled={installing}
          style={{
            background: 'rgba(11,13,16,0.04)',
            borderColor: 'rgba(11,13,16,0.08)',
            color: 'var(--bg)',
          }}
        >
          Plus tard
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleInstall}
          disabled={installing}
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: 'rgba(24,195,126,0.15)',
            color: 'var(--bg)',
            border: '1px solid rgba(24,195,126,0.35)',
            boxShadow: 'none',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: `${installing ? installProgress : 0}%`,
              background: 'rgba(11,13,16,0.22)',
              transition: installing ? 'width 0.18s linear' : 'width 0.18s ease',
            }}
          />
          <span style={{ position: 'relative', zIndex: 1 }}>
            {installing ? 'Installation...' : 'Installer'}
          </span>
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}} />
    </div>
  )
}
