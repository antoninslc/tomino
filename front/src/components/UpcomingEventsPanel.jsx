function formatDateLabel(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatDateFull(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatEur(value) {
  if (value == null || Number.isNaN(Number(value))) return ''
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value))
}

function getTypeMeta(event) {
  if (event?.type_evenement === 'dividendes') {
    return {
      label: 'Dividende',
      badgeStyle: {
        color: '#7fe0b8',
        background: 'rgba(24,195,126,0.08)',
        border: '1px solid rgba(24,195,126,0.22)'
      },
      dateStyle: {
        background: 'rgba(24,195,126,0.08)',
        border: '1px solid rgba(24,195,126,0.20)',
        color: 'var(--green)'
      },
    }
  }

  return {
    label: 'Résultats',
    badgeStyle: {
      color: '#a8dfff',
      background: 'rgba(110,231,255,0.07)',
      border: '1px solid rgba(110,231,255,0.20)'
    },
    dateStyle: {
      background: 'rgba(110,231,255,0.07)',
      border: '1px solid rgba(110,231,255,0.18)',
      color: 'var(--blue)'
    },
  }
}

function buildDetail(event) {
  if (!event) return ''

  if (event.type_evenement === 'dividendes') {
    const parts = []
    if (event.date_evenement) parts.push(`Ex-date ${formatDateFull(event.date_evenement)}`)
    if (event.date_secondaire) parts.push(`Paiement ${formatDateFull(event.date_secondaire)}`)
    if (event.montant_estime != null && Number(event.montant_estime) > 0) {
      parts.push(`Montant estimé ${formatEur(event.montant_estime)}`)
    }
    return parts.join(' · ')
  }

  const parts = []
  if (event.date_evenement) parts.push(`Publication estimée ${formatDateFull(event.date_evenement)}`)
  if (event.date_secondaire && event.date_secondaire !== event.date_evenement) {
    parts.push(`Fenêtre ${formatDateFull(event.date_evenement)} – ${formatDateFull(event.date_secondaire)}`)
  }
  if (event.eps_estime != null) {
    parts.push(`BPA consensus ${Number(event.eps_estime).toFixed(2)}`)
  }
  return parts.join(' · ')
}

function EventRow({ event, compact = false }) {
  const meta = getTypeMeta(event)
  const detail = event?.detail || buildDetail(event)
  const lineClass = compact ? 'py-3' : 'py-3.5'

  return (
    <div
      className={`grid gap-3 ${lineClass}`}
      style={{
        gridTemplateColumns: compact ? '72px minmax(0, 1fr)' : '84px minmax(0, 1fr)',
        borderBottom: '1px solid rgba(255,255,255,0.06)'
      }}
    >
      <div
        className="flex flex-col items-center justify-center rounded-xl px-2 py-2 text-center font-mono text-[0.72rem] uppercase tracking-[0.1em]"
        style={meta.dateStyle}
      >
        <span>{formatDateLabel(event?.date_evenement)}</span>
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.78rem] text-text">{event?.ticker || '—'}</span>
          <span className="min-w-0 truncate text-sm font-semibold text-text">{event?.nom || event?.ticker || 'Action'}</span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.12em]"
            style={meta.badgeStyle}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-[0.8rem] leading-6 text-text2">
          {detail || 'Événement à venir.'}
        </div>
      </div>
    </div>
  )
}

export default function UpcomingEventsPanel({
  title = 'Prochains événements',
  subtitle,
  events = [],
  emptyText = 'Aucun événement à venir sur l’horizon sélectionné.',
  compact = false,
  maxHeight = 380,
}) {
  const visibleEvents = Array.isArray(events) ? events : []

  return (
    <div className="card h-full">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="card-label" style={{ marginBottom: subtitle ? 4 : 0 }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: '.82rem', color: 'var(--text-3)', lineHeight: 1.55 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div className="badge badge-dim">{visibleEvents.length}</div>
      </div>

      <div
        style={{
          maxHeight,
          overflowY: 'auto',
          paddingRight: visibleEvents.length > 3 ? 4 : 0,
          marginRight: visibleEvents.length > 3 ? -4 : 0,
        }}
      >
        {visibleEvents.length > 0 ? (
          <div>
            {visibleEvents.map((event, index) => (
              <EventRow
                key={`${event?.ticker || 'event'}-${event?.type_evenement || 'event'}-${event?.date_evenement || index}-${index}`}
                event={event}
                compact={compact}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.08)',
              borderRadius: 16,
              padding: '20px 18px',
              color: 'var(--text-3)',
              fontSize: '.85rem',
              lineHeight: 1.6,
              background: 'rgba(255,255,255,0.02)'
            }}
          >
            {emptyText}
          </div>
        )}
      </div>
    </div>
  )
}
