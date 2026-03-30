import { useEffect, useRef, useState } from 'react'
import DateInput from '../components/DateInput'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'

function eur(n) {
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n || 0))
  return <span className="blur-val">{fmt}</span>
}

function pct(n) {
  return `${Number(n || 0).toFixed(2)}%`
}

const KNOWN_LIVRETS = [
  { nom: 'Livret A', taux: 1.5, note: 'Taux réglementé indicatif, modifiable si besoin.', aliases: ['livret a', 'la'] },
  { nom: 'LDDS', taux: 2.4, note: 'Livret de développement durable et solidaire.', aliases: ['ldds', 'ldd'] },
  { nom: 'LEP', taux: 3.5, note: 'Livret d\'épargne populaire, sous conditions de revenus.', aliases: ['lep', 'livret epargne populaire'] },
  { nom: 'Livret Jeune', taux: 2.4, note: 'Le taux varie selon la banque, minimum Livret A.', aliases: ['livret jeune', 'jeune'] },
  { nom: 'CEL', taux: 1.5, note: 'Compte épargne logement.', aliases: ['cel', 'compte epargne logement'] },
  { nom: 'PEL', taux: 1.75, note: 'Plan épargne logement, taux dépendant de la date d\'ouverture.', aliases: ['pel', 'plan epargne logement'] },
  { nom: 'Compte sur livret', taux: 0.8, note: 'Taux variable selon la banque.', aliases: ['compte sur livret', 'csl'] }
]

