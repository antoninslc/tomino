import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Welcome() {
  const navigate = useNavigate()
  const [loadingDemo, setLoadingDemo] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const fileRef = useRef(null)

  const handleStartDemo = async () => {
    try {
      setLoadingDemo(true)
      await api.post('/demo/inject')
      window.location.href = '/'
    } catch (err) {
      console.error(err)
      setLoadingDemo(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append('backup', file)
      formData.append('confirm_restore', '1')
      const res = await fetch('/api/import/backup', { method: 'POST', body: formData })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok || payload?.ok === false) throw new Error(payload?.erreur || 'Import impossible')
      window.location.href = '/'
    } catch (err) {
      setImportError(err?.message || 'Fichier invalide.')
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '3rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 1060, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 800, letterSpacing: '-0.04em', marginBottom: '1rem' }}>
            Bienvenue sur Tomino
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: '1.1rem', maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
            Votre superviseur de patrimoine — 100% local, 100% vos données.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {/* Créer mon espace */}
          <button
            type="button"
            className="card"
            onClick={() => navigate('/onboarding')}
            style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', transition: 'border-color .15s', padding: 28 }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--gold)', letterSpacing: '.14em', marginBottom: 14 }}>NOUVEAU</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10 }}>Créer mon espace</div>
            <p style={{ color: 'var(--text-3)', fontSize: '.88rem', lineHeight: 1.55, marginBottom: 20 }}>
              Configurez votre profil investisseur et démarrez de zéro.
            </p>
            <div style={{ color: 'var(--gold)', fontSize: '.9rem', fontWeight: 600 }}>Démarrer &rarr;</div>
          </button>

          {/* Restaurer une sauvegarde */}
          <button
            type="button"
            className="card"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{ textAlign: 'left', cursor: importing ? 'wait' : 'pointer', border: '1px solid var(--line)', transition: 'border-color .15s', padding: 28, opacity: importing ? 0.7 : 1 }}
            onMouseEnter={e => { if (!importing) e.currentTarget.style.borderColor = 'var(--green)' }}
            onMouseLeave={e => e.currentTarget.style.borderColor = importError ? 'var(--red)' : 'var(--line)'}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--green)', letterSpacing: '.14em', marginBottom: 14 }}>SAUVEGARDE</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10 }}>Restaurer mes données</div>
            <p style={{ color: 'var(--text-3)', fontSize: '.88rem', lineHeight: 1.55, marginBottom: 20 }}>
              Importez un fichier <span style={{ fontFamily: 'var(--mono)', fontSize: '.82rem' }}>.tomino-backup</span> pour retrouver votre patrimoine existant.
            </p>
            {importError
              ? <div style={{ color: 'var(--red)', fontSize: '.82rem', fontFamily: 'var(--mono)' }}>{importError}</div>
              : <div style={{ color: 'var(--green)', fontSize: '.9rem', fontWeight: 600 }}>{importing ? 'Import en cours...' : 'Choisir un fichier &rarr;'}</div>
            }
            <input
              ref={fileRef}
              type="file"
              accept=".tomino-backup,.zip"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </button>

          {/* J'ai un compte */}
          <button
            type="button"
            className="card"
            onClick={() => navigate('/settings/sync?login=1')}
            style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', transition: 'border-color .15s', padding: 28 }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(24,195,126,.4)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--green)', letterSpacing: '.14em', marginBottom: 14 }}>TOMINO +</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10 }}>J'ai un compte</div>
            <p style={{ color: 'var(--text-3)', fontSize: '.88rem', lineHeight: 1.55, marginBottom: 20 }}>
              Connectez-vous pour synchroniser vos données sur plusieurs appareils.
            </p>
            <div style={{ color: 'var(--green)', fontSize: '.9rem', fontWeight: 600 }}>Se connecter &rarr;</div>
          </button>

          {/* Visite libre */}
          <button
            type="button"
            className="card"
            onClick={loadingDemo ? undefined : handleStartDemo}
            disabled={loadingDemo}
            style={{ textAlign: 'left', cursor: loadingDemo ? 'wait' : 'pointer', border: '1px solid var(--line)', transition: 'border-color .15s', padding: 28, opacity: loadingDemo ? 0.7 : 1 }}
            onMouseEnter={e => { if (!loadingDemo) e.currentTarget.style.borderColor = 'var(--line)' }}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--text-3)', letterSpacing: '.14em', marginBottom: 14 }}>DECOUVERTE</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 10, color: 'var(--text-2)' }}>Visite libre</div>
            <p style={{ color: 'var(--text-3)', fontSize: '.88rem', lineHeight: 1.55, marginBottom: 20 }}>
              Explorez avec un portefeuille fictif. Les données seront effaçables depuis les paramètres.
            </p>
            <div style={{ color: 'var(--text-3)', fontSize: '.9rem', fontWeight: 500 }}>{loadingDemo ? 'Génération...' : 'Lancer le mode démo &rarr;'}</div>
          </button>
        </div>
      </div>
    </div>
  )
}
