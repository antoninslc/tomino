import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'

function eur(n) {
  const fmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(Number(n || 0))
  return <span className="blur-val">{fmt}</span>
}

const SUPPORT_OPTIONS = [
  { value: 'fonds_euros', label: 'Fonds euros' },
  { value: 'uc', label: 'Unités de compte (UC)' },
  { value: 'mixte', label: 'Mixte' },
]

const emptyForm = {
  nom: '',
  assureur: '',
  type_support: 'mixte',
  versements: '',
  valeur_actuelle: '',
  date_maj: '',
  notes: '',
}

export default function AssuranceVie() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(emptyForm)

  const formOpen = searchParams.get('new') === '1'
  const editId = searchParams.get('edit')
  const isEdit = Boolean(editId)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get('/assurance-vie')
      setPayload(data)
    } catch (e) {
      setError(e?.message || "Erreur de chargement de l'assurance vie")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function openForm() {
    const next = new URLSearchParams(searchParams)
    next.set('new', '1')
    next.delete('edit')
    setSearchParams(next, { replace: true })
    setForm(emptyForm)
  }

  function openEdit(contrat) {
    const next = new URLSearchParams(searchParams)
    next.set('new', '1')
    next.set('edit', String(contrat.id))
    setSearchParams(next, { replace: true })
    setForm({
      nom: String(contrat.nom || ''),
      assureur: String(contrat.assureur || ''),
      type_support: String(contrat.type_support || 'mixte'),
      versements: String(contrat.versements ?? ''),
      valeur_actuelle: String(contrat.valeur_actuelle ?? ''),
      date_maj: String(contrat.date_maj || ''),
      notes: String(contrat.notes || ''),
    })
  }

  function closeForm() {
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('edit')
    setSearchParams(next, { replace: true })
    setForm(emptyForm)
  }

  async function onSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        nom: form.nom.trim(),
        assureur: form.assureur.trim(),
        type_support: form.type_support,
        versements: Number(form.versements || 0),
        valeur_actuelle: Number(form.valeur_actuelle || 0),
        date_maj: form.date_maj,
        notes: form.notes.trim(),
      }

      if (isEdit && editId) {
        await api.put(`/assurance-vie/${editId}`, body)
      } else {
        await api.post('/assurance-vie', body)
      }

      closeForm()
      await load()
    } catch (e2) {
      setError(e2?.message || (isEdit ? 'Mise à jour impossible' : 'Création impossible'))
    } finally {
      setSaving(false)
    }
  }

  async function removeContrat(id) {
    if (!window.confirm('Supprimer ce contrat ?')) return
    setError('')
    try {
      await api.del(`/assurance-vie/${id}`)
      await load()
    } catch (e) {
      setError(e?.message || 'Suppression impossible')
    }
  }

  const contrats = payload?.contrats || []
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
          <div className="hero-kicker">Épargne long terme</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Contrats d’assurance vie.</h1>
          <p className="hero-subtitle">Suivez vos versements, la valeur actuelle et la performance latente de vos contrats.</p>
        </div>
        <div className="card" style={{ minWidth: 280, maxWidth: 340 }}>
          <div className="card-label">Encours total</div>
          <div className="stat-value dim">{eur(stats.total_valeur)}</div>
          <div className="stat-sub">{stats.nb || 0} contrat(s)</div>
        </div>
      </section>

      <div className="g3 fade-up" style={{ marginBottom: 20 }}>
        <div className="stat">
          <div className="stat-label">Versements cumulés</div>
          <div className="stat-value dim">{eur(stats.total_versements)}</div>
          <div className="stat-sub">Montant investi</div>
        </div>
        <div className="stat">
          <div className="stat-label">Valeur actuelle</div>
          <div className="stat-value dim">{eur(stats.total_valeur)}</div>
          <div className="stat-sub">Encours total</div>
        </div>
        <div className="stat">
          <div className="stat-label">Performance latente</div>
          <div className={`stat-value ${Number(stats.pv_latente || 0) >= 0 ? 'green' : 'red'}`}>{eur(stats.pv_latente)}</div>
          <div className="stat-sub">Depuis l’origine</div>
        </div>
      </div>

      <div className="card fade-up-2" style={{ marginBottom: 20 }}>
        <div className="card-label" style={{ marginBottom: contrats.length ? 16 : 0 }}>Contrats suivis</div>

        {!!contrats.length && (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Contrat</th>
                  <th>Assureur</th>
                  <th>Support</th>
                  <th>Versements</th>
                  <th>Valeur actuelle</th>
                  <th>Perf. latente</th>
                  <th>Mise à jour</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contrats.map((c) => {
                  const pv = Number(c.valeur_actuelle || 0) - Number(c.versements || 0)
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="td-name">{c.nom}</div>
                        {!!c.notes && <div style={{ fontSize: '.65rem', color: 'var(--text-3)', marginTop: 2 }}>{c.notes}</div>}
                      </td>
                      <td className="td-mono">{c.assureur || '-'}</td>
                      <td>
                        <span className="badge">{c.type_support === 'fonds_euros' ? 'Fonds euros' : c.type_support === 'uc' ? 'UC' : 'Mixte'}</span>
                      </td>
                      <td className="td-mono">{eur(c.versements)}</td>
                      <td className="td-mono strong">{eur(c.valeur_actuelle)}</td>
                      <td className={`td-mono ${pv >= 0 ? 'green' : 'red'}`}>{eur(pv)}</td>
                      <td className="td-mono dim">{c.date_maj || '-'}</td>
                      <td>
                        <div className="actions-cell">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>Éditer</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeContrat(c.id)}>✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!contrats.length && (
          <div className="empty">
            <div className="empty-icon">◫</div>
            <p>Aucun contrat d’assurance vie saisi pour le moment.</p>
            {!formOpen && <button type="button" className="btn btn-primary btn-sm" onClick={openForm}>Ajouter un contrat</button>}
          </div>
        )}

        {!!contrats.length && !formOpen && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={openForm}>+ Ajouter un contrat</button>
          </div>
        )}
      </div>

      {formOpen && (
        <form onSubmit={onSubmit} className="card fade-up-2" style={{ maxWidth: 760 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div className="card-label">{isEdit ? 'Éditer un contrat' : 'Ajouter un contrat'}</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Fermer</button>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nom du contrat</label>
              <input className="form-input" value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Assureur</label>
              <input className="form-input" value={form.assureur} onChange={(e) => setForm((f) => ({ ...f, assureur: e.target.value }))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type de support</label>
              <CustomSelect
                value={form.type_support}
                onChange={(next) => setForm((f) => ({ ...f, type_support: next }))}
                options={SUPPORT_OPTIONS}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date de mise à jour</label>
              <input type="date" className="form-input" value={form.date_maj} onChange={(e) => setForm((f) => ({ ...f, date_maj: e.target.value }))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Versements cumulés (€)</label>
              <input type="number" min="0" step="0.01" className="form-input" value={form.versements} onChange={(e) => setForm((f) => ({ ...f, versements: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Valeur actuelle (€)</label>
              <input type="number" min="0" step="0.01" className="form-input" value={form.valeur_actuelle} onChange={(e) => setForm((f) => ({ ...f, valeur_actuelle: e.target.value }))} required />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea rows={3} className="form-input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optionnel" />
          </div>

          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Enregistrement...' : (isEdit ? 'Mettre à jour le contrat' : 'Ajouter le contrat')}
          </button>
        </form>
      )}

      {loading && <p className="text-text2">Chargement...</p>}
    </section>
  )
}
