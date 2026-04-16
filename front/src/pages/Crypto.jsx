import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { apiBase as BASE } from '../api'

// ── Formatters ─────────────────────────────────────────────────────────────
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const qty = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 })

const fmtEur = (v) => (v == null ? '—' : eur.format(v))
const fmtPct = (v) => (v == null ? '—' : pct.format(v / 100))
const fmtQty = (v) => (v == null ? '—' : qty.format(v))

function PvBadge({ v }) {
  if (v == null) return <span style={{ color: 'var(--text-3)' }}>—</span>
  const c = v >= 0 ? 'var(--green)' : 'var(--red)'
  return <span style={{ color: c, fontWeight: 600 }}>{v >= 0 ? '+' : ''}{fmtEur(v)}</span>
}
function PvPctBadge({ v }) {
  if (v == null) return null
  const c = v >= 0 ? 'var(--green)' : 'var(--red)'
  return <span style={{ color: c, fontSize: '.8rem' }}>{v >= 0 ? '+' : ''}{v?.toFixed(2)}%</span>
}
function Var24h({ v }) {
  if (v == null) return <span style={{ color: 'var(--text-3)', fontSize: '.8rem' }}>—</span>
  const c = v >= 0 ? 'var(--green)' : 'var(--red)'
  return <span style={{ color: c, fontSize: '.8rem', fontWeight: 600 }}>{v >= 0 ? '+' : ''}{v?.toFixed(2)}%</span>
}

// ── StatCard ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, subColor }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: '.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: '.8rem', marginTop: 4, color: subColor || 'var(--text-2)' }}>{sub}</div>}
    </div>
  )
}

// ── Symbol badge ───────────────────────────────────────────────────────────
function SymBadge({ symbol }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(255,200,80,0.12)', color: 'rgba(255,200,80,0.9)',
      borderRadius: 6, padding: '1px 6px', fontSize: '.7rem',
      fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '.04em',
      marginLeft: 6, flexShrink: 0,
    }}>
      {symbol}
    </span>
  )
}

