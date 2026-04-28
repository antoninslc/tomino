import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'
import UpcomingEventsPanel from '../components/UpcomingEventsPanel'

function readStockFavorites() {
  try {
    const raw = localStorage.getItem('tomino_stock_favorites') || '[]'
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const HISTORY_METRICS = {
  valeur_totale: {
    label: 'Patrimoine total',
    color: '#18c37e',
    read: (h) => h?.valeur_totale,
    readInvestie: (h) => h?.valeur_investie ?? null,
  },
  actions: {
    label: 'Actions (PEA + CTO)',
    color: '#5dd6ff',
    read: (h) => {
      const pea = Number(h?.valeur_pea)
      const cto = Number(h?.valeur_cto)
      const values = [pea, cto].filter(v => Number.isFinite(v) && v > 0)
      return values.length ? values.reduce((a, v) => a + v, 0) : null
    },
    readInvestie: (h) => {
      const i = Number(h?.valeur_pea_investie ?? 0) + Number(h?.valeur_cto_investie ?? 0)
      return i > 0 ? i : null
    },
  },
  valeur_pea: {
    label: 'PEA',
    color: '#4ade80',
    read: (h) => h?.valeur_pea,
    readInvestie: (h) => h?.valeur_pea_investie ?? null,
  },
  valeur_cto: {
    label: 'CTO',
    color: '#60a5fa',
    read: (h) => h?.valeur_cto,
    readInvestie: (h) => h?.valeur_cto_investie ?? null,
  },
  valeur_assurance_vie: {
    label: 'Assurance vie',
    color: '#f59e0b',
    read: (h) => h?.valeur_assurance_vie,
    readInvestie: null,
  },
  valeur_or: {
    label: 'Or',
    color: '#c9a84c',
    read: (h) => h?.valeur_or,
    readInvestie: (h) => h?.valeur_or_investie ?? null,
  },
  valeur_crypto: {
    label: 'Crypto',
    color: '#f7931a',
    read: (h) => h?.valeur_crypto ?? null,
    readInvestie: null,
  },
  valeur_livrets: {
    label: 'Livrets',
    color: '#adb7c7',
    read: (h) => h?.valeur_livrets,
    readInvestie: null,
  },
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

const PERIODS = [
  { key: '7J',  days: 7 },
  { key: '1M',  days: 30 },
  { key: '3M',  days: 91 },
  { key: '6M',  days: 182 },
  { key: '1A',  days: 365 },
  { key: 'MAX', days: null },
]

const HISTORY_FETCH_LIMIT = 5000

function formatEur(v) {
  return Number(v).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function HistoryChart({ data = [], metric = 'valeur_totale' }) {
  const [period, setPeriod] = useState('MAX')
  const selectedMetric = HISTORY_METRICS[metric] || HISTORY_METRICS.valeur_totale

  const filteredData = useMemo(() => {
    const sorted = [...data]
      .filter(h => h.date)
      .sort((a, b) => a.date.localeCompare(b.date))
    const p = PERIODS.find(p => p.key === period)
    if (!p?.days) return sorted
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - p.days)
    const cutStr = cutoff.toISOString().slice(0, 10)
    return sorted.filter(h => h.date >= cutStr)
  }, [data, period])

  const chartData = useMemo(() => {
    return filteredData
      .map(h => {
        const raw = selectedMetric.read(h)
        const value = Number(raw)
        if (!Number.isFinite(value) || value === 0) return null
        const rawInvestie = selectedMetric.readInvestie ? selectedMetric.readInvestie(h) : null
        const investie = Number(rawInvestie)
        return {
          date: h.date.slice(0, 10),
          valeur: value,
          investie: Number.isFinite(investie) && investie > 0 ? investie : undefined,
        }
      })
      .filter(Boolean)
  }, [filteredData, selectedMetric])

  const perf = useMemo(() => {
    if (chartData.length < 2) return null
    const lastPoint = chartData[chartData.length - 1]
    const last = lastPoint.valeur
    // Si on a le cost basis, on montre le gain latent réel (valeur - investi)
    // Sinon, variation brute sur la période (trompeuse si DCA)
    if (lastPoint.investie != null && lastPoint.investie > 0) {
      const gain = last - lastPoint.investie
      return { abs: gain, pct: (gain / lastPoint.investie) * 100 }
    }
    const first = chartData[0].valeur
    if (!first) return null
    return { abs: last - first, pct: ((last - first) / first) * 100 }
  }, [chartData])

  const showInvestie = selectedMetric.readInvestie != null && chartData.some(d => d.investie != null)

  function formatXDate(iso) {
    if (!iso || iso === '-') return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    // Toujours afficher jour + mois pour éviter l'ambiguïté "mars 26" = mois/année ou jour/mois
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null
    const valeur = payload.find(p => p.dataKey === 'valeur')?.value
    const investie = showInvestie ? payload.find(p => p.dataKey === 'investie')?.value : null
    const gain = valeur != null && investie != null ? valeur - investie : null
    const gainPct = gain != null && investie > 0 ? (gain / investie) * 100 : null
    const d = new Date(label)
    const dateStr = Number.isNaN(d.getTime()) ? label : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    return (
      <div style={{ background: 'rgba(12,14,20,.97)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '.75rem', minWidth: 200 }}>
        <div style={{ color: '#718095', marginBottom: 8, fontSize: '.7rem', textTransform: 'uppercase', letterSpacing: '.06em' }}>{dateStr}</div>
        {valeur != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: investie ? 4 : 0 }}>
            <span style={{ color: '#718095' }}>Patrimoine</span>
            <span style={{ color: selectedMetric.color, fontWeight: 700 }}>{formatEur(valeur)}</span>
          </div>
        )}
        {investie != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: gain != null ? 6 : 0 }}>
            <span style={{ color: '#718095' }}>Investi</span>
            <span style={{ color: '#94a3b8' }}>{formatEur(investie)}</span>
          </div>
        )}
        {gain != null && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 6, display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <span style={{ color: '#718095' }}>Gain / Perte</span>
            <span style={{ color: gain >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
              {gain >= 0 ? '+' : ''}{formatEur(gain)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>
    )
  }

  if (chartData.length < 2) {
    return (
      <>
        <PeriodSelector period={period} setPeriod={setPeriod} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 280, color: 'var(--text-3)', fontSize: '.86rem', fontFamily: 'var(--mono)' }}>
          Pas assez de données sur cette période.
        </div>
      </>
    )
  }

  const allValues = chartData.flatMap(d => [d.valeur, d.investie].filter(Number.isFinite))
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const pad = (maxVal - minVal) * 0.08 || 500
  const yMin = Math.max(0, minVal - pad)
  const yMax = maxVal + pad

  const step = Math.max(1, Math.floor(chartData.length / 6))
  const xTicks = Array.from(new Set(
    chartData
      .filter((_, i) => i % step === 0 || i === chartData.length - 1)
      .map(d => d.date)
  ))

  const isPos = perf == null || perf.pct >= 0

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <PeriodSelector period={period} setPeriod={setPeriod} />
        {perf != null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isPos ? 'rgba(24,195,126,.1)' : 'rgba(239,68,68,.1)',
            border: `1px solid ${isPos ? 'rgba(24,195,126,.25)' : 'rgba(239,68,68,.25)'}`,
            borderRadius: 8, padding: '4px 10px',
            fontFamily: 'var(--mono)', fontSize: '.8rem', fontWeight: 700,
            color: isPos ? 'var(--green)' : 'var(--red)',
          }}>
            <span>{isPos ? '+' : ''}{formatEur(perf.abs)}</span>
            <span style={{ opacity: .55 }}>·</span>
            <span>{isPos ? '+' : ''}{perf.pct.toFixed(2)}%</span>
          </div>
        )}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="histGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={selectedMetric.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={selectedMetric.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatXDate}
            ticks={xTicks}
            tick={{ fill: '#718095', fontSize: 11, fontFamily: 'var(--mono)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tickFormatter={v => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €'}
            tick={{ fill: '#718095', fontSize: 11, fontFamily: 'var(--mono)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.07)' }}
            tickLine={false}
            width={88}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="valeur"
            stroke={selectedMetric.color}
            strokeWidth={2}
            fill="url(#histGradient)"
            dot={false}
            activeDot={{ r: 4, fill: selectedMetric.color, stroke: '#0b0d10', strokeWidth: 2 }}
            connectNulls
          />
          {showInvestie && (
            <Line
              type="monotone"
              dataKey="investie"
              stroke="#475569"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {showInvestie && (
        <div style={{ display: 'flex', gap: 20, marginTop: 12, fontFamily: 'var(--mono)', fontSize: '.74rem', color: '#718095', justifyContent: 'flex-end' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 18, height: 2, background: selectedMetric.color, borderRadius: 1 }} />
            Patrimoine
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 18, height: 0, border: '1px dashed #475569' }} />
            Capital investi
          </span>
        </div>
      )}
    </>
  )
}

