import { useMemo, useRef, useState } from 'react'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'

const TOTAL_STEPS = 6

const ENV_OPTIONS = [
  { value: 'PEA', label: 'PEA' },
  { value: 'CTO', label: 'CTO' },
  { value: 'OR', label: 'Or / matières premières' },
]

const TYPE_OPTIONS = [
  { value: 'etf', label: 'ETF' },
  { value: 'action', label: 'Action' },
]

const TYPE_OPTIONS_OR = [
  { value: 'or', label: 'Or / matière première' },
  { value: 'etf', label: 'ETF' },
  { value: 'action', label: 'Action' },
]

const STEP_1 = [
  { label: 'Court terme (< 3 ans)', value: 'court' },
  { label: 'Moyen terme (3-10 ans)', value: 'moyen' },
  { label: 'Long terme (> 10 ans)', value: 'long' },
]

const STEP_2 = [
  { label: '< 5% (Prudent)', value: 'prudent' },
  { label: '5-15% (Équilibré)', value: 'equilibre' },
  { label: '15-30% (Dynamique)', value: 'dynamique' },
  { label: '> 30% (Spéculatif)', value: 'speculatif' },
]

const STEP_3 = [
  { label: 'Faire croître mon capital', value: 'croissance' },
  { label: 'Générer des revenus', value: 'revenus' },
  { label: 'Préserver mon patrimoine', value: 'preservation' },
]

const STRATEGIES = [
  { label: 'Passive (ETF uniquement)', value: 'passive' },
  { label: 'Mixte', value: 'mixte' },
  { label: 'Active (stock picking)', value: 'active' },
]

const STYLES = [
  { label: 'Concis', value: 'concis' },
  { label: 'Détaillé', value: 'detaille' },
]

const TONS = [
  { label: 'Informel', value: 'informel' },
  { label: 'Formel', value: 'formel' },
]

const SECTEURS = [
  { label: 'Armement', value: 'armement' },
  { label: 'Tabac', value: 'tabac' },
  { label: 'Alcool', value: 'alcool' },
  { label: "Jeux d'argent", value: 'jeux_argent' },
  { label: 'Énergies fossiles', value: 'energies_fossiles' },
  { label: 'Aucun', value: 'aucun' },
]

const BENCHMARKS = [
  { label: 'MSCI World (CW8.PA)', value: 'CW8.PA' },
  { label: 'CAC 40 (^FCHI)', value: '^FCHI' },
  { label: 'S&P 500 (PSP5.PA)', value: 'PSP5.PA' },
]

function ChoiceCard({ selected, label, onClick, multi = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        border: selected ? '1px solid rgba(24,195,126,.55)' : '1px solid var(--line)',
        background: selected ? 'rgba(24,195,126,.12)' : 'rgba(255,255,255,.02)',
        borderRadius: 14,
        padding: '16px 18px',
        color: selected ? 'var(--text)' : 'var(--text-2)',
        fontSize: '.95rem',
        fontWeight: 600,
        transition: 'all .15s ease',
        cursor: 'pointer',
      }}
    >
      {multi ? (selected ? '☑ ' : '☐ ') : ''}
      {label}
    </button>
  )
}

