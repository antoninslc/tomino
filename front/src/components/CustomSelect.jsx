import { useEffect, useRef, useState } from 'react'

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Sélectionner une option',
  disabled = false,
  minWidth = 0,
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState('')
  const rootRef = useRef(null)
  const selected = options.find((opt) => opt.value === value)

  useEffect(() => {
    if (!open || disabled) return

    function onDocumentMouseDown(event) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    function onEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onDocumentMouseDown)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocumentMouseDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open, disabled])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="form-input"
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        style={{
          width: '100%',
          minWidth,
          minHeight: 42,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          background: disabled ? 'rgba(255,255,255,.02)' : '#15191f',
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <span style={{ color: selected ? 'var(--text)' : 'var(--text-3)' }}>{selected?.label || placeholder}</span>
        <span style={{ color: 'var(--text-3)', fontSize: '.74rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>▼</span>
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            minWidth,
            background: '#1a1d22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            overflow: 'hidden',
            zIndex: 40,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value
            const isHovered = hovered === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onMouseEnter={() => setHovered(opt.value)}
                onMouseLeave={() => setHovered('')}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                style={{
                  display: 'flex',
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  textAlign: 'left',
                  border: 0,
                  padding: '10px 14px',
                  background: isSelected
                    ? 'rgba(255,255,255,0.06)'
                    : isHovered
                    ? 'rgba(255,255,255,0.06)'
                    : 'transparent',
                  color: 'var(--text)',
                  fontSize: '.875rem',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
