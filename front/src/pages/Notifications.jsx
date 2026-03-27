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
    if (minutes < 1) return "A l'instant"
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

function IconAlerte({ type }) {
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
  // Capture la valeur de lastSeen au moment du montage pour savoir quelles notifs sont non lues
  const lastSeenAtOnMount = useRef(localStorage.getItem(LAST_SEEN_KEY) || null)
  const [notifs, setNotifs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const [alertesData, backupData] = await Promise.all([
          api.get('/alertes'),
          api.get('/backup/auto/status').catch(() => null)
        ])

        const items = []

        // Alertes declenchees
        const triggered = (alertesData?.alertes || []).filter(a => a.active === 0)
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

        // Sauvegardes
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

        // Trier par date desc (plus récente en haut), sans date à la fin
        items.sort((a, b) => {
          if (!a.date && !b.date) return 0
          if (!a.date) return 1
          if (!b.date) return -1
          return b.date - a.date
        })

        if (mounted) {
          setNotifs(items)
          // Marquer comme lu maintenant — le rendu va utiliser lastSeenAtOnMount.current (l'ancienne valeur)
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

  if (loading) {
    return (
      <p style={{ padding: '2rem', fontFamily: 'var(--mono)', fontSize: '0.85rem', color: 'var(--text2)' }}>
        Chargement...
      </p>
    )
  }

  if (notifs.length === 0) {
    return (
      <div className="fade-up" style={{ maxWidth: 560 }}>
        <div className="card" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '0.85rem', color: 'var(--text2)', marginBottom: '0.5rem' }}>
            Aucune notification
          </p>
          <p style={{ fontFamily: 'var(--mono)', fontSize: '0.75rem', color: 'var(--text3)' }}>
            Les alertes declenchees et les sauvegardes automatiques apparaitront ici.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up" style={{ display: 'grid', gap: '0.5rem', maxWidth: 560 }}>
      {notifs.map(notif => {
        const unread = isUnread(notif)
        return (
          <div
            key={notif.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: unread ? 'rgba(201, 168, 76, 0.05)' : 'var(--bg1)',
              border: `1px solid ${unread ? 'rgba(201, 168, 76, 0.18)' : 'var(--line)'}`,
              borderLeft: `2px solid ${unread ? 'var(--gold)' : 'var(--line)'}`,
              borderRadius: 6,
            }}
          >
            {/* Icone type */}
            <span style={{
              flexShrink: 0,
              marginTop: 2,
              color: notif.type === 'alerte'
                ? (notif.alerteType === 'hausse' ? 'var(--green)' : 'var(--red)')
                : 'var(--text2)',
              opacity: unread ? 1 : 0.6,
            }}>
              {notif.type === 'alerte' ? <IconAlerte type={notif.alerteType} /> : <IconBackup />}
            </span>

            {/* Contenu */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.85rem',
                fontFamily: 'var(--sans)',
                color: unread ? 'var(--text)' : 'var(--text2)',
                fontWeight: unread ? 500 : 400,
                marginBottom: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {notif.title}
                {notif.ticker && notif.ticker !== notif.title && (
                  <span style={{ marginLeft: 6, fontSize: '0.72rem', fontFamily: 'var(--mono)', color: 'var(--text3)', fontWeight: 400 }}>
                    {notif.ticker}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--mono)',
                color: 'var(--text2)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {notif.subtitle}
              </div>
            </div>

            {/* Date + lien */}
            <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span style={{ fontSize: '0.72rem', fontFamily: 'var(--mono)', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                {formatDate(notif.date)}
              </span>
              {notif.type === 'alerte' && (
                <Link
                  to="/alertes"
                  style={{ fontSize: '0.68rem', fontFamily: 'var(--mono)', color: 'var(--text3)', textDecoration: 'none', opacity: 0.7 }}
                >
                  Voir
                </Link>
              )}
              {notif.type === 'backup' && (
                <Link
                  to="/settings/export/backup"
                  style={{ fontSize: '0.68rem', fontFamily: 'var(--mono)', color: 'var(--text3)', textDecoration: 'none', opacity: 0.7 }}
                >
                  Voir
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
