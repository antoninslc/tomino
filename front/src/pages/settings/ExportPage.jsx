import { useEffect, useState } from 'react'

export default function ExportPage({ ctx }) {
  const { BackHeader, navigate } = ctx
  const [dataDir, setDataDir] = useState(null)
  const [frozen, setFrozen] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/data-dir')
      .then(r => r.json())
      .then(d => { if (mounted) { setDataDir(d?.data_dir || null); setFrozen(Boolean(d?.frozen)) } })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  const handleOpenFolder = async () => {
    if (!dataDir) return
    try {
      const { open } = await import('@tauri-apps/api/shell')
      await open(dataDir)
    } catch {}
  }

  return (
    <>
      <BackHeader
        title="Export & import"
        subtitle="Exportez vos données et restaurez vos sauvegardes depuis Tomino."
        onBack={() => navigate('/settings')}
      />

      <section style={{ display: 'grid', gap: 12, maxWidth: 980 }}>
        <button type="button" className="settings-row" onClick={() => navigate('/settings/export/pdf')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Export patrimonial PDF</div>
            <div className="settings-row-sub">Télécharger un rapport PDF (résumé, allocation, performances, positions).</div>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
        </button>

        <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-mouvements')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Mouvements (CSV)</div>
            <div className="settings-row-sub">Tous les achats et ventes enregistrés.</div>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
        </button>

        <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-dividendes')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Dividendes (CSV)</div>
            <div className="settings-row-sub">Tous les versements de dividendes.</div>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
        </button>

        <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-fiscal')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Synthèse fiscale (CSV)</div>
            <div className="settings-row-sub">Rapport fiscal intégrant dividendes bruts et plus/moins-values.</div>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
        </button>

        <button type="button" className="settings-row" onClick={() => navigate('/settings/export/backup')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
          <div className="settings-row-info">
            <div className="settings-row-title">Sauvegarde complète (.tomino-backup)</div>
            <div className="settings-row-sub">Exporter ou réimporter la base locale avec validation d'intégrité.</div>
          </div>
          <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
        </button>

        {dataDir && (
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
            <div className="settings-row-info" style={{ width: '100%' }}>
              <div className="settings-row-title">Dossier de données</div>
              <div className="settings-row-sub" style={{ marginTop: 6 }}>
                Vos données locales (<span style={{ fontFamily: 'var(--mono)', fontSize: '.78rem' }}>patrimoine.db</span>) sont stockées ici :
              </div>
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: '.78rem',
                color: 'var(--text-2)',
                background: 'rgba(255,255,255,.03)',
                border: '1px solid var(--line)',
                borderRadius: 8,
                padding: '7px 12px',
                marginTop: 8,
                wordBreak: 'break-all',
              }}>
                {dataDir}
              </div>
            </div>
            {frozen && (
              <button
                type="button"
                className="btn"
                onClick={handleOpenFolder}
                style={{ fontSize: '.82rem', padding: '6px 14px' }}
              >
                Ouvrir le dossier
              </button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
