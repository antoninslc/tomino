import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

const LAST_SEEN_KEY = 'tomino_notifs_last_seen'

const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })

function formatDate(date) {
  if (!date) return '-'
  try {
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "À l'instant"
    if (minutes < 60) return `Il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Il y a ${hours} h`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Hier'
    if (days < 7) return `Il y a ${days} j`
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '-'
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function IconAlerte() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1.5 5.5H5L10 2V13L5 9.5H1.5V5.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="currentColor" fillOpacity=".1"/>
      <path d="M11.5 5.5a2.5 2.5 0 010 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconBackup() {
  return (
    <svg width="14" height="14" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 7.5L7.5 10L10 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7.5 5V10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export default function Notifications() {
  const lastSeenAtOnMount = useRef(localStorage.getItem(LAST_SEEN_KEY) || null)
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [alertesData, backupData] = await Promise.all([
          api.get('/alertes'),
          api.get('/backup/auto/status').catch(() => null),
        ])

        const items = []

        const triggered = (alertesData?.alertes || []).filter((a) => a.active === 0)
        for (const a of triggered) {
          const date = a.declenchee_le ? new Date(a.declenchee_le) : null
          items.push({
            id: `alerte-${a.id}`,
            type: 'alerte',
            alerteType: a.type_alerte,
            title: a.nom || a.ticker,
            subtitle: `Alerte ${a.type_alerte === 'hausse' ? 'hausse' : 'baisse'} · seuil ${fmtEur.format(a.seuil)}`,
            ticker: a.ticker,
            date,
          })
        }

        if (backupData?.ok) {
          if (backupData.last_daily) {
            const date = backupData.last_daily.updated_at ? new Date(backupData.last_daily.updated_at) : null
            items.push({
              id: 'backup-daily',
              type: 'backup',
              title: 'Sauvegarde quotidienne',
              subtitle: `${backupData.last_daily.filename}${backupData.last_daily.size ? ' · ' + formatSize(backupData.last_daily.size) : ''}`,
              date,
            })
          }
          if (backupData.last_weekly) {
            const date = backupData.last_weekly.updated_at ? new Date(backupData.last_weekly.updated_at) : null
            items.push({
              id: 'backup-weekly',
              type: 'backup',
              title: 'Sauvegarde hebdomadaire',
              subtitle: `${backupData.last_weekly.filename}${backupData.last_weekly.size ? ' · ' + formatSize(backupData.last_weekly.size) : ''}`,
              date,
            })
          }
        }

        items.sort((a, b) => {
          if (!a.date && !b.date) return 0
          if (!a.date) return 1
          if (!b.date) return -1
          return b.date - a.date
        })

        if (mounted) {
          setNotifs(items)
          localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString())
        }
      } catch {
        // ignore
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  function isUnread(notif) {
    if (!notif.date) return false
    if (!lastSeenAtOnMount.current) return true
    return notif.date > new Date(lastSeenAtOnMount.current)
  }

  const unreadCount = notifs.filter(isUnread).length

  return (
    <section>
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Centre de notifications</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Activité récente.</h1>
          <p className="hero-subtitle">
            Alertes déclenchées et sauvegardes automatiques. Les nouvelles notifications apparaissent en surbrillance.
          </p>
        </div>
        <div className="card" style={{ minWidth: 220, maxWidth: 300 }}>
          <div className="card-label">Non lues</div>
          <div className="stat-value" style={{ color: unreadCount > 0 ? 'var(--gold)' : 'var(--text-3)' }}>
            {loading ? '—' : unreadCount}
          </div>
          <div className="stat-sub">{loading ? '' : `${notifs.length} au total`}</div>
        </div>
      </section>

      {loading && (
        <p style={{ color: 'var(--text-3)', fontSize: '.85rem', fontFamily: 'var(--mono)', padding: '24px 0' }}>
          Chargement...
        </p>
      )}

      {!loading && notifs.length === 0 && (
        <div className="card fade-up" style={{ maxWidth: 560 }}>
          <div className="empty">
            <div className="empty-icon">◌</div>
            <p>Aucune notification pour le moment.</p>
            <span style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>
              Les alertes déclenchées et les sauvegardes automatiques apparaîtront ici.
            </span>
          </div>
        </div>
      )}

      {!loading && notifs.length > 0 && (
        <div className="fade-up" style={{ display: 'grid', gap: 6, maxWidth: 640 }}>
          {notifs.map((notif) => {
            const unread = isUnread(notif)
            const accentColor = notif.type === 'alerte'
              ? (notif.alerteType === 'hausse' ? 'var(--green)' : 'var(--red)')
              : 'var(--text-3)'

            return (
              <div
                key={notif.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 16px',
                  background: unread ? 'rgba(201,168,76,0.05)' : 'var(--bg-elev)',
                  border: `1px solid ${unread ? 'rgba(201,168,76,0.20)' : 'var(--line)'}`,
                  borderLeft: `3px solid ${unread ? 'var(--gold)' : 'var(--line)'}`,
                  borderRadius: 12,
                }}
              >
                <span style={{
                  flexShrink: 0,
                  marginTop: 2,
                  color: accentColor,
                  opacity: unread ? 1 : 0.5,
                }}>
                  {notif.type === 'alerte' ? <IconAlerte /> : <IconBackup />}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '.86rem',
                    color: unread ? 'var(--text)' : 'var(--text-2)',
                    fontWeight: unread ? 600 : 400,
                    marginBottom: 3,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {notif.title}
                    {notif.ticker && notif.ticker !== notif.title && (
                      <span style={{ marginLeft: 6, fontSize: '.72rem', fontFamily: 'var(--mono)', color: 'var(--text-3)', fontWeight: 400 }}>
                        {notif.ticker}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: '.75rem',
                    fontFamily: 'var(--mono)',
                    color: 'var(--text-3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {notif.subtitle}
                  </div>
                </div>

                <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                  <span style={{ fontSize: '.72rem', fontFamily: 'var(--mono)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {formatDate(notif.date)}
                  </span>
                  <Link
                    to={notif.type === 'alerte' ? '/alertes' : '/settings/export/backup'}
                    style={{ fontSize: '.7rem', fontFamily: 'var(--mono)', color: 'var(--text-3)', textDecoration: 'none' }}
                  >
                    Voir →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
