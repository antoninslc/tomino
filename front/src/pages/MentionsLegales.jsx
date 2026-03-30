import { useNavigate } from 'react-router-dom'

export default function MentionsLegales() {
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
        Informations légales
      </div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 32 }}>
        Mentions légales
      </h1>

      <Block title="Éditeur">
        <p>Tomino est un logiciel édité à titre personnel.</p>
        <p>Contact : <a href="mailto:contact@tomino.app" style={{ color: 'var(--green)' }}>contact@tomino.app</a></p>
      </Block>

      <Block title="Nature du logiciel">
        <p>Tomino est une application de bureau (desktop) fonctionnant localement sur l'appareil de l'utilisateur. Elle ne constitue pas un service de conseil en investissement financier.</p>
        <p>Les analyses produites par l'intelligence artificielle intégrée sont fournies à titre informatif uniquement. Elles ne constituent pas des recommandations d'achat ou de vente de valeurs mobilières.</p>
      </Block>

      <Block title="Hébergement">
        <p>L'application Tomino et ses données fonctionnent localement sur votre appareil. Aucun serveur central n'héberge vos données patrimoniales, sauf activation explicite de la synchronisation Tomino+.</p>
        <p>La synchronisation cloud (Tomino+), lorsqu'elle est activée, est hébergée par des prestataires tiers dont les coordonnées sont disponibles sur demande.</p>
      </Block>

      <Block title="Propriété intellectuelle">
        <p>Le logiciel Tomino, son interface et son code source sont protégés par les lois en vigueur sur la propriété intellectuelle. Toute reproduction, même partielle, est interdite sans autorisation préalable écrite.</p>
      </Block>

      <Block title="Limitation de responsabilité">
        <p>Tomino est un outil d'aide au suivi patrimonial personnel. L'éditeur ne saurait être tenu responsable de décisions financières prises sur la base des données ou analyses affichées dans l'application.</p>
        <p>Les cours boursiers affichés sont fournis par Yahoo Finance à titre indicatif et peuvent présenter des décalages ou inexactitudes.</p>
      </Block>

      <Block title="Droit applicable">
        <p>Les présentes mentions légales sont soumises au droit français. Tout litige relatif à leur interprétation ou leur exécution relève de la compétence des tribunaux français.</p>
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