const emptyForm = { nom: '', capital: '', taux: '', date_maj: '', notes: '' }

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function Livrets() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const nameInputRef = useRef(null)

  const formOpen = searchParams.get('new') === '1'
  const editId = searchParams.get('edit')
  const isEdit = Boolean(editId)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/livrets')
      setPayload(data)
    } catch (e) {
      setError(e?.message || 'Erreur de chargement des livrets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!formOpen) return
    const id = window.setTimeout(() => nameInputRef.current?.focus(), 120)
    return () => window.clearTimeout(id)
  }, [formOpen])

  function updateFormQuery(open) {
    const next = new URLSearchParams(searchParams)
    if (open) next.set('new', '1')
    else next.delete('new')
    setSearchParams(next, { replace: true })
  }

  function openForm() {
    setForm(emptyForm)
    updateFormQuery(true)
    const next = new URLSearchParams(searchParams)
    next.delete('edit')
    setSearchParams(next, { replace: true })
  }

  function openEditForm(livret) {
    setForm({
      nom: String(livret.nom || ''),
      capital: String(livret.capital ?? ''),
      taux: String(livret.taux ?? ''),
      date_maj: String(livret.date_maj || ''),
      notes: String(livret.notes || ''),
    })
    const next = new URLSearchParams(searchParams)
    next.set('new', '1')
    next.set('edit', String(livret.id))
    setSearchParams(next, { replace: true })
  }

  function closeForm() {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('edit')
    setSearchParams(next, { replace: true })
    setForm(emptyForm)
    setSuggestions([])
    setShowSuggestions(false)
    setFocusedIdx(-1)
  }

  function searchKnownLivrets(query) {
    const q = normalizeText(query)
    if (!q) {
      setSuggestions(KNOWN_LIVRETS.slice(0, 6))
      setShowSuggestions(true)
      setFocusedIdx(-1)
      return
    }

    const matches = KNOWN_LIVRETS.filter((item) => {
      const haystack = normalizeText([item.nom, ...(item.aliases || [])].join(' '))
      return haystack.includes(q)
    }).slice(0, 6)

    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
    setFocusedIdx(-1)
  }

  function pickSuggestion(item) {
    setForm((current) => ({
      ...current,
      nom: item.nom,
      taux: String(item.taux),
      date_maj: current.date_maj || todayIso(),
      notes: current.notes.trim() ? current.notes : item.note
    }))
    setSuggestions([])
    setShowSuggestions(false)
    setFocusedIdx(-1)
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

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        nom: form.nom.trim(),
        capital: Number(form.capital || 0),
        taux: Number(form.taux || 0),
        date_maj: form.date_maj,
        notes: form.notes.trim()
      }

      if (isEdit && editId) {
        await api.put(`/livrets/${editId}`, payload)
      } else {
        await api.post('/livrets', payload)
      }

      setForm(emptyForm)
      closeForm()
      await load()
    } catch (err) {
      setError(err?.message || (isEdit ? 'Impossible de mettre à jour le livret' : "Impossible d'ajouter le livret"))
    } finally {
      setSaving(false)
    }
  }

  async function removeLivret(id) {
    setError('')
    try {
      await api.del(`/livrets/${id}`)
      setConfirmDeleteId(null)
      await load()
    } catch (err) {
      setError(err?.message || 'Suppression impossible')
    }
  }

  const livres = payload?.livrets || []
  const stats = payload?.stats || {}

  return (
    <section>
      {error && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Cash management</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Poche de liquidités et livrets.</h1>
          <p className="hero-subtitle">Une vue simple des capitaux disponibles, du rendement estimé et des mises à jour de taux.</p>
        </div>
        <div className="card" style={{ minWidth: 280, maxWidth: 340 }}>
          <div className="card-label">Capital sécurisé</div>
          <div className="stat-value dim">{eur(payload?.total)}</div>
          <div className="stat-sub">{livres.length} livret(s)</div>
        </div>
      </section>

      <div className="g2 fade-up" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Épargne réglementée</div>
          <div className="stat-value dim">{eur(payload?.total)}</div>
          <div className="stat-sub">{livres.length} livret(s)</div>
        </div>
        {!!livres.length && (
          <div className="stat">
            <div className="stat-label">Intérêts annuels estimés</div>
            <div className="stat-value green">{eur(stats.interets_annuels)}</div>
            <div className="stat-sub">Rendement annuel estimé</div>
          </div>
        )}
      </div>

      <div className="card fade-up-2" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: livres.length ? 16 : 0 }}>Livrets suivis</div>

        {!!livres.length && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Livret</th>
                  <th>Capital</th>
                  <th>Taux annuel</th>
                  <th>Intérêts / an</th>
                  <th>Mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {livres.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="td-name">{l.nom}</div>
                      {!!l.notes && <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{l.notes}</div>}
                    </td>
                    <td className="td-mono strong">{eur(l.capital)}</td>
                    <td className="td-mono gold">{pct(l.taux)}</td>
                    <td className="td-mono green">+ {eur((Number(l.capital || 0) * Number(l.taux || 0)) / 100)}</td>
                    <td className="td-mono dim">{l.date_maj || '-'}</td>
                    <td>
                      <div className="actions-cell">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEditForm(l)}>Éditer</button>
                        {confirmDeleteId === l.id ? (
                          <>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => removeLivret(l.id)}>Confirmer</button>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteId(null)}>Annuler</button>
                          </>
                        ) : (
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmDeleteId(l.id)}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!livres.length && (
          <div className="empty">
            <div className="empty-icon">▣</div>
            <p>Aucun livret saisi pour le moment.</p>
            {!formOpen && <button type="button" className="btn btn-primary btn-sm" onClick={openForm}>Ajouter un livret</button>}
          </div>
        )}

        {!!livres.length && !formOpen && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={openForm}>+ Ajouter un livret</button>
          </div>
        )}
      </div>

      {formOpen && (
        <form id="livret-form" onSubmit={onSubmit} className="card fade-up-2" style={{ maxWidth: 720 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div className="card-label">{isEdit ? 'Éditer un livret' : 'Ajouter un livret'}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Fermer</button>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Nom</label>
              <input
                ref={nameInputRef}
                className="form-input"
                value={form.nom}
                onChange={(e) => {
                  const value = e.target.value
                  setForm((f) => ({ ...f, nom: value }))
                  searchKnownLivrets(value)
                }}
                onFocus={() => searchKnownLivrets(form.nom)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                onKeyDown={onNameKeyDown}
                placeholder="Ex : Livret A, LDDS, LEP"
                autoComplete="off"
                required
              />

              {showSuggestions && suggestions.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#1a1d22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', zIndex: 30, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {suggestions.map((item, idx) => (
                    <button
                      type="button"
                      key={item.nom}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickSuggestion(item)
                      }}
                      style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', textAlign: 'left', border: 0, color: 'var(--text)', background: focusedIdx === idx ? 'rgba(255,255,255,0.06)' : 'transparent', cursor: 'pointer' }}
                    >
                      <span style={{ display: 'grid', gap: 2 }}>
                        <span style={{ fontSize: '.875rem' }}>{item.nom}</span>
                        <span style={{ fontSize: '.7rem', color: 'var(--text-3)' }}>{item.note}</span>
                      </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--green)', whiteSpace: 'nowrap' }}>{pct(item.taux)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Taux (%)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={form.taux}
                onChange={(e) => setForm((f) => ({ ...f, taux: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Capital</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={form.capital}
                onChange={(e) => setForm((f) => ({ ...f, capital: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Date de mise à jour</label>
              <DateInput value={form.date_maj} onChange={(v) => setForm((f) => ({ ...f, date_maj: v }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              rows={3}
              className="form-input"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optionnel"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Enregistrement...' : (isEdit ? 'Mettre à jour le livret' : 'Ajouter le livret')}
          </button>
        </form>
      )}
    </section>
  )
}
