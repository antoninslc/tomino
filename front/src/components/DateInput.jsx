import { useEffect, useRef, useState } from 'react'

const DAYS_FR = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

function parseYMD(str) {
  if (!str) return null
  const parts = str.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return { y: parts[0], m: parts[1], d: parts[2] }
}

function toYMD(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function getDaysInMonth(y, m) {
  return new Date(y, m, 0).getDate()
}

function getFirstWeekday(y, m) {
  // 0 = Lundi … 6 = Dimanche
  const raw = new Date(y, m - 1, 1).getDay()
  return raw === 0 ? 6 : raw - 1
}

function formatDisplay(str) {
  const p = parseYMD(str)
  if (!p) return ''
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`
}

const NAV_BTN = {
  background: 'none',
  border: 'none',
  color: 'var(--text-2)',
  cursor: 'pointer',
  fontSize: '1rem',
  padding: '4px 10px',
  borderRadius: 8,
  lineHeight: 1,
}

const FOOT_BTN = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '.75rem',
  fontFamily: 'var(--mono)',
  color: 'var(--text-3)',
  padding: '2px 6px',
  borderRadius: 6,
}

export default function DateInput({
  value,
  onChange,
  required,
  placeholder,
}) {
  const [open, setOpen] = useState(false)
  const [nav, setNav] = useState(null)
  const [placement, setPlacement] = useState({ vertical: 'bottom', horizontal: 'left' })
  const rootRef = useRef(null)

  const POPUP_W = 260
  const POPUP_H = 320

  function initNav() {
    const p = parseYMD(value)
    if (p) return { y: p.y, m: p.m }
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() + 1 }
  }

  function openPicker() {
    if (rootRef.current) {
      const rect = rootRef.current.getBoundingClientRect()
      // Horizontal : à droite si la place suffit, sinon à gauche
      const spaceRight = window.innerWidth - rect.right
      const spaceLeft = rect.left
      const horizontal = spaceRight >= POPUP_W || spaceRight >= spaceLeft ? 'right' : 'left'
      // Vertical : aligne sur le haut du trigger, bascule vers le bas si ça déborde
      const fitsFromTop = rect.top + POPUP_H <= window.innerHeight
      setPlacement({ horizontal, fitsFromTop })
    }
    setNav(initNav())
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function shiftMonth(delta) {
    setNav((n) => {
      let m = n.m + delta
      let y = n.y
      if (m > 12) { m = 1; y++ }
      if (m < 1) { m = 12; y-- }
      return { y, m }
    })
  }

  function selectDay(d) {
    onChange(toYMD(nav.y, nav.m, d))
    setOpen(false)
  }

  const today = new Date()
  const todayYMD = toYMD(today.getFullYear(), today.getMonth() + 1, today.getDate())
  const sel = parseYMD(value)

  // Build calendar grid
  let cells = []
  if (nav) {
    const total = getDaysInMonth(nav.y, nav.m)
    const offset = getFirstWeekday(nav.y, nav.m)
    for (let i = 0; i < offset; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        className="form-input"
        onClick={openPicker}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          textAlign: 'left',
          cursor: 'pointer',
          minHeight: 42,
          width: '100%',
          userSelect: 'none',
        }}
      >
        <span style={{
          fontFamily: 'var(--mono)',
          fontSize: '.875rem',
          color: value ? 'var(--text)' : 'var(--text-3)',
        }}>
          {value ? formatDisplay(value) : (placeholder || 'jj / mm / aaaa')}
        </span>
        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="1.5" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 1.5V3.5M10 1.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M1.5 5.5H13.5" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </span>
      </button>

      {/* Popup — à droite du trigger, aligné sur son bord supérieur */}
      {open && nav && (
        <div style={{
          position: 'absolute',
          top: placement.fitsFromTop ? 0 : 'auto',
          bottom: placement.fitsFromTop ? 'auto' : 0,
          left: placement.horizontal === 'right' ? 'calc(100% + 8px)' : 'auto',
          right: placement.horizontal === 'left' ? 'calc(100% + 8px)' : 'auto',
          background: '#1a1d22',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          zIndex: 50,
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          padding: '14px 12px 10px',
          minWidth: 252,
        }}>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" style={NAV_BTN} onClick={() => shiftMonth(-1)} aria-label="Mois précédent">
              ←
            </button>
            <span style={{ fontSize: '.86rem', fontWeight: 600, color: 'var(--text)' }}>
              {MONTHS_FR[nav.m - 1]} {nav.y}
            </span>
            <button type="button" style={NAV_BTN} onClick={() => shiftMonth(1)} aria-label="Mois suivant">
              →
            </button>
          </div>

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAYS_FR.map((d) => (
              <div key={d} style={{
                textAlign: 'center',
                fontSize: '.62rem',
                color: 'var(--text-3)',
                fontFamily: 'var(--mono)',
                padding: '2px 0',
                letterSpacing: '.02em',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, idx) => {
              if (d === null) return <div key={idx} />
              const ymd = toYMD(nav.y, nav.m, d)
              const isSelected = sel && sel.y === nav.y && sel.m === nav.m && sel.d === d
              const isToday = ymd === todayYMD
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectDay(d)}
                  style={{
                    border: 'none',
                    borderRadius: 7,
                    padding: '6px 0',
                    fontSize: '.8rem',
                    fontFamily: 'var(--mono)',
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--green)'
                      : isToday
                      ? 'rgba(24,195,126,0.12)'
                      : 'transparent',
                    color: isSelected ? '#0a0f14' : isToday ? 'var(--green)' : 'var(--text)',
                    fontWeight: isSelected || isToday ? 600 : 400,
                    textAlign: 'center',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isSelected
                      ? 'var(--green)'
                      : isToday
                      ? 'rgba(24,195,126,0.12)'
                      : 'transparent'
                  }}
                >
                  {d}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}>
            <button
              type="button"
              style={FOOT_BTN}
              onClick={() => { onChange(''); setOpen(false) }}
            >
              Effacer
            </button>
            <button
              type="button"
              style={{ ...FOOT_BTN, color: 'var(--green)' }}
              onClick={() => { onChange(todayYMD); setOpen(false) }}
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>
      )}

      {/* Hidden native input for form required validation */}
      {required && (
        <input
          tabIndex={-1}
          required
          value={value || ''}
          onChange={() => {}}
          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  )
}
