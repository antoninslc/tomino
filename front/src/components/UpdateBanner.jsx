import { useEffect, useState } from 'react'
import { checkUpdate, installUpdate } from '@tauri-apps/api/updater'
import { relaunch } from '@tauri-apps/api/process'

export default function UpdateBanner() {
  const [updateInfo, setUpdateInfo] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [visible, setVisible] = useState(false)

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
      await installUpdate()
      await relaunch()
    } catch (err) {
      console.error('Erreur installUpdate: ', err)
      setInstalling(false)
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem('tomino_update_dismissed', '1')
    setVisible(false)
  }

  if (!visible || !updateInfo) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 200,
        backgroundColor: 'var(--bg-2)',
        border: '1px solid rgba(201,168,76,0.35)',
        borderRadius: 10,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
        animation: 'slideUp 0.25s ease-out',
      }}
    >
      <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
        Tomino {updateInfo.version} est disponible
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={handleDismiss} disabled={installing}>
          Plus tard
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleInstall} disabled={installing}>
          {installing ? 'Installation...' : 'Installer'}
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
