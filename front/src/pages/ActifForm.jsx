import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'
import DateInput from '../components/DateInput'

const OR_PRESETS = {
  etc: [
    { label: 'iShares Physical Gold ETC (SGLN)', nom: 'iShares Physical Gold ETC', ticker: 'SGLN.L', type: 'or' },
    { label: 'Invesco Physical Gold ETC (SGLD)', nom: 'Invesco Physical Gold ETC', ticker: 'SGLD.L', type: 'or' },
    { label: 'WisdomTree Physical Gold (PHAU)', nom: 'WisdomTree Physical Gold', ticker: 'PHAU.L', type: 'or' }
  ],
  physique: [
    { label: 'Or physique - Lingot 1kg', nom: 'Or physique - Lingot 1kg', ticker: '', type: 'or' },
    { label: 'Or physique - Napoléon 20F', nom: 'Or physique - Napoléon 20F', ticker: '', type: 'or' },
    { label: 'Or physique - Pièce 1 once', nom: 'Or physique - Pièce 1 once', ticker: '', type: 'or' }
  ],
  miniere: [
    { label: 'Barrick Gold', nom: 'Barrick Gold', ticker: 'GOLD', type: 'action' },
    { label: 'Newmont Corp', nom: 'Newmont Corp', ticker: 'NEM', type: 'action' },
    { label: 'Agnico Eagle Mines', nom: 'Agnico Eagle Mines', ticker: 'AEM', type: 'action' }
  ],
  etf_or: [
    { label: 'VanEck Gold Miners ETF', nom: 'VanEck Gold Miners ETF', ticker: 'GDX', type: 'etf' },
    { label: 'VanEck Junior Gold Miners ETF', nom: 'VanEck Junior Gold Miners ETF', ticker: 'GDXJ', type: 'etf' },
    { label: 'iShares Gold Producers UCITS ETF', nom: 'iShares Gold Producers UCITS ETF', ticker: 'SPGP.L', type: 'etf' }
  ]
}

const ENVELOPPE_OPTIONS = [
  { value: 'PEA', label: 'PEA' },
  { value: 'CTO', label: 'CTO' },
  { value: 'OR', label: 'Or' },
]

const TYPE_OPTIONS = [
  { value: 'action', label: 'Action' },
  { value: 'etf', label: 'ETF' },
  { value: 'or', label: 'Or / matière première' },
]

const SUPPORT_OR_OPTIONS = [
  { value: 'etc', label: 'ETC (or papier adossé)' },
  { value: 'physique', label: 'Or physique (pièces, lingots)' },
  { value: 'miniere', label: 'Actions minières aurifères' },
  { value: 'etf_or', label: 'ETF thématique or' },
]

const CATEGORIE_OPTIONS = [
  { value: 'coeur', label: 'Cœur - passif / ETF monde' },
  { value: 'satellite', label: 'Satellite - actif / thématique' },
]

