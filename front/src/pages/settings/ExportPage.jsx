export default function ExportPage({ ctx }) {
  const { BackHeader, navigate } = ctx

  return (
    <>
      <BackHeader
        title="Export & import"
        subtitle="Exportez vos données et restaurez vos sauvegardes depuis Tomino."
        onBack={() => navigate('/settings')}
      />

      <div style={{ display: 'grid', gap: 28, maxWidth: 980 }}>
        <div>
          <div className="settings-group-label" style={{ marginBottom: 10 }}>Rapports et exports</div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/export/pdf')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Export patrimonial PDF</div>
                <div className="settings-row-sub">Télécharger un rapport PDF (résumé, allocation, performances, positions).</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-mouvements')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Mouvements (CSV)</div>
                <div className="settings-row-sub">Tous les achats et ventes enregistrés.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-dividendes')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Dividendes (CSV)</div>
                <div className="settings-row-sub">Tous les versements de dividendes.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-fiscal')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Synthèse fiscale (CSV)</div>
                <div className="settings-row-sub">Rapport fiscal intégrant dividendes bruts et plus/moins-values.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
          </div>
        </div>

        <div>
          <div className="settings-group-label" style={{ marginBottom: 10 }}>Sauvegarde</div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/export/backup')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Sauvegarde complète (.tomino-backup)</div>
                <div className="settings-row-sub">Exporter ou réimporter la base locale avec validation d'intégrité.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
