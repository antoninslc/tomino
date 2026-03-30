import { useNavigate } from 'react-router-dom'

export default function PolitiqueConfidentialite() {
  const navigate = useNavigate()

  return (
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '32px 22px 60px' }}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginBottom: 28, fontSize: '.82rem' }}
        onClick={() => navigate(-1)}
      >
        Retour
      </button>

      <div style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', letterSpacing: '.12em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 10 }}>
        Vie privée
      </div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 8 }}>
        Politique de confidentialité
      </h1>
      <p style={{ color: 'var(--text-3)', fontSize: '.82rem', fontFamily: 'var(--mono)', marginBottom: 32 }}>
        Dernière mise à jour : mars 2026
      </p>

      <Block title="Principe fondamental">
        <p>Tomino est conçu selon un principe local-first : vos données patrimoniales sont stockées uniquement sur votre appareil. Aucun compte n'est nécessaire pour utiliser l'application.</p>
        <p>Tomino ne se connecte jamais à votre banque. Toutes les saisies sont manuelles.</p>
      </Block>

      <Block title="Données stockées localement">
        <p>Les données suivantes restent exclusivement sur votre appareil et ne sont jamais transmises sans votre accord explicite :</p>
        <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
          <li>Actifs, mouvements, livrets, assurance vie, or, dividendes, alertes</li>
          <li>Historique patrimonial et snapshots</li>
          <li>Profil investisseur (horizon, risque, objectif, stratégie)</li>
          <li>Préférences d'interface (stockées dans le navigateur de l'application)</li>
        </ul>
      </Block>

      <Block title="Données transmises à des tiers">
        <p><strong style={{ color: 'var(--text)' }}>Yahoo Finance</strong> — les tickers de vos actifs sont envoyés pour récupérer les cours boursiers publics. Aucune donnée personnelle n'est transmise.</p>
        <p><strong style={{ color: 'var(--text)' }}>xAI (Grok)</strong> — si vous utilisez les fonctionnalités IA (analyse ou chat), le contexte patrimonial nécessaire à la réponse est transmis. Aucune donnée d'identification (nom, email, coordonnées) n'est incluse. L'IA est optionnelle.</p>
        <p><strong style={{ color: 'var(--text)' }}>Stripe</strong> — en cas de souscription à Tomino+, votre email et les informations de paiement transitent par Stripe. Tomino ne stocke jamais de numéro de carte bancaire.</p>
      </Block>

      <Block title="Synchronisation Tomino+">
        <p>Si vous activez la synchronisation Tomino+, les événements de modification de vos données sont transmis à nos serveurs pour être répliqués sur vos autres appareils. Les données synchronisées sont chiffrées de bout en bout.</p>
        <p>Les métadonnées de compte stockées côté serveur incluent : email, niveau d'abonnement, sessions authentifiées, appareils enregistrés.</p>
        <p>Vous pouvez désactiver la synchronisation à tout moment depuis Paramètres → Synchronisation.</p>
      </Block>

      <Block title="Vos droits">
        <p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données.</p>
        <p>L'export complet de vos données est disponible à tout moment depuis Paramètres → Export & import. Aucun verrouillage propriétaire.</p>
        <p>Pour toute demande relative à vos données : <a href="mailto:contact@tomino.app" style={{ color: 'var(--green)' }}>contact@tomino.app</a></p>
      </Block>

      <Block title="Sécurité">
        <p>Les mots de passe sont hachés avec PBKDF2. Les sessions sont authentifiées par jeton opaque — seul le hachage SHA-256 est persisté. Les tentatives de connexion sont limitées pour prévenir les attaques par force brute.</p>
      </Block>
    </section>
  )
}

function Block({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{
        border: '1px solid var(--line)',
        borderRadius: 14,
        padding: '16px 18px',
        color: 'var(--text-2)',
        fontSize: '.88rem',
        lineHeight: 1.75,
        display: 'grid',
        gap: 8,
      }}>
        {children}
      </div>
    </div>
  )
}
