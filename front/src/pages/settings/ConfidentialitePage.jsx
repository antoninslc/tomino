import { useState } from 'react'

const CONSENT_KEY = 'tomino_ia_consent'

export default function ConfidentialitePage({ ctx }) {
  const { BackHeader, navigate, blurAmounts, toggleBlur } = ctx
  const [iaConsent, setIaConsent] = useState(localStorage.getItem(CONSENT_KEY) === '1')

  function revokeConsent() {
    localStorage.removeItem(CONSENT_KEY)
    setIaConsent(false)
  }

  return (
    <>
      <BackHeader
        title="Confidentialité & sécurité"
        subtitle="Ce que Tomino stocke, ce qu'il envoie, et comment vos données sont protégées."
        onBack={() => navigate('/settings')}
      />

      <Section label="Affichage">
        <div className="settings-row" onClick={toggleBlur} style={{ cursor: 'pointer', borderBottom: '1px solid var(--line)' }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Flouter les montants</div>
            <div className="settings-row-sub">Masque les sommes affichées dans l'application. Survolez pour révéler.</div>
          </div>
          <button
            className={`toggle-switch${blurAmounts ? ' on' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleBlur() }}
            type="button"
            aria-pressed={blurAmounts}
            aria-label="Activer ou désactiver le flou sur les montants"
          />
        </div>
        <div className="settings-row" style={{ cursor: 'default' }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Consentement IA</div>
            <div className="settings-row-sub">
              {iaConsent
                ? 'Vous avez accepté la transmission de données à xAI pour les fonctionnalités IA.'
                : "Vous n'avez pas encore accepté. Le consentement sera demandé à la première utilisation."}
            </div>
          </div>
          {iaConsent && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '.78rem', padding: '5px 12px', flexShrink: 0 }}
              onClick={revokeConsent}
            >
              Révoquer
            </button>
          )}
        </div>
      </Section>

      <Section label="Principe fondamental">
        <Row
          title="Local-first par défaut"
          body="Tomino fonctionne entièrement hors ligne. Vos données patrimoniales sont stockées sur votre appareil uniquement — aucun compte n'est requis pour utiliser l'application."
        />
        <Row
          title="Aucune connexion bancaire"
          body="Tomino ne se connecte jamais à votre banque. Toutes les saisies sont manuelles. Les cours boursiers sont récupérés depuis Yahoo Finance (données publiques) sans aucune information personnelle."
        />
      </Section>

      <Section label="Ce qui reste sur votre appareil">
        <Row
          title="Données patrimoniales"
          body="Actifs, mouvements, livrets, assurance vie, or, dividendes, alertes et historique sont stockés dans une base SQLite locale (patrimoine.db). Ces données ne quittent jamais votre appareil sauf si vous activez la synchronisation Tomino+."
        />
        <Row
          title="Sauvegardes locales"
          body="Les sauvegardes automatiques (.tomino-backup) sont enregistrées sur votre machine. Vous pouvez les exporter, les chiffrer par mot de passe, et les restaurer à tout moment."
        />
        <Row
          title="Préférences d'interface"
          body="Vos préférences (affichage, masquage des montants, etc.) sont stockées localement dans le navigateur de l'application."
        />
      </Section>

      <Section label="Ce qui est envoyé au cloud (Tomino+ uniquement)">
        <Row
          title="Synchronisation multi-appareils"
          body="Si vous activez Tomino+, les événements de synchronisation (modifications de vos données) sont transmis à nos serveurs pour être répliqués sur vos autres appareils. Les métadonnées de compte (email, tier, sessions, appareils) sont également stockées."
          highlight
        />
        <Row
          title="Chiffrement de bout en bout"
          body="Toutes les données synchronisées entre vos appareils sont chiffrées de bout en bout."
        />
        <Row
          title="Portabilité garantie"
          body="Même avec Tomino+ actif, vous pouvez exporter l'intégralité de vos données à tout moment via Export & import. Aucun verrouillage propriétaire."
        />
      </Section>

      <Section label="Services tiers">
        <Row
          title="Yahoo Finance"
          body="Les cours boursiers sont récupérés via des requêtes HTTP publiques vers Yahoo Finance. Aucune donnée personnelle n'est transmise — uniquement les tickers de vos actifs."
        />
        <Row
          title="Grok / xAI (IA)"
          body="Si vous utilisez les fonctionnalités IA (analyse, chat), le contexte patrimonial nécessaire à la réponse est transmis à xAI. Cette transmission est optionnelle — l'IA n'est jamais obligatoire pour utiliser Tomino."
        />
        <Row
          title="Stripe (facturation)"
          body="Si vous souscrivez à Tomino+, votre email et les informations de paiement transitent par Stripe. Tomino ne stocke jamais de numéro de carte. Les données de facturation restent chez Stripe."
        />
      </Section>

      <Section label="Sécurité technique">
        <Row
          title="Mots de passe"
          body="Les mots de passe sont hachés côté serveur avec PBKDF2. Seul le hachage est stocké — jamais le mot de passe en clair."
        />
        <Row
          title="Sessions"
          body="Les sessions sont authentifiées par jeton opaque. Seul le hachage SHA-256 du jeton est persisté. Chaque session peut être révoquée individuellement depuis la page Synchronisation."
        />
        <Row
          title="Protection contre les abus"
          body="Le nombre de tentatives de connexion est limité (fenêtre glissante + blocage temporaire). Les événements d'authentification sont journalisés."
        />
      </Section>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 4, paddingBottom: 8 }}>
        <button type="button" onClick={() => navigate('/politique-confidentialite')} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: '.78rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)', padding: 0 }}>
          Politique de confidentialité
        </button>
        <button type="button" onClick={() => navigate('/mentions-legales')} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: '.78rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)', padding: 0 }}>
          Mentions légales
        </button>
      </div>
    </>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="settings-group-label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ title, body, highlight, warn }) {
  const accent = warn
    ? 'rgba(255,200,80,0.12)'
    : highlight
    ? 'rgba(24,195,126,0.06)'
    : 'transparent'

  const borderLeft = warn
    ? '3px solid rgba(255,200,80,0.5)'
    : highlight
    ? '3px solid rgba(24,195,126,0.4)'
    : '3px solid transparent'

  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', background: accent, borderLeft }}>
      <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '.83rem', color: 'var(--text-2)', lineHeight: 1.65 }}>{body}</div>
    </div>
  )
}
