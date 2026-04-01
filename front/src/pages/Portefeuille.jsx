import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'

function eur(n) {
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n || 0))
  return <span className="blur-val">{fmt}</span>
}

function pct(n) {
  const v = Number(n || 0)
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function asEnv(raw) {
  const env = String(raw || 'PEA').toUpperCase()
  return ['PEA', 'CTO', 'OR'].includes(env) ? env : 'PEA'
}

function defaultFormForEnv(env) {
  return {
    nom: '',
    ticker: '',
    quantite: '',
    pru: '',
    type: env === 'OR' ? 'or' : 'action',
    categorie: 'coeur',
    date_achat: '',
    notes: ''
  }
}

function isCoreEtfSuggestion(item) {
  const ticker = String(item?.symbol || '').toUpperCase()
  const text = `${item?.name || ''} ${item?.symbol || ''}`.toLowerCase()

  const coreTickers = new Set([
    'CW8.PA', 'EWLD.PA', 'WPEA.PA', 'PSP5.PA', 'ESE.PA',
    'IWDA.AS', 'VWCE.DE', 'EUNL.DE', 'VUSA.L', 'VUAA.L', 'CSPX.L',
  ])

  if (coreTickers.has(ticker)) return true

  const coreKeywords = [
    'msci world', 'all-world', 'all world', 'acwi',
    's&p 500', 'sp 500', 'stoxx europe 600', 'europe 600',
    'nasdaq 100',
  ]

  return coreKeywords.some((k) => text.includes(k))
}

const TYPE_OPTIONS = [
  { value: 'action', label: 'Action' },
  { value: 'etf', label: 'ETF' },
]

const TYPE_OPTIONS_OR = [
  { value: 'action', label: 'Action' },
  { value: 'etf', label: 'ETF' },
  { value: 'or', label: 'Or / matière première' },
]

const CATEGORIE_OPTIONS = [
  { value: 'coeur', label: 'Cœur' },
  { value: 'satellite', label: 'Satellite' },
]

const GOLD_SUGGESTIONS = [
  { name: 'Amundi Physical Gold ETC', symbol: 'GOLD.PA', type: 'or', exchange: 'Euronext Paris' },
  { name: 'Amundi NYSE Arca Gold BUGS UCITS ETF', symbol: 'GBUG.PA', type: 'etf', exchange: 'Euronext Paris' },
  { name: 'iShares Physical Gold ETC', symbol: 'SGLN.L', type: 'or', exchange: 'LSE' },
  { name: 'Invesco Physical Gold ETC', symbol: 'SGLD.L', type: 'or', exchange: 'LSE' },
  { name: 'WisdomTree Physical Gold', symbol: 'PHAU.L', type: 'or', exchange: 'LSE' },
  { name: 'Xetra-Gold ETC', symbol: '4GLD.DE', type: 'or', exchange: 'XETRA' },
  { name: 'Or physique - Lingot 1kg', symbol: '', type: 'or', exchange: 'Physique' },
  { name: 'Or physique - Napoléon 20F', symbol: '', type: 'or', exchange: 'Physique' },
  { name: 'Or physique - Pièce 1 once', symbol: '', type: 'or', exchange: 'Physique' },
  { name: 'Barrick Gold', symbol: 'GOLD', type: 'equity', exchange: 'NYSE' },
  { name: 'Newmont Corp', symbol: 'NEM', type: 'equity', exchange: 'NYSE' },
  { name: 'Agnico Eagle Mines', symbol: 'AEM', type: 'equity', exchange: 'NYSE' },
]

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export default function Portefeuille() {
  const { env: envParam } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const env = useMemo(() => asEnv(envParam), [envParam])

  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [benchTicker, setBenchTicker] = useState('CW8.PA')
  const [benchData, setBenchData] = useState(null)
  const [benchError, setBenchError] = useState('')
  const [adding, setAdding] = useState(searchParams.get('new') === '1')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => defaultFormForEnv(env))
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [mergeHint, setMergeHint] = useState('')
  const [opModal, setOpModal] = useState({
    open: false,
    mode: 'create',
    mouvementId: null,
    type: 'achat',
    actif: null,
    quantite: '',
    prix_unitaire: '',
    frais: '0',
    date_operation: new Date().toISOString().slice(0, 10),
  })
  const [opSaving, setOpSaving] = useState(false)
  const [opDeleting, setOpDeleting] = useState(false)
  const [snapModal, setSnapModal] = useState({ open: false })
  const [snapForm, setSnapForm] = useState({ nom: '', ticker: '', type: 'etf', categorie: 'coeur', quantite: '', pru: '', date_debut: new Date().toISOString().slice(0, 10) })
  const [snapSaving, setSnapSaving] = useState(false)
  const [snapSugg, setSnapSugg] = useState([])
  const [snapShowSugg, setSnapShowSugg] = useState(false)
  const [snapFocusedIdx, setSnapFocusedIdx] = useState(-1)
  const [snapAdded, setSnapAdded] = useState([])
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (!opModal.open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [opModal.open])

  useEffect(() => {
    if (!snapModal.open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [snapModal.open])

  function setAddingQuery(open) {
    const next = new URLSearchParams(searchParams)
    if (open) next.set('new', '1')
    else next.delete('new')
    setSearchParams(next, { replace: true })
    setAdding(open)
  }

  function openInlineForm() {
    setAddingQuery(true)
    setTimeout(() => {
      const el = document.getElementById('position-form')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function closeInlineForm() {
    setAddingQuery(false)
    setForm(defaultFormForEnv(env))
    setSuggestions([])
    setShowSuggestions(false)
    setFocusedIdx(-1)
    setMergeHint('')
  }

  async function load() {
    try {
      setLoading(true)
      setError('')
      const data = await api.get(`/actifs?env=${encodeURIComponent(env)}`)
      setPayload(data)
    } catch (e) {
      setError(e?.message || 'Erreur de chargement portefeuille')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = window.setInterval(load, 300000)
    return () => window.clearInterval(id)
  }, [env])

  useEffect(() => {
    const open = searchParams.get('new') === '1'
    setAdding(open)
    setForm(defaultFormForEnv(env))
    setSuggestions([])
    setShowSuggestions(false)
    setFocusedIdx(-1)
    setMergeHint('')
  }, [env, searchParams])

  useEffect(() => {
    if (!adding) return
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 120)
    return () => window.clearTimeout(id)
  }, [adding])

  const actifs = (payload?.actifs || []).filter((a) => Number(a?.quantite || 0) > 0)
  const mouvements = payload?.mouvements || []
  const stats = payload?.stats || {}
  const statsCoeur = payload?.stats_coeur || {}
  const statsSatellite = payload?.stats_satellite || {}

  const donutPct = useMemo(() => {
    const c = Number(statsCoeur?.valeur_actuelle || 0)
    const s = Number(statsSatellite?.valeur_actuelle || 0)
    const t = c + s
    if (t <= 0) return 0
    return (c / t) * 100
  }, [statsCoeur, statsSatellite])

  const oldestDate = useMemo(() => {
    const ds = actifs
      .map((a) => String(a?.date_achat || '').trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
    return ds[0] || ''
  }, [actifs])

  useEffect(() => {
    if (env !== 'PEA') return
    if (!oldestDate || !/^\d{4}-\d{2}-\d{2}$/.test(oldestDate)) return

    async function loadBenchmark() {
      try {
        setBenchError('')
        const qs = new URLSearchParams({ ticker: benchTicker, depuis: oldestDate }).toString()
        const data = await api.get(`/benchmark?${qs}`)
        if (data?.ok === false) throw new Error('Benchmark indisponible')
        setBenchData(data)
      } catch {
        setBenchData(null)
        setBenchError('Benchmark indisponible pour cette periode.')
      }
    }

    loadBenchmark()
    const id = window.setInterval(loadBenchmark, 300000)
    return () => window.clearInterval(id)
  }, [benchTicker, oldestDate, env])

  async function searchTicker(query) {
    const q = query.trim()
    if (env === 'OR') {
      const nq = normalizeText(q)
      const base = GOLD_SUGGESTIONS.filter((item) => {
        if (!nq) return true
        const haystack = normalizeText(`${item.name} ${item.symbol} ${item.exchange}`)
        return haystack.includes(nq)
      }).slice(0, 8)

      setSuggestions(base)
      setShowSuggestions(base.length > 0)
      setFocusedIdx(-1)
      return
    }

    if (q.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(q)}`)
      setSuggestions(Array.isArray(data) ? data : [])
      setShowSuggestions(Array.isArray(data) && data.length > 0)
      setFocusedIdx(-1)
    } catch {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  async function checkMerge(symbol) {
    const t = String(symbol || '').trim().toUpperCase()
    if (!t) {
      setMergeHint('')
      return
    }
    try {
      const data = await api.get(`/position_existante?ticker=${encodeURIComponent(t)}&env=${encodeURIComponent(env)}`)
      if (data?.existant) {
        setMergeHint(`Position existante detectee - ${data.quantite} titres a PRU ${data.pru} EUR. Cet achat sera fusionne automatiquement.`)
      } else {
        setMergeHint('')
      }
    } catch {
      setMergeHint('')
    }
  }

  function pickSuggestion(item) {
    const inferredType = item.type === 'etf' || item.type === 'mutualfund'
      ? 'etf'
      : item.type === 'equity'
      ? 'action'
      : form.type
    const inferredCategorie = env === 'PEA'
      ? (inferredType === 'etf'
          ? (isCoreEtfSuggestion(item) ? 'coeur' : 'satellite')
          : inferredType === 'action'
            ? 'satellite'
            : form.categorie)
      : form.categorie

    setForm((f) => ({
      ...f,
      nom: item.name || f.nom,
      ticker: String(item.symbol || '').toUpperCase(),
      type: inferredType,
      categorie: inferredCategorie,
    }))
    setShowSuggestions(false)
    setSuggestions([])
    checkMerge(item.symbol)
  }

  function onNameKeyDown(e) {
    if (!showSuggestions || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((idx) => Math.min(idx + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((idx) => Math.max(idx - 1, 0))
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault()
      pickSuggestion(suggestions[focusedIdx])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setFocusedIdx(-1)
    }
  }

  async function createPosition(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/actifs', {
        enveloppe: env,
        nom: form.nom.trim(),
        ticker: form.ticker.trim().toUpperCase(),
        quantite: Number(form.quantite || 0),
        pru: Number(form.pru || 0),
        type: env === 'OR' ? form.type : form.type,
        categorie: env === 'PEA' ? form.categorie : 'coeur',
        date_achat: form.date_achat,
        notes: form.notes.trim()
      })
      await load()
      closeInlineForm()
    } catch (e2) {
      setError(e2?.message || 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  function openOperationModal(type, actif) {
    setOpModal({
      open: true,
      mode: 'create',
      mouvementId: null,
      type,
      actif,
      quantite: '',
      prix_unitaire: '',
      frais: '0',
      date_operation: new Date().toISOString().slice(0, 10),
    })
  }

  function openEditOperationModal(mouvement) {
    const actifs = payload?.actifs || []
    const actif = actifs.find((a) => Number(a.id) === Number(mouvement.actif_id))
    if (!actif) {
      setError('Impossible de retrouver la position liée à cette opération.')
      return
    }

    setOpModal({
      open: true,
      mode: 'edit',
      mouvementId: Number(mouvement.id),
      type: mouvement.type_operation === 'vente' ? 'vente' : 'achat',
      actif,
      quantite: String(mouvement.quantite ?? ''),
      prix_unitaire: String(mouvement.prix_unitaire ?? ''),
      frais: String(mouvement.frais ?? '0'),
      date_operation: mouvement.date_operation || new Date().toISOString().slice(0, 10),
    })
  }

  function closeOperationModal() {
    if (opSaving) return
    setOpModal((m) => ({ ...m, open: false, actif: null }))
  }

  async function submitOperation(e) {
    e.preventDefault()
    if (!opModal.actif?.id || opSaving) return

    setOpSaving(true)
    setError('')
    try {
      if (opModal.mode === 'edit' && opModal.mouvementId) {
        await api.put(`/mouvements/${opModal.mouvementId}`, {
          quantite: Number(opModal.quantite || 0),
          prix_unitaire: Number(opModal.prix_unitaire || 0),
          frais: Number(opModal.frais || 0),
          date_operation: opModal.date_operation,
        })
      } else {
        await api.post(`/actifs/${opModal.actif.id}/operation`, {
          type_operation: opModal.type,
          quantite: Number(opModal.quantite || 0),
          prix_unitaire: Number(opModal.prix_unitaire || 0),
          frais: Number(opModal.frais || 0),
          date_operation: opModal.date_operation,
        })
      }
      await load()
      closeOperationModal()
    } catch (e2) {
      setError(e2?.message || (opModal.mode === 'edit' ? 'Modification impossible' : 'Opération impossible'))
    } finally {
      setOpSaving(false)
    }
  }

  async function deleteOperation() {
    if (!opModal.mouvementId || opDeleting) return
    setOpDeleting(true)
    setError('')
    try {
      await api.del(`/mouvements/${opModal.mouvementId}`)
      await load()
      closeOperationModal()
    } catch (e2) {
      setError(e2?.message || 'Suppression impossible')
    } finally {
      setOpDeleting(false)
    }
  }

  function openSnapModal() {
    setSnapModal({ open: true })
    setSnapForm({ nom: '', ticker: '', type: 'etf', categorie: 'coeur', quantite: '', pru: '', date_debut: new Date().toISOString().slice(0, 10) })
    setSnapAdded([])
    setSnapSugg([])
    setSnapShowSugg(false)
  }

  function closeSnapModal() {
    setSnapModal({ open: false })
    if (snapAdded.length > 0) load()
  }

  async function searchSnapTicker(q) {
    const query = q.trim()
    if (query.length < 2) { setSnapSugg([]); setSnapShowSugg(false); return }
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(query)}`)
      setSnapSugg(Array.isArray(data) ? data : [])
      setSnapShowSugg(Array.isArray(data) && data.length > 0)
      setSnapFocusedIdx(-1)
    } catch {
      setSnapSugg([])
      setSnapShowSugg(false)
    }
  }

  function pickSnapSuggestion(item) {
    const inferredType = item.type === 'etf' || item.type === 'mutualfund' ? 'etf' : item.type === 'equity' ? 'action' : snapForm.type
    setSnapForm((f) => ({ ...f, nom: item.name || f.nom, ticker: String(item.symbol || '').toUpperCase(), type: inferredType }))
    setSnapSugg([])
    setSnapShowSugg(false)
  }

  async function submitSnap(e) {
    e.preventDefault()
    if (snapSaving) return
    setSnapSaving(true)
    try {
      const res = await api.post('/actifs/snapshot', {
        enveloppe: env,
        nom: snapForm.nom,
        ticker: snapForm.ticker,
        type: snapForm.type,
        categorie: snapForm.categorie,
        quantite: Number(snapForm.quantite || 0),
        pru: Number(snapForm.pru || 0),
        date_debut: snapForm.date_debut,
      })
      if (!res?.ok) throw new Error(res?.erreur || 'Erreur')
      setSnapAdded((prev) => [...prev, { nom: snapForm.nom, ticker: snapForm.ticker, quantite: snapForm.quantite, pru: snapForm.pru }])
      setSnapForm((f) => ({ nom: '', ticker: '', type: 'etf', categorie: 'coeur', quantite: '', pru: '', date_debut: f.date_debut }))
      setSnapSugg([])
      setSnapShowSugg(false)
    } catch (e2) {
      alert(e2?.message || "Erreur lors de l'import")
    } finally {
      setSnapSaving(false)
    }
  }

  return (
    <section>
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">{env}</div>
          <h1 className="hero-title">Portefeuille {env}.</h1>
          <p className="hero-subtitle">Suivi des lignes, valorisation temps reel et separation claire entre exposition coeur et satellite.</p>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
          {env === 'PEA' && (
            <div style={{ minWidth: 220, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 0 }}>
              <div className="card-label" style={{ color: 'var(--text-3)' }}>Repartition</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 10 }}>
                <div className="h-[88px] w-[88px] rounded-full" style={{ background: `conic-gradient(rgba(245,247,251,0.22) 0 ${donutPct}%, rgba(24,195,126,0.78) ${donutPct}% 100%)` }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.56rem', color: 'var(--text-3)', letterSpacing: '.15em', marginBottom: 2 }}>COEUR</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-2)' }}>{eur(statsCoeur.valeur_actuelle)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.56rem', color: 'var(--green)', letterSpacing: '.15em', marginBottom: 2 }}>SATELLITE</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--green)' }}>{eur(statsSatellite.valeur_actuelle)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ minWidth: 260, maxWidth: 340 }}>
            <div className="card-label">Exposition</div>
            <div className={`stat-value ${env === 'OR' ? 'gold' : 'dim'}`}>{eur(stats.valeur_actuelle)}</div>
            <div className="stat-sub">{stats.nb || 0} ligne(s) · investi {eur(stats.valeur_investie)}</div>
          </div>
        </div>
      </section>

      <div className="tabs">
        {['PEA', 'CTO', 'OR'].map((key) => (
          <NavLink key={key} to={`/portefeuille/${key}`} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            {key}
          </NavLink>
        ))}
      </div>

      <div className={`g${env === 'PEA' ? '4' : '3'} fade-up`} style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Valeur actuelle</div>
          <div className={`stat-value ${env === 'OR' ? 'gold' : 'dim'}`}>{eur(stats.valeur_actuelle)}</div>
          <div className="stat-sub">{stats.nb || 0} ligne(s)</div>
          <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: '.68rem', color: 'var(--text-3)' }}>
            TRI global : {typeof stats.tri === 'number' ? <span style={{ color: stats.tri >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{pct(stats.tri)}/an</span> : <span>-</span>}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Montant investi</div>
          <div className="stat-value dim">{eur(stats.valeur_investie)}</div>
          <div className="stat-sub">Prix de revient total</div>
        </div>
        <div className="stat">
          <div className="stat-label">+/- Value latente</div>
          <div className={`stat-value ${Number(stats.pv_euros || 0) >= 0 ? 'green' : 'red'}`}>{eur(stats.pv_euros)}</div>
          <div className="stat-sub">{pct(stats.pv_pct)} de performance</div>
        </div>
        {env === 'PEA' && (
          <div className="stat">
            <div className="stat-label">Coeur / Satellite</div>
            <div style={{ display: 'flex', gap: 0, marginTop: 10 }}>
              <div style={{ flex: 1, paddingRight: 16, borderRight: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text-3)', letterSpacing: '.15em', marginBottom: 4 }}>COEUR</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text-2)' }}>{eur(statsCoeur.valeur_actuelle)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--text-3)', marginTop: 4 }}>{statsCoeur.nb || 0} ligne(s)</div>
              </div>
              <div style={{ flex: 1, paddingLeft: 16 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--green)', letterSpacing: '.15em', marginBottom: 4 }}>SATELLITE</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--green)' }}>{eur(statsSatellite.valeur_actuelle)}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.6rem', color: 'var(--text-3)', marginTop: 4 }}>{statsSatellite.nb || 0} ligne(s)</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {env === 'PEA' && (
        <div className="card fade-up-2" style={{ marginBottom: 20 }}>
          <div className="card-label">Performance vs Benchmark</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button type="button" className="btn btn-ghost btn-sm" style={{ borderColor: benchTicker === 'CW8.PA' ? 'rgba(24,195,126,.35)' : undefined }} onClick={() => setBenchTicker('CW8.PA')}>MSCI World (CW8.PA)</button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ borderColor: benchTicker === '^FCHI' ? 'rgba(24,195,126,.35)' : undefined }} onClick={() => setBenchTicker('^FCHI')}>CAC 40 (^FCHI)</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginBottom: 10 }}>
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text-3)', letterSpacing: '.15em', marginBottom: 6, textTransform: 'uppercase' }}>Date de reference</div>
              <div style={{ fontSize: '.92rem', fontWeight: 700 }}>{oldestDate || '1 an'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text-3)', letterSpacing: '.15em', marginBottom: 6, textTransform: 'uppercase' }}>Portefeuille PEA</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(stats.pv_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(stats.pv_pct)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid var(--line)', borderRadius: 12, padding: 12 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text-3)', letterSpacing: '.15em', marginBottom: 6, textTransform: 'uppercase' }}>Benchmark</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(benchData?.perf_pct || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {benchData ? pct(benchData.perf_pct) : '—'}
              </div>
            </div>
          </div>
          <div style={{ fontSize: '.92rem', color: benchError ? '#f5a524' : 'var(--text-2)' }}>
            {benchError || (benchData ? (Number(stats.pv_pct || 0) - Number(benchData.perf_pct || 0) >= 0 ? `Vous battez l'indice de ${(Number(stats.pv_pct || 0) - Number(benchData.perf_pct || 0)).toFixed(2)}%` : `L'indice vous devance de ${Math.abs(Number(stats.pv_pct || 0) - Number(benchData.perf_pct || 0)).toFixed(2)}%`) : 'Chargement...')}
          </div>
        </div>
      )}

      {loading && <p className="text-text2">Chargement des donnees...</p>}
      {error && (
        <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="card fade-up-2">
          {!!actifs.length && (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th>Type</th>
                    {env === 'PEA' && <th>Categorie</th>}
                    <th>Qte</th>
                    <th>PRU</th>
                    <th>Cours actuel</th>
                    <th>Valeur</th>
                    <th>+/- Value EUR</th>
                    <th>Perf. %</th>
                    <th>TRI/an</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {actifs.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="td-name">{a.nom}</div>
                        {!!a.ticker && <div className="td-ticker">{a.ticker}</div>}
                        {!!a.notes && <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{String(a.notes).slice(0, 45)}{String(a.notes).length > 45 ? '…' : ''}</div>}
                      </td>
                      <td>
                        {a.type === 'etf' ? <span className="badge badge-gold">ETF</span> : a.type === 'action' ? <span className="badge badge-dim">Action</span> : <span className="badge badge-gold">Or</span>}
                      </td>
                      {env === 'PEA' && (
                        <td>
                          {a.categorie === 'coeur' ? <span className="tag-coeur">Coeur</span> : <span className="tag-satellite">Satellite</span>}
                        </td>
                      )}
                      <td className="td-mono">{a.quantite}</td>
                      <td className="td-mono">{eur(a.pru)}</td>
                      <td>{a.cours_ok ? <div className="td-mono strong">{eur(a.cours_actuel)}</div> : <span className="td-mono dim">-</span>}</td>
                      <td className="td-mono strong">{eur(a.valeur_actuelle)}</td>
                      <td>{a.cours_ok ? <span className={`td-mono ${Number(a.pv_euros || 0) >= 0 ? 'green' : 'red'}`}>{eur(a.pv_euros)}</span> : <span className="td-mono dim">-</span>}</td>
                      <td>{a.cours_ok ? <span className={`td-mono ${Number(a.pv_pct || 0) >= 0 ? 'green' : 'red'}`}>{pct(a.pv_pct)}</span> : <span className="td-mono dim">-</span>}</td>
                      <td>{typeof a.tri === 'number' ? <span className={`td-mono ${a.tri >= 0 ? 'green' : 'red'}`}>{pct(a.tri)}/an</span> : <span className="td-mono dim">-</span>}</td>
                      <td>
                        <div className="actions-cell">
                          <button
                            type="button"
                            className="btn btn-sm"
                            title="Renforcer"
                            onClick={() => openOperationModal('achat', a)}
                            style={{ background: 'rgba(74,158,106,.15)', border: '1px solid rgba(74,158,106,.45)', color: '#9ce6b7' }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            title="Céder"
                            onClick={() => openOperationModal('vente', a)}
                            style={{ background: 'rgba(158,74,74,.15)', border: '1px solid rgba(158,74,74,.45)', color: '#efaaaa' }}
                          >
                            -
                          </button>
                          <Link to={`/actifs/modifier/${a.id}?env=${env}`} className="btn btn-ghost btn-sm">Editer</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!actifs.length && !adding && (
            <FirstSteps env={env} onAdd={openInlineForm} onSnap={openSnapModal} navigate={navigate} />
          )}

          {!!actifs.length && !adding && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={openInlineForm}>+ Nouvelle ligne</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={openSnapModal}>Importer positions existantes</button>
            </div>
          )}

          {adding && (
            <form id="position-form" onSubmit={createPosition} style={{ marginTop: 18 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
                <div className="card-label">Nouvelle ligne ({env})</div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={closeInlineForm}>Fermer</button>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ position: 'relative' }}>
                  <label className="form-label">Nom *</label>
                  <input
                    ref={nameInputRef}
                    required
                    className="form-input"
                    value={form.nom}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm((f) => ({ ...f, nom: v }))
                      searchTicker(v)
                    }}
                    onFocus={() => setShowSuggestions(suggestions.length > 0)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                    onKeyDown={onNameKeyDown}
                    placeholder={env === 'OR' ? 'ex : iShares Physical Gold ETC' : 'ex : Amundi MSCI World'}
                    autoComplete="off"
                  />

                  {showSuggestions && suggestions.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#1a1d22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', zIndex: 30, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                      {suggestions.map((item, i) => (
                        <button
                          type="button"
                          key={`${item.symbol}-${i}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            pickSuggestion(item)
                          }}
                          style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', textAlign: 'left', border: 0, color: 'var(--text)', background: focusedIdx === i ? 'rgba(255,255,255,0.06)' : 'transparent', cursor: 'pointer' }}
                        >
                          <span style={{ fontSize: '.875rem' }}>{item.name}</span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{item.symbol}{item.exchange ? ` · ${item.exchange}` : ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Ticker Yahoo</label>
                  <input
                    className="form-input"
                    value={form.ticker}
                    onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                    onBlur={(e) => checkMerge(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <CustomSelect
                    value={form.type}
                    onChange={(next) => setForm((f) => ({ ...f, type: next }))}
                    options={env === 'OR' ? TYPE_OPTIONS_OR : TYPE_OPTIONS}
                  />
                </div>
                {env === 'PEA' ? (
                  <div className="form-group">
                    <label className="form-label">Catégorie</label>
                    <CustomSelect
                      value={form.categorie}
                      onChange={(next) => setForm((f) => ({ ...f, categorie: next }))}
                      options={CATEGORIE_OPTIONS}
                    />
                  </div>
                ) : (
                  <div className="form-group" />
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Quantite *</label>
                  <input required type="number" step="any" min="0" className="form-input" value={form.quantite} onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">PRU (EUR) *</label>
                  <input required type="number" step="0.0001" min="0" className="form-input" value={form.pru} onChange={(e) => setForm((f) => ({ ...f, pru: e.target.value }))} />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date d'achat</label>
                  <input type="date" className="form-input" value={form.date_achat} onChange={(e) => setForm((f) => ({ ...f, date_achat: e.target.value }))} />
                </div>
                <div className="form-group" />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea rows={3} className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>

              {!!mergeHint && (
                <div style={{ marginBottom: 12, fontSize: '.8rem', color: 'var(--text-2)' }}>{mergeHint}</div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement...' : 'Ajouter'}</button>
                <button type="button" className="btn btn-ghost" onClick={closeInlineForm}>Annuler</button>
              </div>
            </form>
          )}

          {!!mouvements.length && (
            <div style={{ marginTop: 24 }}>
              <div className="card-label" style={{ marginBottom: 10 }}>Historique des opérations</div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Instrument</th>
                      <th>Quantité</th>
                      <th>Prix unitaire</th>
                      <th>Frais</th>
                      <th>Montant net</th>
                      <th>PV réalisée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mouvements.map((m) => {
                      const isEditableRow = Number(m.actif_id || 0) > 0 && m.type_operation !== 'snapshot'
                      return (
                      <tr
                        key={m.id}
                        onClick={isEditableRow ? () => openEditOperationModal(m) : undefined}
                        style={isEditableRow ? { cursor: 'pointer' } : undefined}
                        title={isEditableRow ? 'Cliquer pour modifier cette opération' : undefined}
                      >
                        <td className="td-mono dim" style={{ fontSize: '.7rem' }}>{m.date_operation || '-'}</td>
                        <td>
                          {m.type_operation === 'achat'
                            ? <span className="badge" style={{ borderColor: 'rgba(74,158,106,.55)', color: '#9ce6b7' }}>Achat</span>
                            : m.type_operation === 'snapshot'
                            ? <span className="badge" style={{ borderColor: 'rgba(100,140,200,.45)', color: '#aac4ef' }}>Position initiale</span>
                            : <span className="badge" style={{ borderColor: 'rgba(158,74,74,.55)', color: '#efaaaa' }}>Vente</span>}
                        </td>
                        <td>
                          <div className="td-name">{m.actif_nom || '-'}</div>
                        </td>
                        <td className="td-mono">{Number(m.quantite || 0).toFixed(4)}</td>
                        <td className="td-mono">{eur(m.prix_unitaire)}</td>
                        <td className="td-mono">{eur(m.frais)}</td>
                        <td className="td-mono strong">{eur(m.montant_net)}</td>
                        <td>
                          {m.type_operation === 'vente'
                            ? <span className={`td-mono ${Number(m.pv_realisee || 0) >= 0 ? 'green' : 'red'}`}>{eur(m.pv_realisee)}</span>
                            : <span className="td-mono dim">-</span>}
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {opModal.open && opModal.actif && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(4, 8, 13, .68)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={closeOperationModal}
        >
          <form
            onSubmit={submitOperation}
            className="card"
            style={{ width: 'min(560px, 100%)' }}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <div className="card-label" style={{ marginBottom: 4 }}>
                  {opModal.mode === 'edit'
                    ? (opModal.type === 'achat' ? 'Modifier un renforcement' : 'Modifier une cession')
                    : (opModal.type === 'achat' ? 'Renforcer une position' : 'Céder une position')}
                </div>
                <div style={{ fontSize: '.86rem', color: 'var(--text-2)' }}>
                  {opModal.actif.nom} {opModal.actif.ticker ? `(${opModal.actif.ticker})` : ''}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeOperationModal}>Fermer</button>
            </div>

            <div style={{ marginBottom: 12, fontSize: '.8rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
              Position actuelle : {opModal.actif.quantite} titres · PRU {Number(opModal.actif.pru || 0).toFixed(4)} EUR
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date de l'opération</label>
                <input
                  required
                  type="date"
                  className="form-input"
                  value={opModal.date_operation}
                  onChange={(e) => setOpModal((m) => ({ ...m, date_operation: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Quantité</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="any"
                  className="form-input"
                  value={opModal.quantite}
                  onChange={(e) => setOpModal((m) => ({ ...m, quantite: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Prix unitaire (EUR)</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.0001"
                  className="form-input"
                  value={opModal.prix_unitaire}
                  onChange={(e) => setOpModal((m) => ({ ...m, prix_unitaire: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Frais (EUR)</label>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={opModal.frais}
                  onChange={(e) => setOpModal((m) => ({ ...m, frais: e.target.value }))}
                />
              </div>
            </div>

            {opModal.type === 'vente' && (
              <div style={{ marginBottom: 14, fontSize: '.82rem', color: 'var(--text-2)' }}>
                La vente ne peut pas dépasser la quantité détenue. La plus-value réalisée sera calculée automatiquement.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              {opModal.mode === 'edit' && opModal.type === 'achat' && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={opDeleting}
                  onClick={deleteOperation}
                  style={{ marginRight: 'auto', color: '#ef9090', borderColor: 'rgba(158,74,74,.4)' }}
                >
                  {opDeleting ? 'Suppression...' : 'Supprimer'}
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={closeOperationModal}>Annuler</button>
              <button
                type="submit"
                className="btn"
                disabled={opSaving}
                style={opModal.type === 'achat'
                  ? { background: 'rgba(74,158,106,.18)', border: '1px solid rgba(74,158,106,.5)', color: '#9ce6b7' }
                  : { background: 'rgba(158,74,74,.18)', border: '1px solid rgba(158,74,74,.5)', color: '#efaaaa' }}
              >
                {opSaving
                  ? 'Enregistrement...'
                  : (opModal.mode === 'edit'
                    ? 'Enregistrer les modifications'
                    : (opModal.type === 'achat' ? 'Confirmer le renfort' : 'Confirmer la cession'))}
              </button>
            </div>
          </form>
        </div>
      )}

      {snapModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 120,
            background: 'rgba(4, 8, 13, .68)',
            backdropFilter: 'blur(4px)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSnapModal() }}
        >
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', letterSpacing: '.18em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 6 }}>Import</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6 }}>Reprendre un portefeuille existant</div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                Entrez vos positions telles qu'elles apparaissent chez votre courtier. Le PRU est affiché dans votre interface courtier sous "Prix de revient" ou "PRU".
              </div>
            </div>

            <form onSubmit={submitSnap}>
              <div className="form-group" style={{ position: 'relative', marginBottom: 12 }}>
                <label className="form-label">Nom / Ticker *</label>
                <input
                  required
                  type="text"
                  className="form-input"
                  placeholder="Ex: MSCI World, CW8.PA…"
                  value={snapForm.nom}
                  onChange={(e) => {
                    setSnapForm((f) => ({ ...f, nom: e.target.value, ticker: '' }))
                    searchSnapTicker(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (!snapShowSugg || !snapSugg.length) return
                    if (e.key === 'ArrowDown') { e.preventDefault(); setSnapFocusedIdx((i) => Math.min(i + 1, snapSugg.length - 1)) }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); setSnapFocusedIdx((i) => Math.max(i - 1, 0)) }
                    else if (e.key === 'Enter' && snapFocusedIdx >= 0) { e.preventDefault(); pickSnapSuggestion(snapSugg[snapFocusedIdx]) }
                    else if (e.key === 'Escape') { setSnapShowSugg(false) }
                  }}
                  autoComplete="off"
                />
                {snapShowSugg && snapSugg.length > 0 && (
                  <ul className="suggestions">
                    {snapSugg.map((item, i) => (
                      <li
                        key={item.symbol || i}
                        className={snapFocusedIdx === i ? 'focused' : ''}
                        onMouseDown={() => pickSnapSuggestion(item)}
                      >
                        <span className="sug-name">{item.name}</span>
                        <span className="sug-meta">{item.symbol}{item.exchange ? ` · ${item.exchange}` : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {snapForm.ticker && (
                <div style={{ marginBottom: 12, fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--text-3)' }}>
                  Ticker : {snapForm.ticker}
                </div>
              )}

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <CustomSelect
                    options={env === 'OR' ? TYPE_OPTIONS_OR : TYPE_OPTIONS}
                    value={snapForm.type}
                    onChange={(v) => setSnapForm((f) => ({ ...f, type: v }))}
                  />
                </div>
                {env === 'PEA' && (
                  <div className="form-group">
                    <label className="form-label">Catégorie</label>
                    <CustomSelect
                      options={CATEGORIE_OPTIONS}
                      value={snapForm.categorie}
                      onChange={(v) => setSnapForm((f) => ({ ...f, categorie: v }))}
                    />
                  </div>
                )}
              </div>

              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Quantité détenue *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.0001"
                    className="form-input"
                    placeholder="Ex: 12.5"
                    value={snapForm.quantite}
                    onChange={(e) => setSnapForm((f) => ({ ...f, quantite: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">PRU (EUR) *</label>
                  <input
                    required
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    className="form-input"
                    placeholder="Ex: 342.50"
                    value={snapForm.pru}
                    onChange={(e) => setSnapForm((f) => ({ ...f, pru: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 18 }}>
                <label className="form-label">Date de référence</label>
                <input
                  type="date"
                  className="form-input"
                  value={snapForm.date_debut}
                  onChange={(e) => setSnapForm((f) => ({ ...f, date_debut: e.target.value }))}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={snapSaving}>
                {snapSaving ? 'Ajout en cours...' : '+ Ajouter cette position'}
              </button>
            </form>

            {snapAdded.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {snapAdded.length} position{snapAdded.length > 1 ? 's' : ''} importée{snapAdded.length > 1 ? 's' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {snapAdded.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.82rem', padding: '6px 10px', background: 'rgba(74,158,106,.08)', border: '1px solid rgba(74,158,106,.2)', borderRadius: 8 }}>
                      <span style={{ color: 'var(--text-1)' }}>{p.nom}{p.ticker ? ` (${p.ticker})` : ''}</span>
                      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', fontSize: '.75rem' }}>{p.quantite} × {p.pru} EUR</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={closeSnapModal}>
                {snapAdded.length > 0 ? 'Terminer' : 'Annuler'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const FIRST_STEPS = {
  PEA: {
    subtitle: "Commencez à construire votre portefeuille actions et ETF. Le PEA offre une exonération d'impôt sur les plus-values après 5 ans.",
    actions: [
      { label: 'Ajouter une action ou un ETF', sub: 'Nouvelle position dans le PEA', icon: '+', action: 'add' },
      { label: 'Reprendre un portefeuille existant', sub: 'Importer vos positions actuelles avec PRU', icon: '⇩', action: 'snap' },
      { label: 'Voir la répartition', sub: 'Cœur / satellite et géographie', icon: '◎', action: 'repartition' },
      { label: 'Suivre les dividendes', sub: 'Centraliser les versements reçus', icon: '↗', action: 'dividendes' },
    ],
  },
  CTO: {
    subtitle: "Le CTO permet d'investir sans plafond et sur tous les marchés. Idéal pour compléter le PEA.",
    actions: [
      { label: 'Ajouter une action ou un ETF', sub: 'Nouvelle position dans le CTO', icon: '+', action: 'add' },
      { label: 'Reprendre un portefeuille existant', sub: 'Importer vos positions actuelles avec PRU', icon: '⇩', action: 'snap' },
      { label: 'Suivre les dividendes', sub: 'Centraliser les versements reçus', icon: '↗', action: 'dividendes' },
    ],
  },
  OR: {
    subtitle: "L'or est une réserve de valeur historique. Ajoutez vos positions physiques ou ETC pour les suivre aux cours actuels.",
    actions: [
      { label: 'Ajouter une position or', sub: 'Lingot, pièce, ETC ou minier', icon: '+', action: 'add' },
      { label: 'Reprendre un portefeuille existant', sub: 'Importer vos positions actuelles avec PRU', icon: '⇩', action: 'snap' },
      { label: 'Voir la répartition globale', sub: 'Tous portefeuilles confondus', icon: '◎', action: 'repartition' },
    ],
  },
}

function FirstSteps({ env, onAdd, onSnap, navigate }) {
  const config = FIRST_STEPS[env] || FIRST_STEPS.PEA

  function handleAction(action) {
    if (action === 'add') { onAdd(); return }
    if (action === 'snap') { onSnap(); return }
    if (action === 'repartition') { navigate(`/repartition/${env}`); return }
    if (action === 'dividendes') { navigate('/dividendes'); return }
  }

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, padding: '28px 24px', margin: '8px 0' }}>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
        Premiers pas — {env}
      </div>
      <p style={{ fontSize: '.88rem', color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 20, maxWidth: 520 }}>
        {config.subtitle}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {config.actions.map((item) => (
          <button
            key={item.action}
            type="button"
            onClick={() => handleAction(item.action)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '12px 14px',
              background: 'transparent', border: '1px solid transparent', borderRadius: 12,
              cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
              transition: 'background .15s, border-color .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'var(--line)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <span style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: 'rgba(24,195,126,0.10)', border: '1px solid rgba(24,195,126,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--mono)', fontSize: '.82rem', color: 'var(--green)',
            }}>
              {item.icon}
            </span>
            <span>
              <span style={{ display: 'block', fontSize: '.88rem', fontWeight: 600 }}>{item.label}</span>
              <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--text-3)', marginTop: 2 }}>{item.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
