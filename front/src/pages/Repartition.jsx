import { useEffect, useMemo, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { api } from '../api'

const SECTEUR_FR = {
  'Technology': 'Technologie',
  'Healthcare': 'Santé',
  'Financials': 'Finance',
  'Financial Services': 'Finance',
  'Consumer Cyclical': 'Conso. cyclique',
  'Consumer Defensive': 'Conso. défensive',
  'Industrials': 'Industrie',
  'Basic Materials': 'Matières premières',
  'Real Estate': 'Immobilier',
  'Utilities': 'Services publics',
  'Energy': 'Énergie',
  'Communication Services': 'Communication',
  'Non classifié': 'Non classifié',
}

const PAYS_FR = {
  'France': 'France',
  'United States': 'États-Unis',
  'Germany': 'Allemagne',
  'United Kingdom': 'Royaume-Uni',
  'Switzerland': 'Suisse',
  'Netherlands': 'Pays-Bas',
  'Japan': 'Japon',
  'Canada': 'Canada',
  'Australia': 'Australie',
  'China': 'Chine',
  'Non classifié': 'Non classifié',
}

function translateSecteur(s) { return SECTEUR_FR[s] || s }
function translatePays(p) { return PAYS_FR[p] || p }

function asEnv(raw) {
  const env = String(raw || 'PEA').toUpperCase()
  return ['PEA', 'CTO', 'OR'].includes(env) ? env : 'PEA'
}

function palette(i) {
  const colors = [
    'rgba(24,195,126,0.82)',
    'rgba(110,231,255,0.78)',
    'rgba(255,107,107,0.75)',
    'rgba(201,168,76,0.78)',
    'rgba(173,183,199,0.72)',
    'rgba(245,247,251,0.58)',
    'rgba(24,195,126,0.56)',
    'rgba(110,231,255,0.5)'
  ]
  return colors[i % colors.length]
}

function compactEntries(data = {}, maxSlices = 6) {
  const entries = Object.entries(data)
    .map(([k, v]) => [k, Number(v) || 0])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])

  if (entries.length <= maxSlices) return entries

  const head = entries.slice(0, maxSlices - 1)
  const tail = entries.slice(maxSlices - 1)
  const rest = tail.reduce((acc, [, v]) => acc + v, 0)
  return [...head, ['Autres', rest]]
}

function DonutCard({ title, data }) {
  const entries = useMemo(() => compactEntries(data, 8), [data])

  let cursor = 0
  const gradient = entries
    .map(([, value], i) => {
      const start = cursor
      cursor += value
      return `${palette(i)} ${start}% ${cursor}%`
    })
    .join(', ')

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: 'var(--line)', background: 'var(--bg-elev)' }}>
      <div className="text-xs uppercase tracking-[0.18em] text-text3">{title}</div>

      {!entries.length ? (
        <div className="mt-6">
          <p className="text-sm text-text2" style={{ marginBottom: 12 }}>
            Aucune donnée disponible pour cette enveloppe.
          </p>
          <NavLink
            to="/portefeuille/PEA"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',
              border: '1px solid rgba(24,195,126,.35)',
              borderRadius: 10,
              background: 'rgba(24,195,126,.07)',
              color: 'var(--green)',
              fontSize: '.85rem', fontWeight: 600,
              textDecoration: 'none',
              transition: 'background .15s',
            }}
          >
            Ajouter des actifs →
          </NavLink>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
          <div className="mx-auto">
            <div
              className="h-[220px] w-[220px] rounded-full"
              style={{ background: `conic-gradient(${gradient})` }}
            />
          </div>

          <div className="space-y-1">
            {entries.map(([label, value], i) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg border px-3 py-2"
                style={{ borderColor: 'var(--line)', background: 'var(--bg-soft)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: palette(i) }} />
                  <span className="text-sm text-text2">{label}</span>
                </div>
                <span className="font-mono text-xs text-text">{Number(value).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Repartition() {
  const { env: rawEnv } = useParams()
  const env = asEnv(rawEnv)

  const [data, setData] = useState({ secteurs: {}, pays: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const rep = await api.get(`/repartition?env=${encodeURIComponent(env)}`)
        const translateKeys = (obj, fn) => Object.fromEntries(Object.entries(obj || {}).map(([k, v]) => [fn(k), v]))
        setData({
          secteurs: translateKeys(rep?.secteurs, translateSecteur),
          pays: translateKeys(rep?.pays, translatePays),
        })
      } catch (e) {
        setError(e?.message || 'Erreur de chargement répartition')
        setData({ secteurs: {}, pays: {} })
      } finally {
        setLoading(false)
      }
    })()
  }, [env])

  return (
    <section>
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Allocation</div>
          <h1 className="hero-title" style={{ maxWidth: '16ch' }}>Répartition sectorielle et géographique.</h1>
          <p className="hero-subtitle">
            Visualisation de l'exposition par secteur et par pays, pondérée par la valeur actuelle des lignes de l'enveloppe sélectionnée.
          </p>
        </div>
      </section>

      <div className="mb-5 flex gap-2">
        {['PEA', 'CTO', 'OR'].map((key) => (
          <NavLink
            key={key}
            to={`/repartition/${key}`}
            className={({ isActive }) => `rounded-full border px-4 py-1.5 text-xs font-mono tracking-[0.14em] ${isActive ? 'text-text' : 'text-text3'}`}
            style={({ isActive }) => ({ borderColor: isActive ? 'rgba(24,195,126,.35)' : 'var(--line)', background: isActive ? 'rgba(24,195,126,.08)' : 'transparent' })}
          >
            {key}
          </NavLink>
        ))}
      </div>

      <div className="card fade-up-2" style={{ marginBottom: 16 }}>
        <div className="card-label">Note</div>
        <div style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.6 }}>
          Les ETFs sont ventilés par secteur et par pays selon leurs principales lignes (Yahoo Finance).
          Le premier chargement peut être lent — les données sont ensuite mises en cache 24h.
        </div>
      </div>

      {loading && <p className="text-text2">Chargement...</p>}
      {error && (
        <div className="mb-4 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {!loading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <DonutCard title={`Répartition sectorielle · ${env}`} data={data.secteurs} />
          <DonutCard title={`Répartition géographique · ${env}`} data={data.pays} />
        </div>
      )}
    </section>
  )
}
