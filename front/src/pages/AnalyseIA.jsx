import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../api'
import IaConsentModal, { hasIaConsent } from '../components/IaConsentModal'

const LABELS = {
  performance: 'Performance',
  arbitrage: 'Arbitrage',
  risques: 'Risques'
}

function AnalyseIcon({ type }) {
  const c = ICON_COLORS[type] || 'currentColor'
  if (type === 'arbitrage') return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 5.5H12.5M10 3L12.5 5.5L10 8" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12.5 9.5H2.5M5 7.5L2.5 10L5 12.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (type === 'risques') return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 1.5L13 4V8.5C13 11.5 10.5 13.5 7.5 14C4.5 13.5 2 11.5 2 8.5V4L7.5 1.5Z" stroke={c} strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M7.5 5.5V8.5" stroke={c} strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="7.5" cy="10.5" r="0.7" fill={c}/>
    </svg>
  )
  // performance (défaut)
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 10L5.5 6.5L8.5 8.5L13 3" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.5 3H13V5.5" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 13H13" stroke={c} strokeWidth="1.1" strokeLinecap="round" opacity=".4"/>
    </svg>
  )
}

function sanitizeType(type) {
  return ['performance', 'arbitrage', 'risques'].includes(type) ? type : 'performance'
}

function excerpt(text) {
  return String(text || '')
    .replace(/###|##|#|\*\*|`/g, '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodePossiblyEscapedText(text) {
  let markdown = String(text || '')

  if (/\\u[0-9a-fA-F]{4}|\\n|\\r|\\t/.test(markdown)) {
    markdown = markdown
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  }

  return markdown
}

function getTone(type) {
  if (type === 'arbitrage') return 'arb'
  if (type === 'risques') return 'risk'
  return 'perf'
}

const ICON_COLORS = {
  performance: 'var(--green)',
  arbitrage: '#c9a84c',
  risques: 'var(--red)',
}

function formatAnalyseDate(raw) {
  if (!raw || raw === '-') return '-'
  try {
    const d = new Date(String(raw).replace(' ', 'T'))
    if (Number.isNaN(d.getTime())) return raw
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const today = new Date().toISOString().slice(0, 10)
    const dateStr = d.toISOString().slice(0, 10)
    if (dateStr === today) return `Aujourd'hui à ${hh}:${mm}`
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} à ${hh}:${mm}`
  } catch {
    return raw
  }
}

function parseApiError(err, fallback) {
  const raw = String(err?.message || '')
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.erreur) return parsed.erreur
  } catch {
    // ignore JSON parse error
  }
  return raw || fallback
}

export default function Analyse() {
  const navigate = useNavigate()
  const [consent, setConsent] = useState(hasIaConsent())
  const [typeAnalyse, setTypeAnalyse] = useState('performance')
  const [historyMode, setHistoryMode] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [result, setResult] = useState('')
  const [resultMeta, setResultMeta] = useState(null)
  const [quota, setQuota] = useState(null)

  const rendered = useMemo(() => {
    marked.setOptions({ gfm: true, breaks: true })
    const markdown = decodePossiblyEscapedText(result || '')
    if (markdown.startsWith('[ERREUR]')) {
      return `<div class="analyse-error">${DOMPurify.sanitize(markdown)}</div>`
    }
    return DOMPurify.sanitize(marked.parse(markdown))
  }, [result])

  const analysesDuJour = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const map = {
      performance: null,
      arbitrage: null,
      risques: null,
    }
    for (const item of history) {
      const t = sanitizeType(item?.type_analyse)
      if (!map[t] && String(item?.date || '').startsWith(today)) {
        map[t] = item
      }
    }
    return map
  }, [history])

  const [countdown, setCountdown] = useState('')
  const [weeklyCountdown, setWeeklyCountdown] = useState('')
  useEffect(() => {
    function tick() {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      const diff = midnight - now
      if (diff <= 0) { setCountdown(''); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function tickWeekly() {
      if (!quota?.next_reset) {
        setWeeklyCountdown('')
        return
      }
      const now = Date.now()
      const end = new Date(quota.next_reset).getTime()
      if (Number.isNaN(end) || end <= now) {
        setWeeklyCountdown('00:00:00')
        return
      }
      const diff = end - now
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setWeeklyCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }
    tickWeekly()
    const id = setInterval(tickWeekly, 1000)
    return () => clearInterval(id)
  }, [quota?.next_reset])

  useEffect(() => {
    if (historyMode) return
    const cached = analysesDuJour[typeAnalyse]
    if (cached) {
      setResult(cached.reponse || '')
      setResultMeta({ id: cached.id ?? null, date: cached.date || '-', type: cached.type_analyse || typeAnalyse })
    } else {
      setResult('')
      setResultMeta(null)
    }
  }, [typeAnalyse, analysesDuJour, historyMode])

  useEffect(() => {
    ;(async () => {
      setLoadingHistory(true)
      try {
        const quotaData = await api.get('/ia/quota')
        setQuota(quotaData)

        const data = await api.get('/grok/historique')
        const analyses = Array.isArray(data?.analyses) ? data.analyses : []
        setHistory(analyses)
        if (analyses.length) {
          setResult(analyses[0].reponse || '')
          setResultMeta({
            id: analyses[0].id ?? null,
            date: analyses[0].date || '-',
            type: analyses[0].type_analyse || 'performance'
          })
        }
      } catch (e) {
        setError(parseApiError(e, "Impossible de charger l'historique"))
      } finally {
        setLoadingHistory(false)
      }
    })()
  }, [])

  async function runAnalysis(nextType = typeAnalyse) {
    if (quota?.blocked) {
      return
    }

    // Vérifie si une analyse de ce type a déjà été faite aujourd'hui (même comportement que l'ancien TODAY_CACHE)
    const today = new Date().toISOString().slice(0, 10)
    const cached = history.find(
      (a) => a.type_analyse === nextType && String(a.date || '').startsWith(today)
    )
    if (cached) {
      pickHistory(cached)
      setTypeAnalyse(nextType)
      return
    }

    setLoading(true)
    setError('')
    try {
      const data = await api.post('/grok/analyser', { type_analyse: nextType })
      setResult(data?.reponse || '')
      setTypeAnalyse(nextType)
      window.scrollTo({ top: 0, behavior: 'smooth' })

      const hist = await api.get('/grok/historique')
      const analyses = Array.isArray(hist?.analyses) ? hist.analyses : []
      setHistory(analyses)
      setResultMeta({
        id: data?.id ?? analyses[0]?.id ?? null,
        date: data?.date || analyses[0]?.date || '-',
        type: data?.type || nextType
      })
      const quotaData = await api.get('/ia/quota')
      setQuota(quotaData)
    } catch (e) {
      setError(parseApiError(e, "Erreur pendant l'analyse"))
      try {
        const quotaData = await api.get('/ia/quota')
        setQuota(quotaData)
      } catch {
        // silent
      }
    } finally {
      setLoading(false)
    }
  }

  function pickHistory(item) {
    setHistoryMode(true)
    setResult(item?.reponse || '')
    setResultMeta({
      id: item?.id ?? null,
      date: item?.date || '-',
      type: item?.type_analyse || 'performance'
    })
  }

  const dejaFaiteSelected = Boolean(analysesDuJour[typeAnalyse])

  return (
    <section>
      {!consent && (
        <IaConsentModal
          quota={quota}
          onAccept={() => setConsent(true)}
          onRefuse={() => navigate('/')}
        />
      )}
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Analyse de patrimoine</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Tomino Intelligence.</h1>
          <p className="hero-subtitle">Analyse contextuelle de votre patrimoine par Grok-3. Choisissez un axe d'analyse ci-contre.</p>
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div className="grok-grid fade-up">
        <div className="card" style={{ minHeight: 320 }}>
          {result ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <AnalyseIcon type={sanitizeType(resultMeta?.type || 'performance')} />
                </span>
                <span className={`type-badge ${sanitizeType(resultMeta?.type || 'performance')}`}>
                  {LABELS[sanitizeType(resultMeta?.type || 'performance')]}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)' }}>{formatAnalyseDate(resultMeta?.date)}</span>
              </div>

              {loading ? (
                <div className="analyse-loading">
                  <span className="dot" />
                  <span>Analyse Grok en cours...</span>
                </div>
              ) : (
                <div
                  className="analyse-body"
                  style={{ fontSize: '.9rem', lineHeight: 1.7, color: 'var(--text)' }}
                  dangerouslySetInnerHTML={{ __html: rendered }}
                />
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '56px 24px', color: 'var(--text-3)', textAlign: 'center' }}>
              <span style={{ opacity: .3 }}><AnalyseIcon type={typeAnalyse} /></span>
              <div style={{ fontSize: '.9rem', color: 'var(--text-2)' }}>Aucune analyse {LABELS[typeAnalyse].toLowerCase()} aujourd'hui</div>
              <div style={{ fontSize: '.78rem' }}>Lancez une analyse depuis le panneau de droite.</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-label">Lancer une analyse</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {[
                { type: 'performance', title: 'Performance', sub: 'Analyse des gains et pertes' },
                { type: 'arbitrage', title: 'Arbitrage', sub: 'Rééquilibrages suggérés' },
                { type: 'risques', title: 'Risques', sub: 'Concentration & vulnérabilités' }
              ].map((item) => {
                const dejaFaite = Boolean(analysesDuJour[item.type])
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => { setHistoryMode(false); setTypeAnalyse(item.type) }}
                    disabled={loading}
                    className={`btn-analyse ${getTone(item.type)}${!historyMode && typeAnalyse === item.type ? ' selected' : ''}`}
                  >
                    <span className="btn-icon"><AnalyseIcon type={item.type} /></span>
                    <div>
                      <div className="btn-label">{item.title}</div>
                      <div className="btn-sub">{item.sub}</div>
                    </div>
                    {dejaFaite && (
                      <span className="badge badge-dim btn-done-today" style={{ fontSize: '0.62rem' }}>Fait</span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              className="btn-rapport"
              onClick={() => runAnalysis(typeAnalyse)}
              disabled={loading || dejaFaiteSelected || quota?.blocked}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ display: 'block', marginLeft: 0 }} />
                  Analyse en cours...
                </>
              ) : quota?.blocked ? (
                <>Quota IA hebdo atteint · reset dans {weeklyCountdown || '...'}</>
              ) : dejaFaiteSelected ? (
                <>Déjà analysé · disponible dans {countdown}</>
              ) : (
                <>Analyser · {LABELS[typeAnalyse]} →</>
              )}
            </button>
            {quota?.max_analyse_calls != null && (
              <div style={{
                textAlign: 'center',
                fontSize: '0.72rem',
                fontFamily: 'var(--mono)',
                color: 'var(--text2)',
                marginTop: 6
              }}>
                {quota.analyse_calls} / {quota.max_analyse_calls} analyses cette semaine
              </div>
            )}
          </div>

          {history.filter(i => i.id !== resultMeta?.id).length > 0 && (
            <div className="card">
              <div className="card-label">Historique</div>
              <div style={{ marginTop: 8 }}>
                {history.filter(i => i.id !== resultMeta?.id).map((item, idx) => (
                  <div
                    key={item.id ?? `hist-${idx}`}
                    className={`hist-item${item.id != null && item.id === resultMeta?.id ? ' active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => pickHistory(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        pickHistory(item)
                      }
                    }}
                  >
                    <div className="hist-meta">
                      <span className={`type-badge ${sanitizeType(item.type_analyse)}`}>
                        {LABELS[sanitizeType(item.type_analyse)] || item.type_analyse}
                      </span>
                      <span className="hist-date">{formatAnalyseDate(item.date)}</span>
                    </div>
                    <div className="hist-excerpt">
                      {excerpt(item.reponse).slice(0, 100)}{excerpt(item.reponse).length > 100 ? '…' : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
