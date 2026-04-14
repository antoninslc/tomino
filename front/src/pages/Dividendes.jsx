import { useEffect, useMemo, useRef, useState } from 'react'
import DateInput from '../components/DateInput'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'
import Pagination from '../components/Pagination'

const ENVELOPPE_OPTIONS = [
  { value: '', label: 'Sélectionner...' },
  { value: 'PEA', label: 'PEA' },
  { value: 'CTO', label: 'CTO' },
  { value: 'OR', label: 'Or' },
  { value: 'LIVRET', label: 'Livrets' },
]

function eur(n) {
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n || 0))
  return <span className="blur-val">{fmt}</span>
}

function shortMonth(key) {
  if (!key) return '-'
  const [year, month] = key.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleDateString('fr-FR', { month: 'short' })
}

const EMPTY_FORM = {
  ticker: '',
  nom: '',
  montant_brut: '',
  retenue_source: '',
  montant_net: '',
  pays_source: '',
  devise_source: 'EUR',
  date_versement: '',
  enveloppe: '',
  notes: '',
}

const DEVISE_OPTIONS = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CHF', label: 'CHF' },
  { value: 'CAD', label: 'CAD' },
  { value: 'JPY', label: 'JPY' },
]

function DividendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'rgba(16,18,24,.96)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: '.75rem' }}>
      <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--green)', fontWeight: 700 }}>{Number(payload[0].value || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })}</div>
    </div>
  )
}