export default function Onboarding() {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [horizon, setHorizon] = useState('')
  const [risque, setRisque] = useState('')
  const [objectif, setObjectif] = useState('')
  const [strategie, setStrategie] = useState('')
  const [styleIa, setStyleIa] = useState('')
  const [tonIa, setTonIa] = useState('')
  const [secteursExclus, setSecteursExclus] = useState([])
  const [benchmark, setBenchmark] = useState('')

  // Étape 6 — import positions existantes
  const [snapEnv, setSnapEnv] = useState('PEA')
  const [snapForm, setSnapForm] = useState({ nom: '', ticker: '', type: 'etf', quantite: '', pru: '', date_debut: new Date().toISOString().slice(0, 10) })
  const [snapSaving, setSnapSaving] = useState(false)
  const [snapSugg, setSnapSugg] = useState([])
  const [snapShowSugg, setSnapShowSugg] = useState(false)
  const [snapFocusedIdx, setSnapFocusedIdx] = useState(-1)
  const [snapAdded, setSnapAdded] = useState([])
  const snapNameRef = useRef(null)

  const progress = useMemo(() => (step / TOTAL_STEPS) * 100, [step])

  function toggleSecteur(value) {
    if (value === 'aucun') {
      setSecteursExclus([])
      return
    }
    setSecteursExclus((current) => {
      if (current.includes(value)) return current.filter((v) => v !== value)
      return [...current, value]
    })
  }

  function canGoNext() {
    if (step === 1) return Boolean(horizon)
    if (step === 2) return Boolean(risque)
    if (step === 3) return Boolean(objectif)
    if (step === 4) return Boolean(strategie && styleIa && tonIa)
    if (step === 5) return Boolean(benchmark)
    if (step === 6) return true
    return false
  }

  async function saveProfile() {
    await api.post('/profil', {
      horizon,
      risque,
      objectif,
      strategie,
      style_ia: styleIa,
      ton_ia: tonIa,
      secteurs_exclus: secteursExclus,
      pays_exclus: [],
      benchmark,
    })
    localStorage.setItem('tomino_onboarding_done', '1')
  }

  async function finish() {
    window.location.href = '/'
  }

  async function next() {
    if (!canGoNext()) return
    if (step === 5) {
      setSaving(true)
      setError('')
      try {
        await saveProfile()
        setStep(6)
        setTimeout(() => snapNameRef.current?.focus(), 120)
      } catch (e) {
        setError(e?.message || "Impossible d'enregistrer le profil.")
      } finally {
        setSaving(false)
      }
      return
    }
    if (step < TOTAL_STEPS) setStep((s) => s + 1)
  }

  function prev() {
    if (step > 1) setStep((s) => s - 1)
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
        enveloppe: snapEnv,
        nom: snapForm.nom,
        ticker: snapForm.ticker,
        type: snapForm.type,
        categorie: 'coeur',
        quantite: Number(snapForm.quantite || 0),
        pru: Number(snapForm.pru || 0),
        date_debut: snapForm.date_debut,
      })
      if (!res?.ok) throw new Error(res?.erreur || 'Erreur')
      setSnapAdded((prev) => [...prev, { env: snapEnv, nom: snapForm.nom, ticker: snapForm.ticker, quantite: snapForm.quantite, pru: snapForm.pru }])
      setSnapForm((f) => ({ nom: '', ticker: '', type: 'etf', quantite: '', pru: '', date_debut: f.date_debut }))
      setSnapSugg([])
      setSnapShowSugg(false)
      setTimeout(() => snapNameRef.current?.focus(), 80)
    } catch (e2) {
      setError(e2?.message || "Erreur lors de l'import")
    } finally {
      setSnapSaving(false)
    }
  }

  return (
    <section style={{ minHeight: '100vh', background: 'radial-gradient(1200px 500px at 100% 0%, rgba(24,195,126,.10), transparent 55%), var(--bg)' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 22px 40px' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontFamily: 'var(--mono)', fontSize: '.72rem', letterSpacing: '.08em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
            <span>Configuration du profil</span>
            <span>Étape {step}/{TOTAL_STEPS}</span>
          </div>
          <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, rgba(24,195,126,.9), rgba(110,231,255,.9))', transition: 'width .25s ease' }} />
          </div>
        </div>

        <div style={{ border: '1px solid var(--line)', borderRadius: 18, background: 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01))', padding: '26px 24px', minHeight: '68vh', display: 'flex', flexDirection: 'column' }}>
          {step === 1 && (
            <>
              <h1 style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 10 }}>Sur quelle durée investissez-vous ?</h1>
              <p style={{ color: 'var(--text-2)', marginBottom: 18 }}>Choisissez votre horizon d'investissement principal.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {STEP_1.map((item) => (
                  <ChoiceCard key={item.value} selected={horizon === item.value} label={item.label} onClick={() => setHorizon(item.value)} />
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 10 }}>Quelle perte temporaire accepteriez-vous sans paniquer ?</h1>
              <p style={{ color: 'var(--text-2)', marginBottom: 18 }}>Cela permet d'ajuster le niveau de risque des recommandations.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {STEP_2.map((item) => (
                  <ChoiceCard key={item.value} selected={risque === item.value} label={item.label} onClick={() => setRisque(item.value)} />
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 10 }}>Quel est votre objectif principal ?</h1>
              <p style={{ color: 'var(--text-2)', marginBottom: 18 }}>L'IA priorisera ses analyses en conséquence.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                {STEP_3.map((item) => (
                  <ChoiceCard key={item.value} selected={objectif === item.value} label={item.label} onClick={() => setObjectif(item.value)} />
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 10 }}>Stratégie et style IA</h1>
              <p style={{ color: 'var(--text-2)', marginBottom: 16 }}>Définissez votre approche et le format de réponse souhaité.</p>

              <h2 style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginBottom: 10 }}>Quelle est votre approche d'investissement ?</h2>
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                {STRATEGIES.map((item) => (
                  <ChoiceCard key={item.value} selected={strategie === item.value} label={item.label} onClick={() => setStrategie(item.value)} />
                ))}
              </div>

              <h2 style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginBottom: 10 }}>Comment souhaitez-vous que l'IA vous réponde ?</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ display: 'grid', gap: 10 }}>
                  {STYLES.map((item) => (
                    <ChoiceCard key={item.value} selected={styleIa === item.value} label={item.label} onClick={() => setStyleIa(item.value)} />
                  ))}
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {TONS.map((item) => (
                    <ChoiceCard key={item.value} selected={tonIa === item.value} label={item.label} onClick={() => setTonIa(item.value)} />
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <h1 style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 10 }}>Exclusions et benchmark</h1>
              <p style={{ color: 'var(--text-2)', marginBottom: 16 }}>Avant-dernière étape avant d'activer Tomino Intelligence.</p>

              <h2 style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginBottom: 10 }}>Secteurs à exclure</h2>
              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                {SECTEURS.map((item) => {
                  const selected = item.value === 'aucun' ? secteursExclus.length === 0 : secteursExclus.includes(item.value)
                  return (
                    <ChoiceCard
                      key={item.value}
                      selected={selected}
                      label={item.label}
                      onClick={() => toggleSecteur(item.value)}
                      multi
                    />
                  )
                })}
              </div>

              <h2 style={{ fontSize: '.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginBottom: 10 }}>Benchmark de référence</h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {BENCHMARKS.map((item) => (
                  <ChoiceCard key={item.value} selected={benchmark === item.value} label={item.label} onClick={() => setBenchmark(item.value)} />
                ))}
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <h1 style={{ fontSize: '2rem', lineHeight: 1.1, letterSpacing: '-.03em', marginBottom: 8 }}>Avez-vous déjà un portefeuille ?</h1>
              <p style={{ color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.5 }}>
                Entrez vos positions telles qu'elles apparaissent chez votre courtier. Le PRU est affiché sous "Prix de revient" ou "PRU". Cette étape est facultative — vous pourrez toujours les ajouter plus tard.
              </p>

              <form onSubmit={submitSnap} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 120 }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Enveloppe</div>
                    <CustomSelect options={ENV_OPTIONS} value={snapEnv} onChange={(v) => setSnapEnv(v)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 160, position: 'relative' }}>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Nom / Ticker *</div>
                    <input
                      ref={snapNameRef}
                      required
                      type="text"
                      className="form-input"
                      placeholder="Ex: CW8.PA, AAPL…"
                      value={snapForm.nom}
                      autoComplete="off"
                      onChange={(e) => {
                        setSnapForm((f) => ({ ...f, nom: e.target.value, ticker: '' }))
                        searchSnapTicker(e.target.value)
                      }}
                      onKeyDown={(e) => {
                        if (!snapShowSugg || !snapSugg.length) return
                        if (e.key === 'ArrowDown') { e.preventDefault(); setSnapFocusedIdx((i) => Math.min(i + 1, snapSugg.length - 1)) }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setSnapFocusedIdx((i) => Math.max(i - 1, 0)) }
                        else if (e.key === 'Enter' && snapFocusedIdx >= 0) { e.preventDefault(); pickSnapSuggestion(snapSugg[snapFocusedIdx]) }
                        else if (e.key === 'Escape') setSnapShowSugg(false)
                      }}
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
                    <CustomSelect
                      options={snapEnv === 'OR' ? TYPE_OPTIONS_OR : TYPE_OPTIONS}
                      value={snapForm.type}
                      onChange={(v) => setSnapForm((f) => ({ ...f, type: v }))}
                    />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Quantité *</div>
                    <input required type="number" step="any" min="0.0001" className="form-input" placeholder="Ex: 12.5" value={snapForm.quantite} onChange={(e) => setSnapForm((f) => ({ ...f, quantite: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>PRU (EUR) *</div>
                    <input required type="number" step="0.0001" min="0.0001" className="form-input" placeholder="Ex: 342.50" value={snapForm.pru} onChange={(e) => setSnapForm((f) => ({ ...f, pru: e.target.value }))} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Date de réf.</div>
                    <input type="date" className="form-input" value={snapForm.date_debut} onChange={(e) => setSnapForm((f) => ({ ...f, date_debut: e.target.value }))} />
                  </div>
                </div>

                <button type="submit" className="btn btn-ghost btn-sm" disabled={snapSaving}>
                  {snapSaving ? 'Ajout...' : '+ Ajouter cette ligne'}
                </button>
              </form>

              {snapAdded.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 8 }}>
                    {snapAdded.length} position{snapAdded.length > 1 ? 's' : ''} importée{snapAdded.length > 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {snapAdded.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.82rem', padding: '6px 10px', background: 'rgba(74,158,106,.08)', border: '1px solid rgba(74,158,106,.2)', borderRadius: 8 }}>
                        <span style={{ color: 'var(--text-1)' }}>{p.env} · {p.nom}{p.ticker ? ` (${p.ticker})` : ''}</span>
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--text-3)', fontSize: '.75rem' }}>{p.quantite} × {p.pru} EUR</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div style={{ marginTop: 14, border: '1px solid rgba(255,80,80,.45)', color: '#ff8585', borderRadius: 12, padding: '10px 12px', fontSize: '.88rem' }}>
              {error}
            </div>
          )}

          <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button type="button" className="btn btn-ghost" onClick={prev} disabled={step === 1 || step === 6}>Précédent</button>
            {step < TOTAL_STEPS ? (
              <button type="button" className="btn btn-primary" onClick={next} disabled={!canGoNext() || saving}>
                {saving ? 'Enregistrement...' : 'Suivant'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={finish}>
                {snapAdded.length > 0 ? `Terminer (${snapAdded.length} position${snapAdded.length > 1 ? 's' : ''} importée${snapAdded.length > 1 ? 's' : ''})` : 'Passer cette étape'}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}