import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { apiBase } from '../api'

const SYNC_AUTH_TOKEN_KEY = 'tomino_sync_auth_token'

const ICONS = {
  settings: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" fill="currentColor" opacity=".85"/>
    </svg>
  ),
  dashboard: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".85"/>
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".85"/>
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".85"/>
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.2" fill="currentColor" opacity=".85"/>
    </svg>
  ),
  pea: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 1.5L13 5.5V10.5L7.5 13.5L2 10.5V5.5L7.5 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M7.5 5L10 6.75V9.25L7.5 11L5 9.25V6.75L7.5 5Z" fill="currentColor" opacity=".7"/>
    </svg>
  ),
  cto: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 7.5C5 6.12 6.12 5 7.5 5C8.88 5 10 6.12 10 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>
    </svg>
  ),
  or: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 1L9.5 5.5H14L10.5 8.5L12 13L7.5 10.5L3 13L4.5 8.5L1 5.5H5.5L7.5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="currentColor" fillOpacity=".18"/>
    </svg>
  ),
  livrets: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M5 6H10M5 8.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M1.5 5H13.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  assuranceVie: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M3.5 9.5L6.1 6.9L8.1 8.9L11.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9.8 5.5H11.5V7.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  obligations: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2" width="5.5" height="11" rx="0.8" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="8" y="2" width="5.5" height="11" rx="0.8" stroke="currentColor" strokeWidth="1.2" opacity=".6"/>
      <path d="M3 5H7M3 7.5H7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      <path d="M10.5 5H13.5M10.5 7.5H13.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".6"/>
    </svg>
  ),
  repartition: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7.5 2V7.5L11.4 11.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M7.5 7.5L3 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".6"/>
    </svg>
  ),
  dividendes: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 12.5H13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <rect x="2.2" y="6.8" width="2.3" height="4.7" rx="0.8" fill="currentColor" opacity=".55"/>
      <rect x="6.35" y="4.2" width="2.3" height="7.3" rx="0.8" fill="currentColor" opacity=".75"/>
      <rect x="10.5" y="2" width="2.3" height="9.5" rx="0.8" fill="currentColor" opacity=".9"/>
    </svg>
  ),
  alertes: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 5.5H5L13 2.5V12.5L5 9.5H2V5.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="currentColor" fillOpacity=".12"/>
      <path d="M3.5 9.5V13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  notifications: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 1.5C5.015 1.5 3 3.515 3 6v3.5l-1 1.5h11l-1-1.5V6c0-2.485-2.015-4.5-4.5-4.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M6 11.5c0 .828.672 1.5 1.5 1.5S9 12.328 9 11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  analyse: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M9.5 9.5L13 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  chat: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 2.5C1.5 1.95 1.95 1.5 2.5 1.5H12.5C13.05 1.5 13.5 1.95 13.5 2.5V9.5C13.5 10.05 13.05 10.5 12.5 10.5H5L2 13.5V10.5H2.5C1.95 10.5 1.5 10.05 1.5 9.5V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M4.5 5.5H10.5M4.5 7.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  rapport: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="1.5" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 5h5M5 7.5h5M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  stockAnalyse: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 11L5 7.5L7.5 9.5L10.5 5.5L13 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="13" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M12 5L14 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  chevronDown: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const ACTIFS_ITEMS = [
  { to: '/portefeuille/PEA', label: 'PEA' },
  { to: '/portefeuille/CTO', label: 'CTO' },
  { to: '/crypto', label: 'Crypto' },
  { to: '/portefeuille/OR', label: 'Or' },
  { to: '/assurance-vie', label: 'Assurance vie' },
  { to: '/livrets', label: 'Livrets' },
  { to: '/obligations', label: 'Obligations (à venir)', disabled: true },
]

const SUIVI_ITEMS = [
  { to: '/repartition/PEA', label: 'Répartition', icon: 'repartition' },
  { to: '/dividendes', label: 'Dividendes', icon: 'dividendes' },
  { to: '/alertes', label: 'Alertes', icon: 'alertes' },
  { to: '/rapport', label: 'Rapport mensuel', icon: 'rapport' },
]

const INTELLIGENCE_ITEMS = [
  { to: '/chat', label: 'Chat', icon: 'chat' },
  { to: '/analyse', label: 'Diagnostic', icon: 'analyse' },
  { to: '/analyse-action', label: "Analyse d'action", icon: 'stockAnalyse' },
]

