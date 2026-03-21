export default function ExportPage({ ctx }) {
  const { BackHeader, navigate } = ctx

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
      </section>
    </>
  )
}
