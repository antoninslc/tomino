import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

function formatSeuil(val) {
  return Number(val || 0).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 4,
  })
}

function formatCours(val) {
  if (val == null) return '—'
  return Number(val).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 4,
  })
}

function formatDate(val) {
  if (!val) return '—'
  try {
    const d = new Date(val.replace(' ', 'T') + 'Z')
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return val
  }
}

const TYPE_LABELS = { hausse: 'Hausse ↑', baisse: 'Baisse ↓' }
const TYPE_COLORS = { hausse: 'var(--green)', baisse: 'var(--red)' }

const EMPTY_FORM = { ticker: '', nom: '', type_alerte: 'hausse', seuil: '' }

export default function Alertes() {
  const [alertes, setAlertes] = useState([])
  const [coursCourants, setCoursCourants] = useState({})
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [declencheesRecentes, setDeclencheesRecentes] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const pollingRef = useRef(null)

  async function load() {
    try {
      setLoading(true)
      setError('')
      const data = await api.get('/alertes')
      const liste = Array.isArray(data?.alertes) ? data.alertes : []
      setAlertes(liste)

      // Récupérer les cours actuels pour les alertes actives
      const actives = liste.filter((a) => a.active === 1)
      const tickers = [...new Set(actives.map((a) => a.ticker).filter(Boolean))]
      const cours = {}
      await Promise.allSettled(
        tickers.map(async (ticker) => {
          try {
            const d = await api.get(`/cours/${ticker}`)
            if (d?.prix) cours[ticker] = d.prix
          } catch {
            // Pas bloquant
          }
        })
      )
      setCoursCourants(cours)
    } catch (e) {
      setError(e?.message || 'Erreur de chargement des alertes')
    } finally {
      setLoading(false)
    }
  }

  async function checkAlertes() {
    try {
      const data = await api.get('/alertes/check')
      const declenchees = Array.isArray(data?.declenchees) ? data.declenchees : []
      if (declenchees.length > 0) {
        setDeclencheesRecentes(declenchees)
        await load()
      }
    } catch {
      // Polling silencieux
    }
  }

  useEffect(() => {
    load()
    pollingRef.current = setInterval(checkAlertes, 60000)
    return () => clearInterval(pollingRef.current)
  }, [])

  async function searchTicker(q) {
    const query = q.trim()
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    try {
      const data = await api.get(`/search?q=${encodeURIComponent(query)}`)
      setSuggestions(Array.isArray(data) ? data : [])
      setShowSuggestions(Array.isArray(data) && data.length > 0)
      setFocusedIdx(-1)
    } catch {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  function pickSuggestion(item) {
    setForm((f) => ({
      ...f,
      nom: item.name || f.nom,
      ticker: String(item.symbol || '').toUpperCase(),
    }))
    setShowSuggestions(false)
    setSuggestions([])
  }

  function onNomKeyDown(e) {
    if (!showSuggestions || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIdx((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && focusedIdx >= 0) {
      e.preventDefault()
      pickSuggestion(suggestions[focusedIdx])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setFocusedIdx(-1)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.post('/alertes', {
        ticker: form.ticker.trim().toUpperCase(),
        nom: form.nom.trim(),
        type_alerte: form.type_alerte,
        seuil: Number(form.seuil),
      })
      setForm(EMPTY_FORM)
      await load()
    } catch (e2) {
      setError(e2?.message || "Impossible d'ajouter l'alerte")
    } finally {
      setSaving(false)
    }
  }

  async function removeAlerte(id) {
    if (!window.confirm('Supprimer cette alerte ?')) return
    setError('')
    try {
      await api.del(`/alertes/${id}`)
      await load()
    } catch (e) {
      setError(e?.message || 'Suppression impossible')
    }
  }

  const actives = alertes.filter((a) => a.active === 1)
  const historique = alertes.filter((a) => a.active === 0)

  return (
    <section>
      {/* Bandeau alertes récemment déclenchées */}
      {declencheesRecentes.length > 0 && (
        <div
          className="fade-up"
          style={{
            marginBottom: 20,
            borderRadius: 12,
            background: 'rgba(239,68,68,.12)',
            border: '1px solid rgba(239,68,68,.45)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
          }}
        >
          <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--red)', marginBottom: 6, fontSize: '.88rem' }}>
              {declencheesRecentes.length} alerte{declencheesRecentes.length > 1 ? 's' : ''} déclenchée{declencheesRecentes.length > 1 ? 's' : ''} !
            </div>
            {declencheesRecentes.map((a, i) => (
              <div key={i} style={{ fontSize: '.82rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text-1)' }}>{a.ticker}</strong>
                {a.nom ? ` — ${a.nom}` : ''} :{' '}
                seuil {TYPE_LABELS[a.type_alerte] || a.type_alerte} à{' '}
                <span style={{ color: TYPE_COLORS[a.type_alerte] || 'inherit' }}>{formatSeuil(a.seuil)}</span>
                {' '}atteint (cours actuel : {formatCours(a.cours_actuel)})
              </div>
            ))}
          </div>
          <button
            onClick={() => setDeclencheesRecentes([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1.1rem', lineHeight: 1, padding: 0 }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Hero */}
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Suivi en temps réel</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Alertes sur seuils de prix.</h1>
          <p className="hero-subtitle">
            Définissez des seuils de hausse ou de baisse sur vos actifs. Vous êtes notifié dès qu'un cours franchit la limite fixée.
          </p>
        </div>
        <div className="card" style={{ minWidth: 280, maxWidth: 340 }}>
          <div className="card-label">Alertes actives</div>
          <div className="stat-value" style={{ color: actives.length > 0 ? 'var(--green)' : 'var(--text-3)' }}>{actives.length}</div>
          <div className="stat-sub">{historique.length} déclenchée{historique.length > 1 ? 's' : ''} au total</div>
        </div>
      </section>

      {/* Formulaire d'ajout */}
      <form onSubmit={onSubmit} className="card fade-up-2" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: 14 }}>Créer une alerte</div>

        <div className="form-row">
          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label">Nom</label>
            <input
              className="form-input"
              value={form.nom}
              onChange={(e) => { const v = e.target.value; setForm((f) => ({ ...f, nom: v })); searchTicker(v) }}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
              onKeyDown={onNomKeyDown}
              placeholder="Ex : Airbus"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#1a1d22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', zIndex: 30, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                {suggestions.map((item, i) => (
                  <button
                    type="button"
                    key={`${item.symbol}-${i}`}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(item) }}
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
            <label className="form-label">Ticker *</label>
            <input
              required
              className="form-input"
              value={form.ticker}
              onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              placeholder="Ex : AIR.PA"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Type d'alerte *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['hausse', 'baisse'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type_alerte: t }))}
                  style={{
                    flex: 1,
                    padding: '7px 12px',
                    borderRadius: 8,
                    border: `1.5px solid ${form.type_alerte === t ? TYPE_COLORS[t] : 'var(--border)'}`,
                    background: form.type_alerte === t ? (t === 'hausse' ? 'rgba(74,222,128,.1)' : 'rgba(239,68,68,.1)') : 'var(--surface)',
                    color: form.type_alerte === t ? TYPE_COLORS[t] : 'var(--text-2)',
                    fontFamily: 'var(--sans)',
                    fontSize: '.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Seuil (€) *</label>
            <input
              required
              type="number"
              step="0.0001"
              min="0.0001"
              className="form-input"
              value={form.seuil}
              onChange={(e) => setForm((f) => ({ ...f, seuil: e.target.value }))}
              placeholder="Ex : 185.50"
            />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Enregistrement...' : "Créer l'alerte"}
        </button>
      </form>

      {/* Tableau alertes actives */}
      <div className="card fade-up-2" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: 14 }}>
          Alertes actives
          {actives.length > 0 && (
            <span style={{ marginLeft: 8, background: 'rgba(74,222,128,.15)', color: 'var(--green)', borderRadius: 20, padding: '1px 9px', fontSize: '.73rem', fontWeight: 700 }}>
              {actives.length}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-text3" style={{ textAlign: 'center', padding: '24px 0' }}>Chargement...</p>
        ) : actives.length === 0 ? (
          <p className="text-text3" style={{ textAlign: 'center', padding: '24px 0', fontSize: '.85rem' }}>
            Aucune alerte active. Créez votre première alerte ci-dessus.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ticker', 'Nom', 'Type', 'Seuil', 'Cours actuel', 'Écart', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actives.map((a) => {
                  const cours = coursCourants[a.ticker]
                  const ecart = cours != null ? cours - a.seuil : null
                  const ecartStr = ecart != null
                    ? `${ecart >= 0 ? '+' : ''}${ecart.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 })}`
                    : '—'
                  const ecartColor = ecart == null ? 'var(--text-3)' : a.type_alerte === 'hausse' ? (ecart >= 0 ? 'var(--green)' : 'var(--text-2)') : (ecart <= 0 ? 'var(--red)' : 'var(--text-2)')

                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,.05)' }}>
                      <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-1)' }}>{a.ticker}</td>
                      <td style={{ padding: '9px 10px', color: 'var(--text-2)' }}>{a.nom || '—'}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <span style={{ color: TYPE_COLORS[a.type_alerte], fontWeight: 600, fontSize: '.78rem' }}>{TYPE_LABELS[a.type_alerte] || a.type_alerte}</span>
                      </td>
                      <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', color: 'var(--text-1)' }}>{formatSeuil(a.seuil)}</td>
                      <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', color: cours != null ? 'var(--text-1)' : 'var(--text-3)' }}>
                        {cours != null ? formatCours(cours) : '—'}
                      </td>
                      <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', color: ecartColor }}>{ecartStr}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                        <button
                          onClick={() => removeAlerte(a.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '.9rem', padding: '2px 6px', borderRadius: 6, transition: 'color .15s' }}
                          onMouseEnter={(e) => (e.target.style.color = 'var(--red)')}
                          onMouseLeave={(e) => (e.target.style.color = 'var(--text-3)')}
                          title="Supprimer"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tableau historique alertes déclenchées */}
      {historique.length > 0 && (
        <div className="card fade-up-2">
          <div className="card-label" style={{ marginBottom: 14 }}>Historique — alertes déclenchées</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Ticker', 'Nom', 'Type', 'Seuil', 'Déclenchée le', ''].map((h) => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historique.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,.04)', opacity: 0.7 }}>
                    <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-2)' }}>{a.ticker}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-3)' }}>{a.nom || '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ color: TYPE_COLORS[a.type_alerte], fontWeight: 600, fontSize: '.78rem', opacity: 0.75 }}>{TYPE_LABELS[a.type_alerte] || a.type_alerte}</span>
                    </td>
                    <td style={{ padding: '9px 10px', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>{formatSeuil(a.seuil)}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: '.78rem' }}>{formatDate(a.declenchee_le)}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                      <button
                        onClick={() => removeAlerte(a.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '.9rem', padding: '2px 6px', borderRadius: 6, transition: 'color .15s' }}
                        onMouseEnter={(e) => (e.target.style.color = 'var(--red)')}
                        onMouseLeave={(e) => (e.target.style.color = 'var(--text-3)')}
                        title="Supprimer"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