function CollapsibleGroup({ label, items, isOpen, onToggle }) {
  return (
    <div className="nav-group">
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', width: '100%',
          background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer',
        }}
      >
        <span className="nav-group-label" style={{ flex: 1, textAlign: 'left', paddingBottom: 0 }}>{label}</span>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 18, height: 18, opacity: 0.5, marginBottom: 4,
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 200ms ease',
        }}>
          {ICONS.chevronDown}
        </span>
      </button>
      {isOpen && (
        <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
          {items.map(({ to, label: lbl, disabled }) => (
            <NavLink
              key={to}
              to={disabled ? '#' : to}
              className={({ isActive }) => `nav-link portfolio-link${isActive && !disabled ? ' active' : ''}${disabled ? ' disabled' : ''}`}
              onClick={(e) => disabled && e.preventDefault()}
              style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
            >
              {lbl}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

function StaticGroup({ label, items }) {
  return (
    <div className="nav-group">
      <div className="nav-group-label">{label}</div>
      {items.map(({ to, label: lbl, icon, disabled }) => (
        <NavLink
          key={to}
          to={disabled ? '#' : to}
          className={({ isActive }) => `nav-link${isActive && !disabled ? ' active' : ''}${disabled ? ' disabled' : ''}`}
          onClick={(e) => disabled && e.preventDefault()}
          style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' }}
        >
          {icon && <span className="nav-icon">{ICONS[icon]}</span>}
          {lbl}
        </NavLink>
      ))}
    </div>
  )
}

export default function Sidebar() {
  const [isActifsOpen, setIsActifsOpen] = useState(true)
  const [showTominoPlusBadge, setShowTominoPlusBadge] = useState(false)
  const [triggeredAlertCount, setTriggeredAlertCount] = useState(0)

  useEffect(() => {
    let mounted = true

    async function loadSubscriptionState() {
      const token = String(localStorage.getItem(SYNC_AUTH_TOKEN_KEY) || '').trim()
      if (!token) {
        if (mounted) setShowTominoPlusBadge(false)
        return
      }

      try {
        const response = await fetch(apiBase + '/billing/subscription', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          if (mounted) setShowTominoPlusBadge(false)
          return
        }

        const payload = await response.json().catch(() => ({}))
        const sub = payload?.subscription || {}
        const status = String(sub?.status || '').toLowerCase()
        const isPaidActive = Boolean(sub?.tomino_plus) && !['canceled', 'cancelled', 'past_due', 'unpaid', 'expired', 'incomplete', 'incomplete_expired'].includes(status)
        if (mounted) setShowTominoPlusBadge(isPaidActive)
      } catch {
        if (mounted) setShowTominoPlusBadge(false)
      }
    }

    loadSubscriptionState()
    const intervalId = window.setInterval(loadSubscriptionState, 60000)
    const onFocus = () => loadSubscriptionState()
    window.addEventListener('focus', onFocus)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function loadTriggered() {
      try {
        const res = await fetch(apiBase + '/alertes')
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const lastSeen = localStorage.getItem('tomino_notifs_last_seen')
        const lastSeenDate = lastSeen ? new Date(lastSeen) : null
        const count = (data?.alertes || []).filter(a => {
          if (a.active !== 0) return false
          if (!lastSeenDate) return true
          const d = a.declenchee_le ? new Date(a.declenchee_le) : null
          return d && d > lastSeenDate
        }).length
        if (mounted) setTriggeredAlertCount(count)
      } catch { /* ignore */ }
    }
    loadTriggered()
    const id = window.setInterval(loadTriggered, 30000)
    return () => {
      mounted = false
      window.clearInterval(id)
    }
  }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-name" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 0 }}>
          <span>Tomino</span>
          {showTominoPlusBadge && (
            <span
              style={{
                color: '#c9a84c',
                fontSize: '1em',
                fontWeight: 700,
                lineHeight: 1,
              }}
              title="Tomino + actif"
              aria-label="Tomino + actif"
            >
              +
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <NavLink
            to="/notifications"
            className={({ isActive }) => `sidebar-settings-link${isActive ? ' active' : ''}`}
            aria-label="Notifications"
            title="Notifications"
            style={{ position: 'relative' }}
          >
            <span className="nav-icon">{ICONS.notifications}</span>
            {triggeredAlertCount > 0 && (
              <span style={{
                position: 'absolute',
                top: 3,
                right: 3,
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--red)',
                opacity: 0.9,
                pointerEvents: 'none'
              }} />
            )}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar-settings-link${isActive ? ' active' : ''}`}
            aria-label="Paramètres"
            title="Paramètres"
          >
            <span className="nav-icon">{ICONS.settings}</span>
          </NavLink>
        </div>
      </div>
      <div className="sidebar-layout">
        <div className="sidebar-top">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            style={{ marginBottom: 4 }}
          >
            <span className="nav-icon">{ICONS.dashboard}</span>
            Dashboard
          </NavLink>
        </div>

        <nav className="sidebar-scroll">
          <CollapsibleGroup
            label="Mes actifs"
            items={ACTIFS_ITEMS}
            isOpen={isActifsOpen}
            onToggle={() => setIsActifsOpen(v => !v)}
          />
          <StaticGroup label="Suivi" items={SUIVI_ITEMS} />
        </nav>

        <div className="sidebar-bottom">
          <div className="nav-group nav-group-intel">
            <div className="nav-group-label">Tomino Intelligence</div>
            {INTELLIGENCE_ITEMS.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                <span className="nav-icon">{ICONS[icon]}</span>
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    </aside>
  )
}