export default function Dividendes() {
  const [payload, setPayload] = useState({ dividendes: [], stats: { total_annee: 0, total_all: 0, nb: 0, par_mois: {} } })
  const [calendrier, setCalendrier] = useState([])
  const [calendrierLoading, setCalendrierLoading] = useState(true)
  const [form, setForm] = useState(EMPTY_FORM)
  const [inlineEditingId, setInlineEditingId] = useState(null)
  const [inlineForm, setInlineForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [showManualForm, setShowManualForm] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const nomRef = useRef(null)

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
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = focusedIdx >= 0 ? focusedIdx : 0
      if (suggestions[idx]) pickSuggestion(suggestions[idx])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setFocusedIdx(-1)
    }
  }

  async function load() {
    try {
      setLoading(true)
      setError('')
      const data = await api.get('/dividendes')
      setPayload({
        dividendes: Array.isArray(data?.dividendes) ? data.dividendes : [],
        stats: data?.stats || { total_annee: 0, total_all: 0, nb: 0, par_mois: {} },
      })
    } catch (e) {
      setError(e?.message || 'Erreur de chargement des dividendes')
    } finally {
      setLoading(false)
    }
  }

  async function loadCalendrier() {
    try {
      setCalendrierLoading(true)
      const data = await api.get('/dividendes/calendrier')
      setCalendrier(Array.isArray(data?.events) ? data.events : [])
    } catch {
      setCalendrier([])
    } finally {
      setCalendrierLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadCalendrier()
  }, [])

  const chartData = useMemo(() => {
    const source = payload?.stats?.par_mois || {}
    return Object.entries(source).map(([month, total]) => ({
      mois: shortMonth(month),
      cle: month,
      montant: Number(total || 0),
    }))
  }, [payload])

  function buildPayloadFromForm(currentForm) {
    const montantBrut = Number(currentForm.montant_brut || 0)
    const retenue = Number(currentForm.retenue_source || 0)
    const montantNet = currentForm.montant_net === '' ? Math.max(montantBrut - retenue, 0) : Number(currentForm.montant_net)

    if (montantBrut <= 0) {
      throw new Error('Le montant brut doit être strictement positif.')
    }
    if (retenue < 0) {
      throw new Error('La retenue à la source ne peut pas être négative.')
    }
    if (montantNet < 0) {
      throw new Error('Le montant net ne peut pas être négatif.')
    }
    if (montantNet > montantBrut) {
      throw new Error('Le montant net ne peut pas dépasser le montant brut.')
    }

    return {
      ticker: currentForm.ticker.trim().toUpperCase(),
      nom: currentForm.nom.trim(),
      montant: montantBrut,
      montant_brut: montantBrut,
      retenue_source: retenue,
      montant_net: montantNet,
      pays_source: currentForm.pays_source.trim(),
      devise_source: (currentForm.devise_source || 'EUR').trim().toUpperCase(),
      date_versement: currentForm.date_versement,
      enveloppe: currentForm.enveloppe,
      notes: currentForm.notes.trim(),
    }
  }

  function resetFormState() {
    setForm(EMPTY_FORM)
    setShowSuggestions(false)
    setSuggestions([])
    setFocusedIdx(-1)
  }

  function buildInlineEditable(item) {
    return {
      ticker: String(item?.ticker || ''),
      nom: String(item?.nom || ''),
      montant_brut: String(item?.montant_brut ?? item?.montant ?? ''),
      retenue_source: String(item?.retenue_source ?? 0),
      montant_net: String(item?.montant_net ?? item?.montant ?? ''),
      pays_source: String(item?.pays_source || ''),
      devise_source: String(item?.devise_source || 'EUR').toUpperCase(),
      date_versement: String(item?.date_versement || ''),
      enveloppe: String(item?.enveloppe || ''),
      notes: String(item?.notes || ''),
    }
  }

  function startInlineEdit(item) {
    setError('')
    setInlineEditingId(item?.id ?? null)
    setInlineForm(buildInlineEditable(item))
    setShowManualForm(false)
  }

  function cancelInlineEdit() {
    setInlineEditingId(null)
    setInlineForm(null)
  }

  async function saveInlineEdit(id) {
    if (!inlineForm) return
    setSaving(true)
    setError('')
    try {
      const body = buildPayloadFromForm(inlineForm)
      await api.put(`/dividendes/${id}`, body)
      cancelInlineEdit()
      await load()
    } catch (e) {
      setError(e?.message || 'Impossible de modifier le dividende')
    } finally {
      setSaving(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = buildPayloadFromForm(form)
      await api.post('/dividendes', body)

      resetFormState()
      setShowManualForm(false)
      await load()
    } catch (e2) {
      setError(e2?.message || "Impossible d'ajouter le dividende")
    } finally {
      setSaving(false)
    }
  }

  async function removeDividende(id) {
    if (!window.confirm('Supprimer ce versement ?')) return
    setError('')
    try {
      await api.del(`/dividendes/${id}`)
      if (inlineEditingId === id) {
        cancelInlineEdit()
      }
      await load()
    } catch (e) {
      setError(e?.message || 'Suppression impossible')
    }
  }

  async function syncDividendes() {
    setSyncing(true)
    setError('')
    setSyncMsg('')
    try {
      const result = await api.post('/dividendes/sync', {})
      const nouveaux = Number(result?.nouveaux || 0)
      setSyncMsg(`${nouveaux} nouveau(x) dividende(s) importé(s).`)
      await load()
    } catch (e) {
      setError(e?.message || 'Synchronisation impossible')
    } finally {
      setSyncing(false)
    }
  }

  const dividendes = payload?.dividendes || []
  const stats = payload?.stats || {}

  const PAGE_SIZE = 20
  const dividendesPage = dividendes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <section>
      {error && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Cash flow</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Suivi des dividendes reçus.</h1>
          <p className="hero-subtitle">Centralisez les versements perçus, suivez leur progression annuelle et visualisez la saisonnalité sur douze mois.</p>
        </div>
        <div className="card" style={{ minWidth: 280, maxWidth: 340 }}>
          <div className="card-label">Dividendes cette année</div>
          <div className="stat-value green">{eur(stats.total_annee)}</div>
          <div className="stat-sub">{stats.nb || 0} versement(s) enregistrés</div>
        </div>
      </section>

      <div className="g3 fade-up" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Total cette année</div>
          <div className="stat-value green">{eur(stats.total_annee)}</div>
          <div className="stat-sub">Année civile en cours</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total historique</div>
          <div className="stat-value dim">{eur(stats.total_all)}</div>
          <div className="stat-sub">Tous les dividendes saisis</div>
        </div>
        <div className="stat">
          <div className="stat-label">Nombre de versements</div>
          <div className="stat-value dim">{Number(stats.nb || 0)}</div>
          <div className="stat-sub">Historique complet</div>
        </div>
      </div>

      <div className="card fade-up-2" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div className="card-label">Import automatique</div>
          <button type="button" className="btn btn-ghost" onClick={syncDividendes} disabled={syncing}>
            {syncing ? 'Synchronisation...' : 'Synchroniser'}
          </button>
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: '.78rem' }}>
          Les dividendes se mettent à jour automatiquement chaque jour à 18h00.
        </div>
        {syncMsg && (
          <div style={{ marginTop: 8, color: 'var(--green)', fontSize: '.8rem' }}>{syncMsg}</div>
        )}
      </div>

      <div className="card fade-up-2" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: 8 }}>Dividendes par mois</div>
        <div style={{ color: 'var(--text-2)', fontSize: '.9rem', marginBottom: 16 }}>Douze derniers mois glissants.</div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="mois" tick={{ fill: '#718095', fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
              <YAxis tickFormatter={(v) => `${Number(v).toLocaleString('fr-FR')} €`} tick={{ fill: '#718095', fontSize: 11, fontFamily: 'var(--mono)' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} width={88} />
              <Tooltip content={<DividendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="montant" fill="rgba(24,195,126,0.82)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card fade-up-3" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="card-label">Prochains versements</div>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--text-3)' }}>6 mois glissants</span>
        </div>
        {calendrierLoading ? (
          <div style={{ color: 'var(--text-3)', fontSize: '.84rem' }}>Chargement…</div>
        ) : calendrier.length === 0 ? (
          <div className="empty" style={{ padding: '20px 0' }}>
            <div className="empty-icon">📅</div>
            <p>Aucun dividende prévu détecté sur les 6 prochains mois.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date ex-div</th>
                  <th>Paiement</th>
                  <th>Ticker</th>
                  <th>Nom</th>
                  <th>Enveloppe</th>
                  <th>Div/action</th>
                  <th>Qté détenue</th>
                  <th>Montant estimé</th>
                </tr>
              </thead>
              <tbody>
                {calendrier.map((ev, i) => (
                  <tr key={`${ev.ticker}-${ev.ex_date}-${i}`}>
                    <td className="td-mono dim">{ev.ex_date || '—'}</td>
                    <td className="td-mono dim">{ev.payment_date || '—'}</td>
                    <td className="td-mono">{ev.ticker}</td>
                    <td><div className="td-name">{ev.nom || ev.ticker}</div></td>
                    <td>{(ev.enveloppes || []).join(', ') || '—'}</td>
                    <td className="td-mono">{ev.dividende_action != null ? `${Number(ev.dividende_action).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €` : '—'}</td>
                    <td className="td-mono">{ev.quantite != null ? Number(ev.quantite).toLocaleString('fr-FR', { maximumFractionDigits: 4 }) : '—'}</td>
                    <td className="td-mono strong green">{ev.montant_estime != null ? eur(ev.montant_estime) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card fade-up-3">
        <div className="card-label" style={{ marginBottom: 14 }}>Historique des versements</div>
        {!!dividendes.length && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticker</th>
                  <th>Nom</th>
                  <th>Enveloppe</th>
                  <th>Brut</th>
                  <th>Retenue</th>
                  <th>Net</th>
                  <th>Pays source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dividendesPage.map((item) => (
                  inlineEditingId === item.id && inlineForm ? (
                    <tr key={item.id}>
                      <td><DateInput value={inlineForm.date_versement} onChange={(v) => setInlineForm((f) => ({ ...f, date_versement: v }))} /></td>
                      <td><input className="form-input td-mono" value={inlineForm.ticker} onChange={(e) => setInlineForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))} /></td>
                      <td>
                        <input className="form-input" value={inlineForm.nom} onChange={(e) => setInlineForm((f) => ({ ...f, nom: e.target.value }))} />
                        <input className="form-input" style={{ marginTop: 6 }} placeholder="Notes" value={inlineForm.notes} onChange={(e) => setInlineForm((f) => ({ ...f, notes: e.target.value }))} />
                      </td>
                      <td>
                        <CustomSelect
                          value={inlineForm.enveloppe}
                          onChange={(next) => setInlineForm((f) => ({ ...f, enveloppe: next }))}
                          options={ENVELOPPE_OPTIONS}
                        />
                      </td>
                      <td><input type="number" step="0.01" min="0.01" className="form-input td-mono" value={inlineForm.montant_brut} onChange={(e) => setInlineForm((f) => ({ ...f, montant_brut: e.target.value }))} /></td>
                      <td><input type="number" step="0.01" min="0" className="form-input td-mono" value={inlineForm.retenue_source} onChange={(e) => setInlineForm((f) => ({ ...f, retenue_source: e.target.value }))} /></td>
                      <td><input type="number" step="0.01" min="0" className="form-input td-mono" value={inlineForm.montant_net} onChange={(e) => setInlineForm((f) => ({ ...f, montant_net: e.target.value }))} /></td>
                      <td><input className="form-input" value={inlineForm.pays_source} onChange={(e) => setInlineForm((f) => ({ ...f, pays_source: e.target.value }))} /></td>
                      <td>
                        <div className="actions-cell">
                          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => saveInlineEdit(item.id)}>
                            {saving ? '...' : 'OK'}
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={saving} onClick={cancelInlineEdit}>Annuler</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={item.id}>
                      <td className="td-mono dim">{item.date_versement}</td>
                      <td className="td-mono">{item.ticker || '-'}</td>
                      <td>
                        <div className="td-name">{item.nom}</div>
                        {!!item.notes && <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{item.notes}</div>}
                      </td>
                      <td>{item.enveloppe || '-'}</td>
                      <td className="td-mono strong">{eur(item.montant_brut ?? item.montant)}</td>
                      <td className="td-mono">{eur(item.retenue_source || 0)}</td>
                      <td className="td-mono strong green">{eur(item.montant_net ?? item.montant)}</td>
                      <td>{item.pays_source || '-'}</td>
                      <td>
                        <div className="actions-cell">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => startInlineEdit(item)}>Modifier</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeDividende(item.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
            <Pagination page={page} total={dividendes.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}

        {!dividendes.length && !loading && (
          <div className="empty">
            <div className="empty-icon">▤</div>
            <p>Aucun dividende enregistré pour le moment.</p>
          </div>
        )}
      </div>

      <div className="fade-up-3" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (showManualForm) resetFormState()
            setShowManualForm((v) => !v)
          }}
          style={{ width: '100%' }}
        >
          {showManualForm ? 'Masquer l\'ajout manuel' : 'Ajouter manuellement un dividende'}
        </button>
      </div>

      {showManualForm && (
        <form onSubmit={onSubmit} className="card fade-up-3" style={{ marginTop: 12 }}>
          <div className="card-label" style={{ marginBottom: 14 }}>Ajout manuel</div>

          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Nom *</label>
              <input
                ref={nomRef}
                required
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
              <label className="form-label">Ticker</label>
              <input
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
              <label className="form-label">Montant brut *</label>
              <input required type="number" step="0.01" min="0.01" className="form-input" value={form.montant_brut} onChange={(e) => setForm((f) => ({ ...f, montant_brut: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Retenue à la source</label>
              <input type="number" step="0.01" min="0" className="form-input" value={form.retenue_source} onChange={(e) => setForm((f) => ({ ...f, retenue_source: e.target.value }))} placeholder="0.00" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Montant net</label>
              <input type="number" step="0.01" min="0" className="form-input" value={form.montant_net} onChange={(e) => setForm((f) => ({ ...f, montant_net: e.target.value }))} placeholder="Auto = brut - retenue" />
            </div>
            <div className="form-group">
              <label className="form-label">Date de versement *</label>
              <DateInput required value={form.date_versement} onChange={(v) => setForm((f) => ({ ...f, date_versement: v }))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Pays source</label>
              <input className="form-input" value={form.pays_source} onChange={(e) => setForm((f) => ({ ...f, pays_source: e.target.value }))} placeholder="Ex : États-Unis" />
            </div>
            <div className="form-group">
              <label className="form-label">Devise source</label>
              <CustomSelect
                value={form.devise_source}
                onChange={(next) => setForm((f) => ({ ...f, devise_source: next }))}
                options={DEVISE_OPTIONS}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Enveloppe</label>
              <CustomSelect
                value={form.enveloppe}
                onChange={(next) => setForm((f) => ({ ...f, enveloppe: next }))}
                options={ENVELOPPE_OPTIONS}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <input className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optionnel" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Enregistrement...' : 'Valider l\'ajout manuel'}
          </button>
        </form>
      )}
    </section>
  )
}