// ── CoinSearch ─────────────────────────────────────────────────────────────
function CoinSearch({ value, onChange, onSelect }) {
  const [q, setQ] = useState(value?.nom || '')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const debounce = useRef(null)

  function handleInput(e) {
    const v = e.target.value
    setQ(v)
    onChange(null)
    clearTimeout(debounce.current)
    if (v.length < 2) { setResults([]); return }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/crypto/search?q=${encodeURIComponent(v)}`)
        const json = await res.json()
        setResults(Array.isArray(json) ? json : [])
      } catch { setResults([]) }
      finally { setLoading(false) }
    }, 350)
  }

  function select(coin) {
    setQ(`${coin.nom} (${coin.symbol})`)
    setResults([])
    onSelect(coin)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="Rechercher un coin (Bitcoin, ETH…)"
        value={q}
        onChange={handleInput}
        autoComplete="off"
      />
      {(results.length > 0 || loading) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#1a1d22', border: '1px solid var(--line)', borderRadius: 10,
          marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {loading && <div style={{ padding: '10px 14px', color: 'var(--text-3)', fontSize: '.83rem' }}>Recherche…</div>}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => select(c)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '9px 14px', background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--line)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {c.thumb && <img src={c.thumb} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} />}
              <span style={{ fontWeight: 600, fontSize: '.88rem', color: 'var(--text)' }}>{c.nom}</span>
              <SymBadge symbol={c.symbol} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Modal Ajouter ──────────────────────────────────────────────────────────
function ModalAjouter({ onClose, onSaved }) {
  const [coin, setCoin] = useState(null)
  const [form, setForm] = useState({ quantite: '', pru: '', date_achat: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!coin) { setErr('Sélectionnez un coin.'); return }
    if (!form.quantite || !form.pru) { setErr('Quantité et PRU obligatoires.'); return }
    setSaving(true); setErr('')
    try {
      await api.post('/crypto/actifs', {
        nom: coin.nom,
        ticker: coin.id,
        symbol: coin.symbol,
        quantite: parseFloat(form.quantite),
        pru: parseFloat(form.pru),
        date_achat: form.date_achat,
        notes: form.notes,
      })
      onSaved()
    } catch (e) { setErr(e.message || 'Erreur') }
    finally { setSaving(false) }
  }

  return (
    <ModalWrap title="Ajouter une position crypto" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">Coin</label>
          <CoinSearch value={coin} onChange={() => setCoin(null)} onSelect={setCoin} />
          {coin && <div style={{ marginTop: 6, fontSize: '.8rem', color: 'var(--text-3)' }}>ID CoinGecko : <code>{coin.id}</code></div>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Quantité</label>
            <input className="input" type="number" step="any" min="0" placeholder="0.5" value={form.quantite} onChange={e => setForm(f => ({...f, quantite: e.target.value}))} required />
          </div>
          <div>
            <label className="label">PRU (€)</label>
            <input className="input" type="number" step="any" min="0" placeholder="Prix de revient unitaire" value={form.pru} onChange={e => setForm(f => ({...f, pru: e.target.value}))} required />
          </div>
        </div>
        <div>
          <label className="label">Date d'achat</label>
          <input className="input" type="date" value={form.date_achat} onChange={e => setForm(f => ({...f, date_achat: e.target.value}))} />
        </div>
        <div>
          <label className="label">Notes</label>
          <input className="input" placeholder="Optionnel" value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
        </div>
        {err && <div style={{ color: 'var(--red)', fontSize: '.83rem' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

// ── Modal Opération ────────────────────────────────────────────────────────
function ModalOperation({ actif, onClose, onSaved }) {
  const [type, setType] = useState('achat')
  const [form, setForm] = useState({ quantite: '', prix_unitaire: '', frais: '0', date_operation: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      await api.post(`/crypto/actifs/${actif.id}/operation`, {
        type_operation: type,
        quantite: parseFloat(form.quantite),
        prix_unitaire: parseFloat(form.prix_unitaire),
        frais: parseFloat(form.frais || 0),
        date_operation: form.date_operation,
      })
      onSaved()
    } catch (e) { setErr(e.message || 'Erreur') }
    finally { setSaving(false) }
  }

  const symbol = actif.categorie || ''
  const nom = actif.nom || ''

  return (
    <ModalWrap title={<>{type === 'achat' ? 'Acheter' : 'Vendre'} — {nom} <SymBadge symbol={symbol} /></>} onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['achat', 'vente'].map(t => (
          <button key={t} type="button"
            className={type === t ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ flex: 1, textTransform: 'capitalize' }}
            onClick={() => setType(t)}>{t}</button>
        ))}
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Quantité {symbol}</label>
            <input className="input" type="number" step="any" min="0" value={form.quantite} onChange={e => setForm(f => ({...f, quantite: e.target.value}))} required />
          </div>
          <div>
            <label className="label">Prix unitaire (€)</label>
            <input className="input" type="number" step="any" min="0" value={form.prix_unitaire} onChange={e => setForm(f => ({...f, prix_unitaire: e.target.value}))} required />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="label">Frais (€)</label>
            <input className="input" type="number" step="any" min="0" value={form.frais} onChange={e => setForm(f => ({...f, frais: e.target.value}))} />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={form.date_operation} onChange={e => setForm(f => ({...f, date_operation: e.target.value}))} />
          </div>
        </div>
        {type === 'vente' && actif.pru > 0 && form.quantite && form.prix_unitaire && (
          <div style={{ padding: '8px 12px', background: 'rgba(24,195,126,0.07)', border: '1px solid rgba(24,195,126,0.2)', borderRadius: 8, fontSize: '.83rem', color: 'var(--text-2)' }}>
            PV estimée : <strong style={{ color: ((parseFloat(form.prix_unitaire) - actif.pru) * parseFloat(form.quantite)) >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {fmtEur((parseFloat(form.prix_unitaire) - actif.pru) * parseFloat(form.quantite))}
            </strong>
          </div>
        )}
        {err && <div style={{ color: 'var(--red)', fontSize: '.83rem' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '…' : type === 'achat' ? 'Acheter' : 'Vendre'}</button>
        </div>
      </form>
    </ModalWrap>
  )
}

// ── Modal Supprimer ────────────────────────────────────────────────────────
function ModalDelete({ actif, onClose, onSaved }) {
  const [saving, setSaving] = useState(false)
  async function confirm() {
    setSaving(true)
    try { await api.del(`/crypto/actifs/${actif.id}`); onSaved() }
    catch { setSaving(false) }
  }
  return (
    <ModalWrap title="Supprimer la position" onClose={onClose}>
      <p style={{ color: 'var(--text-2)', marginBottom: 20 }}>
        Supprimer <strong>{actif.nom}</strong> et tous ses mouvements ? Cette action est irréversible.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button type="button" className="btn" style={{ background: 'var(--red)', color: '#fff' }} onClick={confirm} disabled={saving}>
          {saving ? '…' : 'Supprimer'}
        </button>
      </div>
    </ModalWrap>
  )
}

// ── ModalWrap ──────────────────────────────────────────────────────────────
function ModalWrap({ title, children, onClose }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: '#141720', border: '1px solid var(--line)', borderRadius: 16,
        padding: '28px 28px 24px', width: '100%', maxWidth: 500,
        boxShadow: '0 16px 64px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 20, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>{title}</div>
        {children}
      </div>
    </div>
  )
}

// ── Page principale ────────────────────────────────────────────────────────
export default function Crypto() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // null | {type, actif?}

  const load = useCallback(async () => {
    try {
      setError('')
      const json = await api.get('/crypto/actifs')
      setData(json)
    } catch (e) {
      setError(e.message || 'Impossible de charger les données crypto.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const actifs = data?.actifs || []
  const stats = data?.stats || {}
  const mouvements = data?.mouvements || []

  const pvColor = (stats.pv_euros || 0) >= 0 ? 'var(--green)' : 'var(--red)'

  function closeModal() { setModal(null) }
  function afterSave() { closeModal(); load() }

  return (
    <>
      {modal?.type === 'ajouter' && <ModalAjouter onClose={closeModal} onSaved={afterSave} />}
      {modal?.type === 'operation' && <ModalOperation actif={modal.actif} onClose={closeModal} onSaved={afterSave} />}
      {modal?.type === 'delete' && <ModalDelete actif={modal.actif} onClose={closeModal} onSaved={afterSave} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Cryptomonnaies</h1>
          <div style={{ fontSize: '.83rem', color: 'var(--text-3)', marginTop: 4 }}>
            Suivi de vos positions crypto via CoinGecko
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ type: 'ajouter' })}>
          + Ajouter
        </button>
      </div>

      {/* Stats */}
      {!loading && !error && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
          <StatCard
            label="Valeur totale"
            value={fmtEur(stats.valeur_actuelle)}
            sub={`${actifs.length} position${actifs.length !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Investi"
            value={fmtEur(stats.valeur_investie)}
          />
          <StatCard
            label="Performance latente"
            value={fmtEur(stats.pv_euros)}
            sub={stats.pv_pct != null ? `${stats.pv_pct >= 0 ? '+' : ''}${stats.pv_pct?.toFixed(2)} %` : null}
            subColor={pvColor}
          />
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-3)' }}>Chargement…</p>}
      {error && <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>{error}</div>}

      {/* Tableau des positions */}
      {!loading && !error && actifs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12, opacity: .4 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M20 12v8l5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ fontSize: '.9rem', marginBottom: 8 }}>Aucune position crypto</div>
          <div style={{ fontSize: '.8rem' }}>Cliquez sur "+ Ajouter" pour saisir votre première position.</div>
        </div>
      )}

      {!loading && actifs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                {['Coin', 'Quantité', 'PRU', 'Cours actuel', '24h', 'Valeur', 'PV latente', ''].map((h, i) => (
                  <th key={i} style={{
                    padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right',
                    fontFamily: 'var(--mono)', fontSize: '.68rem', textTransform: 'uppercase',
                    letterSpacing: '.1em', color: 'var(--text-3)', fontWeight: 600,
                    ...(i === 7 ? { textAlign: 'center', width: 80 } : {}),
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actifs.map((a, i) => {
                const symbol = a.categorie || ''
                return (
                  <tr key={a.id} style={{ borderBottom: i < actifs.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'rgba(255,200,80,0.1)', border: '1px solid rgba(255,200,80,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '.6rem', fontWeight: 700, color: 'rgba(255,200,80,0.8)',
                          fontFamily: 'var(--mono)', flexShrink: 0,
                        }}>
                          {symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{a.nom}</div>
                          <div style={{ fontSize: '.73rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{a.ticker}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                      {fmtQty(a.quantite)} <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>{symbol}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>{fmtEur(a.pru)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--mono)', color: a.cours_ok ? 'var(--text)' : 'var(--text-3)' }}>
                      {a.cours_ok ? fmtEur(a.cours_actuel) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}><Var24h v={a.variation_24h} /></td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)' }}>
                      {a.valeur_actuelle != null ? fmtEur(a.valeur_actuelle) : '—'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div><PvBadge v={a.pv_euros} /></div>
                      <div><PvPctBadge v={a.pv_pct} /></div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '4px 10px', fontSize: '.75rem' }}
                          onClick={() => setModal({ type: 'operation', actif: a })}
                        >
                          +/-
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ padding: '4px 8px', fontSize: '.75rem', color: 'var(--red)', opacity: 0.7 }}
                          onClick={() => setModal({ type: 'delete', actif: a })}
                          title="Supprimer"
                        >
                          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                            <path d="M2 3h9M5 3V2h3v1M4 3v7.5h5V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Historique des mouvements */}
      {!loading && mouvements.length > 0 && (
        <div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.1em', fontFamily: 'var(--mono)', marginBottom: 12 }}>
            Historique des transactions
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)' }}>
                  {['Date', 'Coin', 'Opération', 'Quantité', 'Prix unit.', 'Montant', 'PV réalisée'].map((h, i) => (
                    <th key={i} style={{
                      padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right',
                      fontFamily: 'var(--mono)', fontSize: '.65rem', textTransform: 'uppercase',
                      letterSpacing: '.1em', color: 'var(--text-3)', fontWeight: 600,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...mouvements].reverse().map((m, i) => (
                  <tr key={m.id || i} style={{ borderBottom: i < mouvements.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: '.8rem' }}>{m.date_operation?.slice(0, 10) || '—'}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: 'var(--text)' }}>{m.actif_nom}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: '.75rem', fontWeight: 600,
                        background: m.type_operation === 'achat' ? 'rgba(24,195,126,0.12)' : 'rgba(255,107,107,0.12)',
                        color: m.type_operation === 'achat' ? 'var(--green)' : 'var(--red)',
                      }}>{m.type_operation}</span>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text)' }}>{fmtQty(m.quantite)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>{fmtEur(m.prix_unitaire)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--text)' }}>{fmtEur(m.montant_brut)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      {m.pv_realisee != null ? <PvBadge v={m.pv_realisee} /> : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