function PeriodSelector({ period, setPeriod }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {PERIODS.map(p => (
        <button
          key={p.key}
          onClick={() => setPeriod(p.key)}
          style={{
            padding: '4px 10px',
            borderRadius: 7,
            border: '1px solid',
            borderColor: period === p.key ? 'rgba(24,195,126,.5)' : 'rgba(255,255,255,.1)',
            background: period === p.key ? 'rgba(24,195,126,.12)' : 'transparent',
            color: period === p.key ? 'var(--green)' : '#718095',
            fontFamily: 'var(--mono)',
            fontSize: '.78rem',
            fontWeight: period === p.key ? 700 : 400,
            cursor: 'pointer',
            transition: 'all .15s',
          }}
        >
          {p.key}
        </button>
      ))}
    </div>
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
    <div className="flex flex-col items-center gap-6 lg:flex-row">
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
  const [upcomingEvents, setUpcomingEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedHistoryMetric, setSelectedHistoryMetric] = useState('valeur_totale')
  const [reconstructing, setReconstructing] = useState(false)
  const [reconstructMsg, setReconstructMsg] = useState('')

  useEffect(() => {
    let mounted = true
    let retryCount = 0
    const MAX_RETRIES = 15   // 15 × 2s = 30s max pendant le démarrage du backend
    let retryTimer = null

    async function loadDashboard(isRetry = false) {
      try {
        if (!isRetry) { setLoading(true); setError('') }
        const [resumeData, histData, actifsData] = await Promise.all([
          api.get('/resume'),
          api.get(`/historique?limit=${HISTORY_FETCH_LIMIT}`),
          api.get('/actifs/all')
        ])
        if (!mounted) return
        retryCount = 0
        setError('')
        setResume(resumeData)
        setHistorique(Array.isArray(histData) ? histData : [])
        const all = Array.isArray(actifsData?.actifs) ? actifsData.actifs : []

        const actifsByTicker = new Map()
        for (const actif of all) {
          const ticker = String(actif?.ticker || '').trim().toUpperCase()
          if (!ticker) continue
          actifsByTicker.set(ticker, {
            ticker,
            nom: actif?.nom || ticker,
            quantite: Number(actif?.quantite || 0),
          })
        }

        for (const fav of readStockFavorites()) {
          const ticker = String(fav?.ticker || '').trim().toUpperCase()
          if (!ticker) continue
          const current = actifsByTicker.get(ticker)
          actifsByTicker.set(ticker, {
            ticker,
            nom: current?.nom || fav?.nom || ticker,
            quantite: Number(current?.quantite || 0),
          })
        }

        setActifsRecents([...all].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)).slice(0, 8))

        try {
          const eventsRes = await api.post('/evenements/prochains', {
            items: [...actifsByTicker.values()],
          })
          if (!mounted) return
          setUpcomingEvents(Array.isArray(eventsRes?.events) ? eventsRes.events : [])
        } catch {
          if (mounted) setUpcomingEvents([])
        }
      } catch (e) {
        if (!mounted) return
        const isNetworkError = e?.message?.toLowerCase().includes('fetch') || e?.message?.toLowerCase().includes('network')
        if (isNetworkError && retryCount < MAX_RETRIES) {
          // Backend pas encore prêt — réessayer silencieusement
          retryCount++
          setError(`__starting__`)
          retryTimer = setTimeout(() => loadDashboard(true), 2000)
          return
        }
        setError(e?.message || 'Impossible de charger le tableau de bord.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadDashboard()
    const id = window.setInterval(loadDashboard, 300000)

    return () => {
      mounted = false
      window.clearInterval(id)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [])

  async function lancerReconstruction() {
    setReconstructing(true)
    setReconstructMsg('')
    try {
      const res = await api.post('/historique/reconstruire', {})
      if (res.ok) {
        setReconstructMsg(`${res.points} points reconstruits (${res.tickers ?? '?'} tickers).`)
        const histData = await api.get(`/historique?limit=${HISTORY_FETCH_LIMIT}`)
        setHistorique(Array.isArray(histData) ? histData : [])
      } else {
        setReconstructMsg(res.erreur || 'Erreur lors de la reconstruction.')
      }
    } catch (e) {
      setReconstructMsg(e?.message || 'Erreur réseau.')
    } finally {
      setReconstructing(false)
    }
  }

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
      {(loading || error === '__starting__') && (
        <p className="text-text2">
          {error === '__starting__' ? 'Démarrage de Tomino\u00a0...' : 'Chargement des données...'}
        </p>
      )}

      {error && error !== '__starting__' && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {!loading && !error && resume && (() => {
        const isEmpty = !actifsRecents.length && Number(resume?.total || 0) === 0
        return (
        <>
          <section className="hero-strip fade-up">
            <div className="hero-copy">
              <div className="hero-kicker">Dashboard patrimonial</div>
              <h1 className="hero-title">Une vue nette de votre capital.</h1>
              <p className="hero-subtitle">Allocation, performance latente et évolution récente dans une interface sobre, dense et orientée décision.</p>
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

          {/* ── État vide ────────────────────────────────────────────── */}
          {isEmpty && (
            <div className="card fade-up" style={{ marginBottom: 24 }}>
              <div style={{ maxWidth: 480, marginBottom: 24 }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>Premiers pas</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
                  Votre patrimoine est vide pour l'instant.
                </div>
                <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.6 }}>
                  Commencez par ajouter vos actifs pour voir votre allocation, vos performances et l'évolution de votre patrimoine en temps réel.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Actions & ETF',   sub: 'PEA · CTO',         href: '/portefeuille/PEA' },
                  { label: 'Or',              sub: 'Lingots · pièces',   href: '/portefeuille/OR'  },
                  { label: 'Livrets',         sub: 'Livret A · LEP…',    href: '/livrets' },
                  { label: 'Assurance vie',   sub: 'Contrats en UC/fonds euro', href: '/assurance-vie' },
                ].map(({ label, sub, href }) => (
                  <a
                    key={label}
                    href={href}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px',
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.02)',
                      textDecoration: 'none',
                      transition: 'border-color .15s, background .15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(24,195,126,.4)'; e.currentTarget.style.background = 'rgba(24,195,126,.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--text)' }}>{label}</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--text-3)', marginTop: 2, fontFamily: 'var(--mono)' }}>{sub}</div>
                    </div>
                    <span style={{ color: 'var(--green)', fontSize: '1rem', marginLeft: 8 }}>→</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {isEmpty ? null : <>
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

          <div className="grid gap-4 lg:grid-cols-2 fade-up-2" style={{ marginBottom: 24 }}>
            <div className="card h-full">
              <div className="card-label" style={{ marginBottom: 16 }}>Allocation</div>
              <AllocationDonut parts={allocParts} />
            </div>
            <UpcomingEventsPanel
              title="Prochains événements"
              subtitle="Entreprises du portefeuille et favoris d’analyse"
              events={upcomingEvents}
              emptyText="Aucun événement trouvé pour le portefeuille et les favoris actuels."
              compact
              maxHeight={340}
            />
          </div>

          <div className="card fade-up-3" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div className="card-label" style={{ marginBottom: 6 }}>Évolution du patrimoine</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.03em' }}>Historique</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <CustomSelect
                  value={selectedHistoryMetric}
                  onChange={setSelectedHistoryMetric}
                  options={historyMetricOptions}
                  placeholder="Série"
                  minWidth={210}
                />
                <div className="badge badge-dim">{historique.length} pts</div>
                <button
                  onClick={lancerReconstruction}
                  disabled={reconstructing}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,.12)',
                    background: 'rgba(255,255,255,.04)',
                    color: reconstructing ? 'var(--text-3)' : 'var(--text-2)',
                    fontFamily: 'var(--mono)',
                    fontSize: '.78rem',
                    cursor: reconstructing ? 'not-allowed' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {reconstructing ? 'Reconstruction...' : 'Reconstruire'}
                </button>
              </div>
            </div>
            {reconstructMsg && (
              <div style={{ marginBottom: 12, fontFamily: 'var(--mono)', fontSize: '.78rem', color: 'var(--text-3)' }}>
                {reconstructMsg}
              </div>
            )}
            <HistoryChart data={historique} metric={selectedHistoryMetric} />
          </div>

          <div className="card fade-up-3">
            <div className="card-label">Positions récentes</div>
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
                      <td colSpan={7} className="td-mono dim">Aucune position saisie pour le moment.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </>}
        </>
        )
      })()}
    </section>
  )
}
