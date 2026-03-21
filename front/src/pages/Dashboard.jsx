import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'

const HISTORY_METRICS = {
  valeur_totale: {
    label: 'Patrimoine total',
    color: '#18c37e',
    read: (h) => h?.valeur_totale
  },
  actions: {
    label: 'Actions (PEA + CTO + Assurance vie)',
    color: '#5dd6ff',
    read: (h) => {
      const pea = Number(h?.valeur_pea)
      const cto = Number(h?.valeur_cto)
      const av = Number(h?.valeur_assurance_vie)
      const values = [pea, cto, av].filter(Number.isFinite)
      if (!values.length) return null
      return values.reduce((acc, value) => acc + value, 0)
    }
  },
  valeur_pea: {
    label: 'PEA',
    color: '#4ade80',
    read: (h) => h?.valeur_pea
  },
  valeur_cto: {
    label: 'CTO',
    color: '#60a5fa',
    read: (h) => h?.valeur_cto
  },
  valeur_assurance_vie: {
    label: 'Assurance vie',
    color: '#f59e0b',
    read: (h) => h?.valeur_assurance_vie
  },
  valeur_or: {
    label: 'Or',
    color: '#c9a84c',
    read: (h) => h?.valeur_or
  },
  valeur_livrets: {
    label: 'Livrets',
    color: '#adb7c7',
    read: (h) => h?.valeur_livrets
  }
}

function eur(n) {
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n || 0))
  return <span className="blur-val">{fmt}</span>
}

function pct(n) {
  const v = Number(n || 0)
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function prettyDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR')
}

