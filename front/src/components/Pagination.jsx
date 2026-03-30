export default function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.ceil(total / pageSize) || 1
  if (totalPages <= 1) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 12,
      padding: '0 4px',
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--text-3)' }}>
        {start}–{end} sur {total}
      </span>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          ← Précédent
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Suivant →
        </button>
      </div>
    </div>
  )
}
