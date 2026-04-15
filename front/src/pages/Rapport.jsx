import { useEffect, useState } from 'react'
import { api } from '../api'
import MonthPicker from '../components/MonthPicker'

const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })

function eur(n) {
  const v = Number(n || 0)
  return <span className="blur-val">{fmtEur.format(v)}</span>
}

function pct(n, decimals = 2) {
  const v = Number(n || 0)
  return (v >= 0 ? '+' : '') + v.toFixed(decimals) + '\u00a0%'
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function labelMois(mois) {
  if (!mois) return ''
  try {
    const [y, m] = mois.split('-')
    const date = new Date(Number(y), Number(m) - 1, 1)
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  } catch {
    return mois
  }
}

function mouvLabel(type) {
  if (type === 'achat') return 'Achat'
  if (type === 'vente') return 'Vente'
  return type || '-'
}

function Sparkline({ data, color }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '.75rem', fontFamily: 'var(--mono)' }}>
        Pas de données
      </div>
    )
  }

  const vals = data.map((d) => Number(d.valeur_totale || 0))
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 400
  const H = 56
  const pad = 4

  const points = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2)
    const y = H - pad - ((v - min) / range) * (H - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = 'M ' + points.join(' L ')
  const areaD = pathD + ` L ${(W - pad).toFixed(1)},${H} L ${pad},${H} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 56, display: 'block' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#spark-fill)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Rapport() {
  const [mois, setMois] = useState(currentMonth())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(m) {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/rapport?mois=' + m)
      setData(res)
    } catch (e) {
      setError(e?.message || 'Erreur de chargement du rapport')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(mois)
  }, [mois])

  const stats = data?.stats || {}
  const hist = data?.historique || []
  const mouvements = data?.mouvements || []
  const dividendes = data?.dividendes || []
  const alertes = data?.alertes || []

  const variation = Number(data?.variation || 0)
  const variationMarche = data?.variation_marche != null ? Number(data.variation_marche) : null
  const varColor = variation >= 0 ? 'var(--green)' : 'var(--red)'
  const marcheColor = variationMarche != null ? (variationMarche >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text-2)'
  const sparkColor = variation >= 0 ? '#4ade80' : '#f87171'
  const pvColor = Number(stats.pv_realisee || 0) >= 0 ? 'var(--green)' : 'var(--red)'

  return (
    <section>
      <style>{`
        @media print {
          .sidebar, .topbar, .no-print { display: none !important; }
          .main { margin-left: 0 !important; padding: 0 !important; }
          .content { padding: 24px !important; }
          .blur-val { filter: none !important; }
          body { background: white !important; color: black !important; }
          .card { border: 1px solid #ddd !important; background: white !important; }
          .stat { background: white !important; border: 1px solid #ddd !important; }
          .tbl-wrap table { border-collapse: collapse; }
          .tbl-wrap th, .tbl-wrap td { border: 1px solid #eee !important; color: black !important; }
        }
      `}</style>

      {error && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Suivi mensuel</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Rapport mensuel.</h1>
          <p className="hero-subtitle">
            Synthèse complète de l&apos;activité du mois&nbsp;: évolution du patrimoine, mouvements, dividendes et alertes.
          </p>
        </div>
        <div className="card no-print" style={{ minWidth: 260, maxWidth: 320 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>Période</div>
          <MonthPicker value={mois} max={currentMonth()} onChange={setMois} />
        </div>
      </section>

      {loading && (
        <p style={{ color: 'var(--text-3)', fontSize: '.85rem', fontFamily: 'var(--mono)', padding: '24px 0' }}>
          Chargement...
        </p>
      )}

      {!loading && !error && (
        <>
          <div className="g3 fade-up" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="stat-label">Patrimoine début</div>
              <div className="stat-value dim">{eur(data?.valeur_debut)}</div>
              <div className="stat-sub">1er relevé du mois</div>
            </div>
            <div className="stat">
              <div className="stat-label">Patrimoine fin</div>
              <div className="stat-value dim">{eur(data?.valeur_fin)}</div>
              <div className="stat-sub">Dernier relevé du mois</div>
            </div>
            <div className="stat">
              <div className="stat-label">Variation totale</div>
              <div className="stat-value" style={{ color: varColor }}>
                {data?.variation != null ? eur(data.variation) : '—'}
              </div>
              <div className="stat-sub" style={{ color: varColor }}>
                {data?.variation_pct != null ? pct(data.variation_pct) : '—'}
              </div>
            </div>
          </div>

          <div className="g3 fade-up" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="stat-label">Performance marché</div>
              <div className="stat-value" style={{ color: marcheColor }}>
                {variationMarche != null ? eur(variationMarche) : '—'}
              </div>
              <div className="stat-sub" style={{ color: marcheColor }}>
                {data?.variation_marche_pct != null ? pct(data.variation_marche_pct) : '—'}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">Capital investi net</div>
              <div className="stat-value dim">{eur(stats.investissement_net)}</div>
              <div className="stat-sub">
                {mouvements.filter((m) => m.type_operation === 'achat').length} achat(s),{' '}
                {mouvements.filter((m) => m.type_operation === 'vente').length} vente(s)
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">PV réalisée</div>
              <div className="stat-value" style={{ color: pvColor }}>{eur(stats.pv_realisee)}</div>
              <div className="stat-sub">
                {mouvements.filter((m) => m.type_operation === 'vente').length} cession(s)
              </div>
            </div>
          </div>

          <div className="g3 fade-up" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="stat-label">Dividendes perçus</div>
              <div className="stat-value green">{eur(stats.total_dividendes)}</div>
              <div className="stat-sub">{stats.nb_dividendes || 0} versement(s)</div>
            </div>
            <div className="stat">
              <div className="stat-label">Achats bruts</div>
              <div className="stat-value dim">{eur(stats.total_achats)}</div>
              <div className="stat-sub">{mouvements.filter((m) => m.type_operation === 'achat').length} opération(s)</div>
            </div>
            <div className="stat">
              <div className="stat-label">Produit des ventes</div>
              <div className="stat-value dim">{eur(stats.total_ventes)}</div>
              <div className="stat-sub">{mouvements.filter((m) => m.type_operation === 'vente').length} cession(s)</div>
            </div>
          </div>

          {hist.length > 1 && (
            <div className="card fade-up" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div className="card-label">Évolution du patrimoine</div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--text-3)' }}>
                  {hist.length} relevé(s)
                </span>
              </div>
              <Sparkline data={hist} color={sparkColor} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--text-3)' }}>{hist[0]?.date}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--text-3)' }}>{hist[hist.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {hist.length === 0 && (
            <div className="card fade-up" style={{ marginBottom: 20 }}>
              <div className="card-label" style={{ marginBottom: 0 }}>Évolution du patrimoine</div>
              <div className="empty" style={{ padding: '20px 0' }}>
                <div className="empty-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <p>Aucune donnée historique pour ce mois.</p>
                <span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>
                  Les snapshots quotidiens apparaissent ici une fois enregistrés.
                </span>
              </div>
            </div>
          )}

          {/* Mouvements */}
          <div className="card fade-up-2" style={{ marginBottom: 20 }}>
            <div className="card-label" style={{ marginBottom: mouvements.length ? 16 : 0 }}>
              Opérations du mois
            </div>

            {!!mouvements.length && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Actif</th>
                      <th>Type</th>
                      <th>Enveloppe</th>
                      <th>Qté</th>
                      <th>Prix unit.</th>
                      <th>PRU cession</th>
                      <th>Montant net</th>
                      <th>PV réalisée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.map((m) => {
                      const pvVal = Number(m.pv_realisee || 0)
                      const pvCls = 'td-mono ' + (pvVal >= 0 ? 'green' : 'red')
                      return (
                        <tr key={m.id}>
                          <td className="td-mono dim">{m.date_operation || '-'}</td>
                          <td>
                            <div className="td-name">{m.actif_nom || m.ticker || '-'}</div>
                            {m.actif_nom && m.ticker && m.actif_nom !== m.ticker && (
                              <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{m.ticker}</div>
                            )}
                          </td>
                          <td>
                            <span className={m.type_operation === 'achat' ? 'badge' : 'badge badge-red'}>
                              {mouvLabel(m.type_operation)}
                            </span>
                          </td>
                          <td className="td-mono dim">{m.enveloppe || '-'}</td>
                          <td className="td-mono">{m.quantite != null ? Number(m.quantite).toLocaleString('fr-FR') : '-'}</td>
                          <td className="td-mono">{m.prix_unitaire != null ? eur(m.prix_unitaire) : '-'}</td>
                          <td className="td-mono dim">
                            {m.type_operation === 'vente' && m.pru_at_sale != null ? eur(m.pru_at_sale) : '-'}
                          </td>
                          <td className="td-mono strong">{eur(m.montant_net)}</td>
                          <td className={m.pv_realisee != null ? pvCls : 'td-mono dim'}>
                            {m.pv_realisee != null ? eur(m.pv_realisee) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!mouvements.length && (
              <div className="empty">
                <div className="empty-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="3" y1="15" x2="21" y2="15" />
                    <line x1="9" y1="9" x2="9" y2="21" />
                  </svg>
                </div>
                <p>Aucune opération ce mois-ci.</p>
              </div>
            )}
          </div>

          {/* Dividendes */}
          <div className="card fade-up-2" style={{ marginBottom: 20 }}>
            <div className="card-label" style={{ marginBottom: dividendes.length ? 16 : 0 }}>
              Dividendes du mois
            </div>

            {!!dividendes.length && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Valeur</th>
                      <th>Enveloppe</th>
                      <th>Montant net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividendes.map((d) => (
                      <tr key={d.id}>
                        <td className="td-mono dim">{d.date_versement || '-'}</td>
                        <td>
                          <div className="td-name">{d.nom || d.ticker || '-'}</div>
                          {d.nom && d.ticker && d.nom !== d.ticker && (
                            <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{d.ticker}</div>
                          )}
                        </td>
                        <td className="td-mono dim">{d.enveloppe || '-'}</td>
                        <td className="td-mono green">{eur(d.montant_net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!dividendes.length && (
              <div className="empty">
                <div className="empty-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.45 }}>
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="15" x2="12.01" y2="15" strokeWidth="2" />
                  </svg>
                </div>
                <p>Aucun dividende perçu ce mois-ci.</p>
              </div>
            )}
          </div>

          {/* Alertes */}
          {!!alertes.length && (
            <div className="card fade-up-2" style={{ marginBottom: 20 }}>
              <div className="card-label" style={{ marginBottom: 16 }}>
                Alertes déclenchées ce mois
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Valeur</th>
                      <th>Type</th>
                      <th>Seuil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertes.map((a) => (
                      <tr key={a.id}>
                        <td className="td-mono dim">{a.declenchee_le ? a.declenchee_le.slice(0, 10) : '-'}</td>
                        <td>
                          <div className="td-name">{a.nom || a.ticker || '-'}</div>
                          {a.nom && a.ticker && a.nom !== a.ticker && (
                            <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{a.ticker}</div>
                          )}
                        </td>
                        <td>
                          <span className={a.type_alerte === 'hausse' ? 'badge' : 'badge badge-red'}>
                            {a.type_alerte === 'hausse' ? 'Hausse' : 'Baisse'}
                          </span>
                        </td>
                        <td className="td-mono">{eur(a.seuil)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="fade-up-2 no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => window.print()}
            >
              Imprimer / exporter PDF
            </button>
          </div>
        </>
      )}
    </section>
  )
}
