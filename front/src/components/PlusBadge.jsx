/**
 * PlusBadge — cadenas SVG + label "Tomino +" (+ en doré).
 * À utiliser partout où une fonctionnalité est réservée à Tomino +.
 *
 * Usage : <PlusBadge />
 */
export default function PlusBadge() {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: '.72rem',
      fontFamily: 'var(--mono)',
      color: 'var(--text-3)',
      whiteSpace: 'nowrap',
    }}>
      <svg width="10" height="13" viewBox="0 0 10 13" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <rect x="0.75" y="5.75" width="8.5" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3 5.75V3.5a2 2 0 0 1 4 0v2.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
      Tomino <span style={{ color: '#c9a84c', fontWeight: 700 }}>+</span>
    </span>
  )
}
