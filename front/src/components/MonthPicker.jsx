/**
 * Sélecteur de mois custom — flèches prev/next, pas de popup navigateur.
 * Value / onChange : chaîne "YYYY-MM".
 */
export default function MonthPicker({ value, onChange, max }) {
  function shift(delta) {
    const [y, m] = value.split('-').map(Number)
    let nm = m + delta
    let ny = y
    if (nm > 12) { nm = 1; ny++ }
    if (nm < 1)  { nm = 12; ny-- }
    const next = `${ny}-${String(nm).padStart(2, '0')}`
    if (max && next > max) return
    onChange(next)
  }

  function label(mois) {
    if (!mois) return ''
    try {
      const [y, m] = mois.split('-')
      return new Date(Number(y), Number(m) - 1, 1)
        .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    } catch { return mois }
  }

  const isMax = max && value >= max

  return (
    <div
      className="form-input"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 12px',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => shift(-1)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-2)',
          cursor: 'pointer',
          fontSize: '1rem',
          padding: '4px 6px',
          borderRadius: 8,
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Mois précédent"
      >
        ←
      </button>

      <span style={{ fontFamily: 'var(--sans)', fontSize: '.9rem', color: 'var(--text)', textAlign: 'center', flex: 1 }}>
        {label(value)}
      </span>

      <button
        type="button"
        onClick={() => shift(1)}
        disabled={isMax}
        style={{
          background: 'none',
          border: 'none',
          color: isMax ? 'var(--text-3)' : 'var(--text-2)',
          cursor: isMax ? 'not-allowed' : 'pointer',
          fontSize: '1rem',
          padding: '4px 6px',
          borderRadius: 8,
          lineHeight: 1,
          flexShrink: 0,
          opacity: isMax ? 0.4 : 1,
        }}
        aria-label="Mois suivant"
      >
        →
      </button>
    </div>
  )
}
