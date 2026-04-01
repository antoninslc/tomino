export default function PricingPage({ ctx }) {
  const {
    BackHeader,
    navigate,
    syncSubscription,
    syncAuthUser,
    syncAuthToken,
    syncActionSaving,
    setSyncAuthMode,
    setSyncAuthTier,
    setSyncAuthModalOpen,
    changeSyncPlan,
    FREE_FEATURES,
    TOMINO_PLUS_FEATURES,
  } = ctx

  const isTominoPlus = Boolean(syncSubscription?.tomino_plus || syncAuthUser?.tomino_plus || ['tier1', 'tomino_plus', 'tier2'].includes(String(syncAuthUser?.tier || '').toLowerCase()))

  return (
    <>
      <BackHeader
        title="Tarifs"
        subtitle="Comparez Gratuit et Tomino+ pour choisir le niveau adapté à votre usage."
        onBack={() => navigate('/settings')}
      />

      <div style={{ maxWidth: 980, display: 'grid', gap: 28 }}>
        <div>
          <div className="settings-group-label" style={{ marginBottom: 10 }}>Gratuit vs Tomino+</div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', padding: '18px 20px' }}>
            <h2 style={{ margin: '0 0 10px', fontFamily: 'var(--serif)', fontSize: '1.8rem', letterSpacing: '.01em' }}>Simple, transparent, sans surprise.</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', maxWidth: 760, lineHeight: 1.65 }}>
              Gratuit couvre tout le suivi local. Tomino+ débloque l'expérience cloud et les outils premium pour piloter votre patrimoine sur plusieurs appareils.
            </p>
          </div>
        </div>

        <div className="g2" style={{ alignItems: 'stretch' }}>
          <article className="card" style={{ background: 'rgba(255,255,255,.01)', border: '1px solid rgba(255,255,255,.10)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div className="card-label">Gratuit</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem' }}>0€</div>
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: '.84rem', marginBottom: 12 }}>Gratuit, sans compte obligatoire.</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {FREE_FEATURES.map((item) => (
                <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text-2)', fontSize: '.86rem' }}>
                  <span style={{ color: 'var(--green)', marginTop: 1 }}>✓</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="card" style={{ background: 'linear-gradient(180deg, rgba(30,21,8,.78), rgba(16,12,6,.86))', border: '1px solid rgba(201,168,76,.45)', boxShadow: '0 16px 36px rgba(0,0,0,.35)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div className="card-label" style={{ color: '#f5dd9d' }}>Tomino+</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: '#f7e8b9' }}>4,99€<span style={{ fontSize: '.85rem', color: '#dccf9f' }}>/mois</span></div>
            </div>
            <div style={{ color: '#e6d6a4', fontSize: '.84rem', marginBottom: 12 }}>Pour la sync cloud, l'IA avancée et les outils premium.</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {TOMINO_PLUS_FEATURES.map((item) => (
                <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#e9dfbd', fontSize: '.86rem' }}>
                  <span style={{ color: '#f2d37c', marginTop: 1 }}>★</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/settings/sync')}>
            Espace sync cloud
          </button>
          {!isTominoPlus && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!syncAuthToken) {
                  setSyncAuthMode('register')
                  setSyncAuthTier('tomino_plus')
                  setSyncAuthModalOpen(true)
                  return
                }
                changeSyncPlan('tomino_plus')
              }}
              disabled={syncActionSaving}
            >
              {syncActionSaving ? 'Ouverture...' : 'Activer Tomino+'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