function HistoryChart({ data = [], metric = 'valeur_totale' }) {
  const selectedMetric = HISTORY_METRICS[metric] || HISTORY_METRICS.valeur_totale
  const chartData = data
    .map((h) => {
      const raw = selectedMetric.read(h)
      const value = Number(raw)
      if (!Number.isFinite(value)) return null
      return {
        date: h.date ? h.date.slice(0, 10) : '-',
        valeur: value
      }
    })
    .filter(Boolean)

  if (chartData.length < 2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'var(--text-3)', fontSize: '.86rem', fontFamily: 'var(--mono)' }}>
        Pas assez de points valides pour tracer cette série.
      </div>
    )
  }

  const values = chartData.map((d) => d.valeur)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const pad = (maxVal - minVal) * 0.08 || 500
  const yMin = Math.max(0, minVal - pad)
  const yMax = maxVal + pad

  function formatDate(iso) {
    if (!iso || iso === '-') return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  function formatEur(v) {
    return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  }

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'rgba(16,18,24,.96)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '.75rem' }}>
        <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
        <div style={{ color: 'var(--green)', fontWeight: 700 }}>{formatEur(payload[0].value)}</div>
      </div>
    )
  }

  // Limiter les ticks X à ~6 points répartis
  const step = Math.max(1, Math.floor(chartData.length / 6))
  const xTicks = Array.from(
    new Set(
      chartData
        .filter((_, i) => i % step === 0 || i === chartData.length - 1)
        .map((d) => d.date)
    )
  )

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={selectedMetric.color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={selectedMetric.color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          ticks={xTicks}
          tick={{ fill: '#718095', fontSize: 11, fontFamily: 'var(--mono)' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(v) => Number(v).toLocaleString('fr-FR') + ' €'}
          tick={{ fill: '#718095', fontSize: 11, fontFamily: 'var(--mono)' }}
          axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
          tickLine={false}
          width={88}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1 }} />
        <Area
          type="linear"
          dataKey="valeur"
          stroke={selectedMetric.color}
          strokeWidth={2}
          fill="url(#histGradient)"
          dot={false}
          activeDot={{ r: 4, fill: selectedMetric.color, stroke: '#0b0d10', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function AllocationDonut({ parts }) {
  const ordered = [...parts].sort((a, b) => b.pct - a.pct)
  const dominant = ordered[0] || { label: '-', pct: 0 }

  let cursor = 0
  const slices = ordered
    .map((p) => {
      const start = cursor
      cursor += p.pct
      return `${p.color} ${start}% ${cursor}%`
    })
    .join(', ')

  return (
    <div className="flex items-center gap-6">
      <div className="relative grid place-items-center">
        <div
          className="absolute -inset-4 rounded-full opacity-65"
          style={{
            background: 'radial-gradient(circle at 30% 25%, rgba(24,195,126,0.20), rgba(17,19,24,0) 65%)',
            filter: 'blur(8px)'
          }}
        />
        <div
          className="relative h-[268px] w-[268px] rounded-full border"
          style={{
            background: `conic-gradient(${slices || 'rgba(255,255,255,0.12) 0 100%'})`,
            borderColor: 'rgba(255,255,255,0.12)',
            boxShadow: '0 16px 42px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(255,255,255,0.08)'
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 flex h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border text-center"
          style={{
            borderColor: 'rgba(255,255,255,0.14)',
            background: 'linear-gradient(180deg, rgba(20,24,30,0.96) 0%, rgba(13,16,21,0.96) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)'
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-text3">Poids principal</div>
          <div className="mt-1 text-[1.15rem] font-bold text-text">{dominant.label}</div>
          <div className="font-mono text-xs text-text2">{dominant.pct.toFixed(1)}%</div>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {ordered.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between rounded-xl border px-3 py-2.5"
            style={{
              borderColor: 'rgba(255,255,255,0.10)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015))'
            }}
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color, boxShadow: `0 0 12px ${p.color}` }} />
              <span className="text-sm text-text2">{p.label}</span>
            </div>
            <span className="font-mono text-xs text-text">{p.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [resume, setResume] = useState(null)
  const [historique, setHistorique] = useState([])
  const [actifsRecents, setActifsRecents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedHistoryMetric, setSelectedHistoryMetric] = useState('valeur_totale')

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      try {
        setLoading(true)
        setError('')
        const [resumeData, histData, actifsData] = await Promise.all([
          api.get('/resume'),
          api.get('/historique'),
          api.get('/actifs/all')
        ])
        if (!mounted) return
        setResume(resumeData)
        setHistorique(Array.isArray(histData) ? histData : [])
        const all = Array.isArray(actifsData?.actifs) ? actifsData.actifs : []
        setActifsRecents([...all].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).slice(0, 8))
      } catch (e) {
        if (!mounted) return
        setError(e?.message || 'Erreur de chargement dashboard')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadDashboard()
    const id = window.setInterval(loadDashboard, 300000)

    return () => {
      mounted = false
      window.clearInterval(id)
    }
  }, [])

  const historyMetricOptions = useMemo(
    () => Object.entries(HISTORY_METRICS).map(([value, def]) => ({ value, label: def.label })),
    []
  )

  const blocs = resume
    ? [
        { label: 'Obligations', value: 0, pctValue: 0 },
        { label: 'Livrets', value: resume.livrets?.valeur_actuelle, pctValue: resume.livrets?.pct },
        { label: 'Or', value: resume.or?.valeur_actuelle, pctValue: resume.or?.pct },
        { label: 'Assurance vie', value: resume.assurance_vie?.valeur_actuelle, pctValue: resume.assurance_vie?.pct }
      ]
    : []

  const actionsValue = useMemo(() => {
    if (!resume) return 0
    return Number(resume.pea?.valeur_actuelle || 0) + Number(resume.cto?.valeur_actuelle || 0) + Number(resume.assurance_vie?.valeur_actuelle || 0)
  }, [resume])

  const actionsInvesti = useMemo(() => {
    if (!resume) return 0
    return Number(resume.pea?.valeur_investie || 0) + Number(resume.cto?.valeur_investie || 0) + Number(resume.assurance_vie?.valeur_investie || 0)
  }, [resume])

  const actionsPv = useMemo(() => {
    if (!resume) return 0
    const peaPv = Number(resume.pea?.pv_euros || 0)
    const ctoPv = Number(resume.cto?.pv_euros || 0)
    const avPv = Number(resume.assurance_vie?.pv_euros || 0)
    return peaPv + ctoPv + avPv
  }, [resume])

  const actionsPvPct = useMemo(() => {
    if (!resume || !actionsInvesti) return 0
    return (actionsPv / actionsInvesti) * 100
  }, [resume, actionsInvesti, actionsPv])

  const allocParts = useMemo(
    () => [
      { label: 'Actions', pct: Number(resume?.pea?.pct || 0) + Number(resume?.cto?.pct || 0) + Number(resume?.assurance_vie?.pct || 0), color: 'rgba(24,195,126,0.82)' },
      { label: 'Obligations', pct: 0, color: 'rgba(110,231,255,0.75)' },
      { label: 'Or', pct: Number(resume?.or?.pct || 0), color: 'rgba(201,168,76,0.8)' },
      { label: 'Livrets', pct: Number(resume?.livrets?.pct || 0), color: 'rgba(173,183,199,0.68)' }
    ],
    [resume]
  )

  return (
    <section>
      {loading && <p className="text-text2">Chargement des donnees...</p>}

      {error && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {!loading && !error && resume && (
        <>
          <section className="hero-strip fade-up">
            <div className="hero-copy">
              <div className="hero-kicker">Dashboard patrimonial</div>
              <h1 className="hero-title">Une vue nette de ton capital.</h1>
              <p className="hero-subtitle">Allocation, performance latente et evolution recente dans une interface sobre, dense et orientee decision.</p>
            </div>
            <div className="card" style={{ minWidth: 280, maxWidth: 320 }}>
              <div className="card-label">Net worth</div>
              <div className="stat-value">
                {eur(resume.total)}
              </div>
              <div className="stat-sub">Total investi · {eur(resume.total_investi)}</div>
              <div style={{ marginTop: 12 }}>
                <span className={`stat-pv ${Number(resume.pv_total) > 0 ? 'pos' : Number(resume.pv_total) < 0 ? 'neg' : 'neu'}`}>
                  {Number(resume.pv_total) > 0 ? '+' : ''}{eur(resume.pv_total)} · {pct(resume.pv_pct)}
                </span>
              </div>
            </div>
          </section>

          <div className="g4 fade-up" style={{ marginBottom: 12 }}>
            <div className="stat">
              <div className="stat-label">Actions</div>
              <div className="stat-value">{eur(actionsValue)}</div>
              <div className="stat-sub">Investi · {eur(actionsInvesti)}</div>
              <div style={{ marginTop: 8 }}>
                <span className={`stat-pv ${Number(actionsPv) > 0 ? 'pos' : Number(actionsPv) < 0 ? 'neg' : 'neu'}`}>
                  {Number(actionsPv) > 0 ? '+' : ''}{eur(actionsPv)} · {pct(actionsPvPct)}
                </span>
              </div>
            </div>

            {blocs.slice(0, 3).map((b, idx) => (
              <div key={b.label} className="stat">
                <div className="stat-label">{b.label} · {Number(b.pctValue || 0).toFixed(1)}%</div>
                <div className={`stat-value ${idx === 2 ? 'gold' : 'dim'}`}>{eur(b.value)}</div>
                <div className="stat-sub">
                  {b.label === 'Obligations' ? '0 ligne(s) · investi 0 €' : b.label === 'Livrets' ? `${resume.livrets?.nb || 0} livret(s) · investi ${eur(resume.livrets?.valeur_investie || 0)}` : b.label === 'Or' ? `${resume.or?.nb || 0} ligne(s) · investi ${eur(resume.or?.valeur_investie)}` : `${resume.assurance_vie?.nb || 0} contrat(s) · investi ${eur(resume.assurance_vie?.valeur_investie || 0)}`}
                </div>
                <div style={{ marginTop: 8 }}>
                  {b.label === 'Obligations' && <span className={`stat-pv`}>0 € · 0,00%</span>}
                  {b.label === 'Livrets' && <span className={`stat-pv neu`}>- · -</span>}
                  {b.label === 'Or' && <span className={`stat-pv ${Number(resume.or?.pv_euros) > 0 ? 'pos' : Number(resume.or?.pv_euros) < 0 ? 'neg' : 'neu'}`}>{Number(resume.or?.pv_euros) > 0 ? '+' : ''}{eur(resume.or?.pv_euros)} · {pct(resume.or?.pv_pct)}</span>}
                  {b.label === 'Assurance vie' && <span className={`stat-pv ${Number(resume.assurance_vie?.pv_euros) > 0 ? 'pos' : Number(resume.assurance_vie?.pv_euros) < 0 ? 'neg' : 'neu'}`}>{Number(resume.assurance_vie?.pv_euros) > 0 ? '+' : ''}{eur(resume.assurance_vie?.pv_euros)} · {pct(resume.assurance_vie?.pv_pct)}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="card fade-up-2" style={{ marginBottom: 24 }}>
            <div className="card-label" style={{ marginBottom: 16 }}>Allocation</div>
            <AllocationDonut parts={allocParts} />
          </div>

          <div className="card fade-up-3" style={{ marginBottom: 24 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16 }}>
              <div>
                <div className="card-label" style={{ marginBottom: 8 }}>Evolution</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Historique du patrimoine</div>
                <div style={{ marginTop: 6, color: 'var(--text-2)', fontSize: '.9rem' }}>Snapshots enregistrés chaque jour à 17h30 (heure de Paris) et lors des rafraîchissements.</div>
              </div>
              <div style={{ minWidth: 280, display: 'grid', gap: 8 }}>
                <CustomSelect
                  value={selectedHistoryMetric}
                  onChange={setSelectedHistoryMetric}
                  options={historyMetricOptions}
                  placeholder="Choisir une série"
                />
                <div className="badge badge-dim" style={{ justifySelf: 'end' }}>{historique.length} points</div>
              </div>
            </div>
            <HistoryChart data={historique} metric={selectedHistoryMetric} />
          </div>

          <div className="card fade-up-3">
            <div className="card-label">Positions recentes</div>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Enveloppe</th>
                    <th>Cours</th>
                    <th>PRU</th>
                    <th>Valeur</th>
                    <th>+/- Value</th>
                    <th>Perf.</th>
                  </tr>
                </thead>
                <tbody>
                  {actifsRecents.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="td-name">{a.nom}</div>
                        {!!a.ticker && <div className="td-ticker">{a.ticker}</div>}
                      </td>
                      <td>
                        {a.enveloppe === 'PEA' ? <span className="badge badge-green">PEA</span> : a.enveloppe === 'CTO' ? <span className="badge badge-dim">CTO</span> : <span className="badge badge-gold">Or</span>}
                      </td>
                      <td>{a.cours_ok ? <div className="td-mono strong">{eur(a.cours_actuel)}</div> : <span className="td-mono dim">-</span>}</td>
                      <td className="td-mono">{eur(a.pru)}</td>
                      <td className="td-mono strong">{eur(a.valeur_actuelle)}</td>
                      <td>{a.cours_ok ? <span className={`td-mono ${Number(a.pv_euros || 0) >= 0 ? 'green' : 'red'}`}>{eur(a.pv_euros)}</span> : <span className="td-mono dim">-</span>}</td>
                      <td>{a.cours_ok ? <span className={`td-mono ${Number(a.pv_pct || 0) >= 0 ? 'green' : 'red'}`}>{pct(a.pv_pct)}</span> : <span className="td-mono dim">-</span>}</td>
                    </tr>
                  ))}
                  {!actifsRecents.length && (
                    <tr>
                      <td colSpan={7} className="td-mono dim">Aucun actif saisi pour le moment.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
