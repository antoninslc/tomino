import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { api } from '../api'

const LABELS = {
  performance: 'Performance',
  arbitrage: 'Arbitrage',
  risques: 'Risques'
}

const ICON_COLORS = {
  performance: 'var(--green)',
  arbitrage: '#c9a84c',
  risques: 'var(--red)',
}

function IconPerformance() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 11L5.5 7.5L8 9.5L12 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10.2 4.5H12V6.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconArbitrage() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5.5H12M9.5 3L12 5.5L9.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13 9.5H3M5.5 7L3 9.5L5.5 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconRisques() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 1.5L13 4V8C13 11 10.5 13 7.5 13.5C4.5 13 2 11 2 8V4L7.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M7.5 5.5V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <circle cx="7.5" cy="11" r="0.7" fill="currentColor"/>
    </svg>
  )
}

function renderIconAnalyse(type) {
  if (type === 'arbitrage') return <IconArbitrage />
  if (type === 'risques') return <IconRisques />
  return <IconPerformance />
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}>
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
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
  const [typeAnalyse, setTypeAnalyse] = useState('performance')
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
      return `<div class="analyse-error">${markdown}</div>`
    }
    return marked.parse(markdown)
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
      if (diff <= 0) { setCountdown('00:00:00'); return }
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
    const cached = analysesDuJour[typeAnalyse]
    if (cached) {
      setResult(cached.reponse || '')
      setResultMeta({ id: cached.id, date: cached.date || '-', type: cached.type_analyse || typeAnalyse })
    }
  }, [typeAnalyse, analysesDuJour])

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
            id: analyses[0].id,
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

      const hist = await api.get('/grok/historique')
      const analyses = Array.isArray(hist?.analyses) ? hist.analyses : []
      setHistory(analyses)
      setResultMeta({
        id: analyses[0]?.id,
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
    setResult(item?.reponse || '')
    setResultMeta({
      id: item?.id,
      date: item?.date || '-',
      type: item?.type_analyse || 'performance'
    })
  }

  const dejaFaiteSelected = Boolean(analysesDuJour[typeAnalyse])
  const activeType = sanitizeType(resultMeta?.type || 'performance')

  return (
    <section>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ color: ICON_COLORS[activeType], display: 'flex', alignItems: 'center' }}>
                  {renderIconAnalyse(activeType)}
                </span>
                <span className={`type-badge ${activeType}`}>
                  {LABELS[activeType]}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)' }}>{resultMeta?.date || '-'}</span>
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
              <div style={{ fontSize: '2rem', opacity: '.35' }}>◉</div>
              <div style={{ fontSize: '.9rem', color: 'var(--text-2)' }}>Aucune analyse pour l'instant</div>
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
                { type: 'arbitrage', title: 'Arbitrage', sub: 'Reequilibrages suggeres' },
                { type: 'risques', title: 'Risques', sub: 'Concentration & vulnerabilites' }
              ].map((item) => {
                const dejaFaite = Boolean(analysesDuJour[item.type])
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setTypeAnalyse(item.type)}
                    disabled={loading}
                    className={`btn-analyse ${getTone(item.type)}${typeAnalyse === item.type ? ' selected' : ''}`}
                  >
                    <span className="btn-icon">{renderIconAnalyse(item.type)}</span>
                    <div>
                      <div className="btn-label">{item.title}</div>
                      <div className="btn-sub">{item.sub}</div>
                    </div>
                    {dejaFaite && (
                      <span className="btn-done-today" title="Analyse déjà faite aujourd'hui">
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                          <path d="M2 5.5L4.5 8L9 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {quota?.max_analyse_calls != null && (
              <div style={{ fontSize: '.68rem', fontFamily: 'var(--mono)', color: 'var(--text-3)', textAlign: 'right', marginTop: 8 }}>
                {quota.analyse_calls ?? 0} / {quota.max_analyse_calls} analyses cette semaine
              </div>
            )}

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
                <><IconClock />Disponible dans {weeklyCountdown || '...'}</>
              ) : dejaFaiteSelected ? (
                <><IconClock />Disponible dans {countdown}</>
              ) : (
                <>Obtenir un rapport →</>
              )}
            </button>
          </div>

          {history.length > 0 && (
            <div className="card">
              <div className="card-label">Historique</div>
              <div style={{ marginTop: 8 }}>
                {history.map((item) => (
                  <div
                    key={item.id}
                    className={`hist-item${item.id === resultMeta?.id ? ' active' : ''}`}
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
                        {LABELS[sanitizeType(item.type_analyse)]}
                      </span>
                      <span className="hist-date">{item.date}</span>
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
