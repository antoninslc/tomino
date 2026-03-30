import { createPortal } from 'react-dom'

const CONSENT_KEY = 'tomino_ia_consent'

export function hasIaConsent() {
  return localStorage.getItem(CONSENT_KEY) === '1'
}

export default function IaConsentModal({ onAccept, onRefuse, quota }) {
  const accept = () => {
    localStorage.setItem(CONSENT_KEY, '1')
    onAccept()
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--line-strong)',
        borderRadius: 20,
        maxWidth: 480,
        width: '100%',
        padding: '32px 28px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', letterSpacing: '.12em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 16 }}>
          Tomino Intelligence
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>
          Envoi de données à l'IA
        </h2>

        <p style={{ color: 'var(--text-2)', fontSize: '.88rem', lineHeight: 1.7, marginBottom: 16 }}>
          Pour générer une analyse ou répondre à vos questions, Tomino transmet à <strong style={{ color: 'var(--text)' }}>xAI (Grok)</strong> le contexte nécessaire : valeur des enveloppes, allocations, performances et profil investisseur.
        </p>

        <p style={{ color: 'var(--text-2)', fontSize: '.88rem', lineHeight: 1.7, marginBottom: 20 }}>
          Aucune donnée d'identification personnelle (nom, email, coordonnées bancaires) n'est transmise. L'usage de l'IA reste optionnel — toutes les autres fonctionnalités de Tomino sont disponibles sans elle.
        </p>

        {quota && Number(quota.total_tokens || 0) > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Tokens utilisés cette semaine
            </span>
            <span style={{ color: 'var(--text-2)', fontFamily: 'var(--mono)', fontSize: '.82rem' }}>
              {Number(quota.total_tokens || 0).toLocaleString('fr-FR')}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1 }}
            onClick={onRefuse}
          >
            Refuser
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={accept}
          >
            Accepter et continuer
          </button>
        </div>

        <p style={{ marginTop: 14, fontSize: '.73rem', color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
          Ce choix est mémorisé. Vous pouvez le modifier dans Paramètres → Confidentialité & sécurité.
        </p>
      </div>
    </div>,
    document.body
  )
}
