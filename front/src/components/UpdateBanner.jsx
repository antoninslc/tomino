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
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        backgroundColor: 'rgba(201,168,76,0.12)',
        borderBottom: '1px solid rgba(201,168,76,0.35)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        animation: 'slideDown 0.3s ease-out',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div>
        <div style={{ color: '#e8e3dc', fontWeight: '500', marginBottom: 4 }}>
          Tomino {updateInfo.version} est disponible
        </div>
        <div style={{ color: '#8a8480', fontSize: '0.85rem', lineHeight: 1.4, maxWidth: '600px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {updateInfo.notes}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button className="btn btn-ghost btn-sm" onClick={handleDismiss} disabled={installing}>
          Plus tard
        </button>
        <button className="btn btn-primary btn-sm" onClick={handleInstall} disabled={installing}>
          {installing ? 'Installation...' : 'Installer maintenant'}
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}} />
    </div>
  )
}