function asEnv(v) {
  const env = String(v || 'PEA').toUpperCase()
  return ['PEA', 'CTO', 'OR'].includes(env) ? env : 'PEA'
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

export default function ActifForm() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const opIdFromQuery = Number(searchParams.get('op') || 0)

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [mergeHint, setMergeHint] = useState('')
  const [orMethod, setOrMethod] = useState('etc')
  const [orPreset, setOrPreset] = useState('')
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const [operations, setOperations] = useState([])
  const [loadingOps, setLoadingOps] = useState(false)
  const [editingOpId, setEditingOpId] = useState(null)
  const [opDraft, setOpDraft] = useState({ date_operation: '', quantite: '', prix_unitaire: '', frais: '' })
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', op: null })

  useEffect(() => {
    if (!confirmDialog.open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [confirmDialog.open])

  const [form, setForm] = useState({
    enveloppe: asEnv(searchParams.get('env') || 'PEA'),
    nom: '',
    ticker: '',
    quantite: '',
    pru: '',
    type: 'action',
    categorie: 'coeur',
    date_achat: '',
    notes: ''
  })

  async function loadActif() {
    const data = await api.get('/actifs/all')
    const all = Array.isArray(data?.actifs) ? data.actifs : []
    const found = all.find((a) => String(a.id) === String(id))
    if (!found) throw new Error('Actif introuvable')
    setForm({
      enveloppe: asEnv(found.enveloppe),
      nom: found.nom || '',
      ticker: found.ticker || '',
      quantite: found.quantite ?? '',
      pru: found.pru ?? '',
      type: found.type || 'action',
      categorie: found.categorie || 'coeur',
      date_achat: found.date_achat || '',
      notes: found.notes || ''
    })
  }

  async function loadOperations() {
    if (!isEdit) return
    setLoadingOps(true)
    try {
      const data = await api.get(`/actifs/${id}/operations`)
      const ops = Array.isArray(data?.operations) ? data.operations : []
      setOperations(ops)
    } finally {
      setLoadingOps(false)
    }
  }

  useEffect(() => {
    if (!isEdit) return
    ;(async () => {
      try {
        setLoading(true)
        await loadActif()
        await loadOperations()
      } catch (e) {
        setError(e?.message || 'Chargement impossible')
      } finally {
        setLoading(false)
      }
    })()
  }, [isEdit, id])

  useEffect(() => {
    if (!isEdit || !opIdFromQuery || !operations.length) return
    const target = operations.find((op) => Number(op.id) === opIdFromQuery)
    if (!target) return
    if (editingOpId === target.id) return
    startEditOperation(target)
    setTimeout(() => {
      const el = document.getElementById(`op-row-${target.id}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }, [isEdit, opIdFromQuery, operations, editingOpId])

  useEffect(() => {
    if (form.enveloppe !== 'OR') return
    if (form.type === 'action') setOrMethod('miniere')
    else if (form.type === 'etf') setOrMethod('etf_or')
  }, [form.enveloppe, form.type])

  const invested = useMemo(() => Number(form.quantite || 0) * Number(form.pru || 0), [form.quantite, form.pru])

  async function searchTicker(query) {
    if (form.enveloppe === 'OR' && orMethod === 'physique') {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const q = query.trim()
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
    if (isEdit) return
    const t = String(symbol || '').trim().toUpperCase()
    if (!t) {
      setMergeHint('')
      return
    }
    try {
      const data = await api.get(`/position_existante?ticker=${encodeURIComponent(t)}&env=${encodeURIComponent(form.enveloppe)}`)
      if (data?.existant) {
        setMergeHint(`Position existante détectée — ${data.quantite} titre(s) à PRU ${data.pru} EUR. Cet achat sera fusionné automatiquement.`)
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
    const inferredCategorie = form.enveloppe === 'PEA'
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
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const idx = focusedIdx >= 0 ? focusedIdx : 0
      if (suggestions[idx]) pickSuggestion(suggestions[idx])
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setFocusedIdx(-1)
    }
  }

  function applyOrPreset(value) {
    setOrPreset(value)
    const idx = Number(value)
    if (Number.isNaN(idx)) return
    const list = OR_PRESETS[orMethod] || []
    const item = list[idx]
    if (!item) return
    setForm((f) => ({ ...f, nom: item.nom, ticker: item.ticker, type: item.type }))
    checkMerge(item.ticker)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        nom: form.nom.trim(),
        ticker: form.ticker.trim().toUpperCase(),
        quantite: Number(form.quantite || 0),
        pru: Number(form.pru || 0),
        type: form.enveloppe === 'OR' ? (orMethod === 'miniere' ? 'action' : orMethod === 'etf_or' ? 'etf' : 'or') : form.type,
        categorie: form.enveloppe === 'PEA' ? form.categorie : 'coeur',
        date_achat: form.date_achat,
        notes: form.notes.trim()
      }

      if (isEdit) {
        await api.put(`/actifs/${id}`, payload)
      } else {
        await api.post('/actifs', { enveloppe: form.enveloppe, ...payload })
      }

      navigate(`/portefeuille/${form.enveloppe}`)
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  function startEditOperation(op) {
    setEditingOpId(op.id)
    setOpDraft({
      date_operation: op.date_operation || '',
      quantite: String(op.quantite ?? ''),
      prix_unitaire: String(op.prix_unitaire ?? ''),
      frais: String(op.frais ?? '0'),
    })
  }

  function cancelEditOperation() {
    setEditingOpId(null)
    setOpDraft({ date_operation: '', quantite: '', prix_unitaire: '', frais: '' })
  }

  async function saveOperation(opId) {
    setSaving(true)
    setError('')
    try {
      await api.put(`/mouvements/${opId}`, {
        date_operation: opDraft.date_operation,
        quantite: Number(opDraft.quantite || 0),
        prix_unitaire: Number(opDraft.prix_unitaire || 0),
        frais: Number(opDraft.frais || 0),
      })
      await loadActif()
      await loadOperations()
      cancelEditOperation()
    } catch (e) {
      setError(e?.message || 'Modification du renforcement impossible')
    } finally {
      setSaving(false)
    }
  }

  async function deleteOperation(op) {
    setSaving(true)
    setError('')
    try {
      await api.del(`/mouvements/${op.id}`)
      await loadActif()
      await loadOperations()
      if (editingOpId === op.id) cancelEditOperation()
    } catch (e) {
      setError(e?.message || 'Suppression du renforcement impossible')
    } finally {
      setSaving(false)
    }
  }

  async function deletePosition() {
    setSaving(true)
    setError('')
    try {
      await api.del(`/actifs/${id}`)
      navigate(`/portefeuille/${form.enveloppe}`)
    } catch (e) {
      setError(e?.message || 'Suppression impossible')
    } finally {
      setSaving(false)
    }
  }

  function openDeleteOperationDialog(op) {
    setConfirmDialog({ open: true, type: 'operation', op })
  }

  function openDeletePositionDialog() {
    setConfirmDialog({ open: true, type: 'position', op: null })
  }

  function closeConfirmDialog() {
    if (saving) return
    setConfirmDialog({ open: false, type: '', op: null })
  }

  async function runConfirmedAction() {
    if (confirmDialog.type === 'operation' && confirmDialog.op) {
      await deleteOperation(confirmDialog.op)
    } else if (confirmDialog.type === 'position') {
      await deletePosition()
    }
    setConfirmDialog({ open: false, type: '', op: null })
  }

  if (loading) {
    return <p className="text-text2">Chargement...</p>
  }

  return (
    <section className="fade-up">
      <div className="panel-shell" style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="hero-copy" style={{ marginBottom: 20 }}>
          <div className="hero-kicker">{form.enveloppe}</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>
            {isEdit ? 'Modifier la ligne' : 'Nouvelle ligne'}
          </h1>
          <p className="hero-subtitle">Saisie rapide, propre et orientée portefeuille. Tous les champs utiles sont regroupés sur un seul écran.</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div className="card">
          <div className="card-label">{isEdit ? 'Modifier' : 'Nouvelle position'}</div>

          <form onSubmit={onSubmit}>
            <div className="form-row">
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Nom *</label>
                <input
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
                  placeholder={form.enveloppe === 'OR' ? 'ex : iShares Physical Gold ETC' : 'ex : Amundi MSCI World'}
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
                        style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', textAlign: 'left', border: 0, borderBottom: i < suggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 0, color: 'var(--text)', background: focusedIdx === i ? 'rgba(255,255,255,0.06)' : 'transparent', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: '.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{item.symbol}{item.exchange ? ` · ${item.exchange}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Ticker Yahoo Finance</label>
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
                <label className="form-label">Enveloppe *</label>
                <CustomSelect
                  disabled={isEdit}
                  value={form.enveloppe}
                  onChange={(next) => setForm((f) => ({ ...f, enveloppe: asEnv(next) }))}
                  options={ENVELOPPE_OPTIONS}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Type</label>
                <CustomSelect
                  value={form.type}
                  disabled={form.enveloppe === 'OR'}
                  onChange={(next) => setForm((f) => ({ ...f, type: next }))}
                  options={TYPE_OPTIONS}
                />
              </div>
            </div>

            {form.enveloppe === 'OR' && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Support Or</label>
                  <CustomSelect
                    value={orMethod}
                    onChange={(next) => setOrMethod(next)}
                    options={SUPPORT_OR_OPTIONS}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Instrument préconfiguré</label>
                  <CustomSelect
                    value={orPreset}
                    onChange={(next) => applyOrPreset(next)}
                    options={[
                      { value: '', label: 'Sélectionner...' },
                      ...(OR_PRESETS[orMethod] || []).map((p, idx) => ({ value: String(idx), label: p.label })),
                    ]}
                  />
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quantité *</label>
                <input 
                  required 
                  type="number" 
                  step="any" 
                  min="0" 
                  className="form-input" 
                  value={form.quantite} 
                  onChange={(e) => setForm((f) => ({ ...f, quantite: e.target.value }))} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Prix de revient d'une part complète (EUR) *</label>
                <input 
                  required 
                  type="number" 
                  step="0.0001" 
                  min="0" 
                  className="form-input" 
                  value={form.pru}
                  onChange={(e) => setForm((f) => ({ ...f, pru: e.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              {form.enveloppe === 'PEA' ? (
                <div className="form-group">
                  <label className="form-label">Catégorie (PEA)</label>
                  <CustomSelect
                    value={form.categorie}
                    onChange={(next) => setForm((f) => ({ ...f, categorie: next }))}
                    options={CATEGORIE_OPTIONS}
                  />
                </div>
              ) : (
                <div className="form-group" />
              )}
              <div className="form-group">
                <label className="form-label">Date d'achat</label>
                <DateInput value={form.date_achat} onChange={(v) => setForm((f) => ({ ...f, date_achat: v }))} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>

            {invested > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--line)', borderRadius: 18, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text-3)', letterSpacing: '.15em', textTransform: 'uppercase', marginBottom: 6 }}>Montant investi</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.05em', color: 'var(--green)' }}>{invested.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} EUR</div>
              </div>
            )}

            {!!mergeHint && (
              <div style={{ padding: '10px 14px', marginBottom: 14, background: 'rgba(24,195,126,0.08)', border: '1px solid rgba(24,195,126,0.25)', borderRadius: 12, fontSize: '.8rem', color: 'var(--green)' }}>
                {mergeHint}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Enregistrement...' : isEdit ? 'Enregistrer' : 'Ajouter la position'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate(`/portefeuille/${form.enveloppe}`)}>
                Annuler
              </button>
              {isEdit && (
                <button type="button" className="btn btn-danger" onClick={openDeletePositionDialog} disabled={saving}>
                  Supprimer la position
                </button>
              )}
            </div>
          </form>
        </div>

        {isEdit && (
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-label" style={{ marginBottom: 10 }}>Renforcements enregistrés</div>

            {loadingOps && <p className="text-text2">Chargement des renforcements...</p>}

            {!loadingOps && !operations.some((op) => op.type_operation === 'achat') && (
              <p className="text-text2">Aucun renforcement individuel enregistré pour cette position.</p>
            )}

            {!loadingOps && operations.some((op) => op.type_operation === 'achat') && (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Quantité</th>
                      <th>Prix unitaire</th>
                      <th>Frais</th>
                      <th>Montant</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {operations.filter((op) => op.type_operation === 'achat').map((op) => {
                      const isEditing = editingOpId === op.id
                      return (
                        <tr key={op.id} id={`op-row-${op.id}`}>
                          <td>
                            {isEditing ? (
                              <DateInput value={opDraft.date_operation} onChange={(v) => setOpDraft((d) => ({ ...d, date_operation: v }))} />
                            ) : (
                              <span className="td-mono dim" style={{ fontSize: '.72rem' }}>{op.date_operation || '-'}</span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="any" min="0" className="form-input" value={opDraft.quantite} onChange={(e) => setOpDraft((d) => ({ ...d, quantite: e.target.value }))} />
                            ) : (
                              <span className="td-mono">{Number(op.quantite || 0).toFixed(4)}</span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="0.0001" min="0" className="form-input" value={opDraft.prix_unitaire} onChange={(e) => setOpDraft((d) => ({ ...d, prix_unitaire: e.target.value }))} />
                            ) : (
                              <span className="td-mono">{Number(op.prix_unitaire || 0).toFixed(4)} EUR</span>
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input type="number" step="0.01" min="0" className="form-input" value={opDraft.frais} onChange={(e) => setOpDraft((d) => ({ ...d, frais: e.target.value }))} />
                            ) : (
                              <span className="td-mono">{Number(op.frais || 0).toFixed(2)} EUR</span>
                            )}
                          </td>
                          <td className="td-mono strong">{Number(op.montant_net || 0).toFixed(2)} EUR</td>
                          <td>
                            <div className="actions-cell">
                              {!isEditing && (
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditOperation(op)}>Éditer</button>
                              )}
                              {isEditing && (
                                <>
                                  <button type="button" className="btn btn-primary btn-sm" onClick={() => saveOperation(op.id)} disabled={saving}>Sauver</button>
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEditOperation}>Annuler</button>
                                </>
                              )}
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => openDeleteOperationDialog(op)} disabled={saving}>Supprimer</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {confirmDialog.open && createPortal(
          <div className="confirm-overlay" onClick={closeConfirmDialog}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
              <div className="confirm-title">
                {confirmDialog.type === 'position' ? 'Supprimer la position ?' : 'Supprimer ce renforcement ?'}
              </div>
              <div className="confirm-text">
                {confirmDialog.type === 'position'
                  ? 'Cette action est définitive et supprimera la position.'
                  : 'Cette action est définitive et recalculera la position en conséquence.'}
              </div>
              <div className="confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={closeConfirmDialog} disabled={saving}>Annuler</button>
                <button type="button" className="btn btn-danger" onClick={runConfirmedAction} disabled={saving}>
                  {saving ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      </div>
    </section>
  )
}
