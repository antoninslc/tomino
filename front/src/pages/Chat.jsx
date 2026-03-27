import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { api } from '../api'

const STORAGE_KEY = 'tomino_chat_messages'
const CONVERSATIONS_KEY = 'tomino_chat_conversations'

const WELCOME = [{ role: 'assistant', content: 'Bonjour. Je suis prêt à répondre à vos questions sur votre portefeuille.' }]

function loadMessages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  return WELCOME
}

function loadConversations() {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    localStorage.removeItem(CONVERSATIONS_KEY)
    return []
  }
}

function parseApiErrorBody(rawText, fallback) {
  try {
    const parsed = JSON.parse(String(rawText || ''))
    if (parsed?.erreur) return parsed.erreur
  } catch {
    // ignore
  }
  return String(rawText || '').trim() || fallback
}

function fmtDate(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function fmtConvDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const dStr = d.toISOString().slice(0, 10)
  if (dStr === today.toISOString().slice(0, 10)) return "Aujourd'hui"
  if (dStr === yesterday.toISOString().slice(0, 10)) return 'Hier'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function UsageRing({ pct = 0, blocked = false, size = 18 }) {
  const clamped = Math.max(0, Math.min(100, Number(pct || 0)))
  const strokeWidth = 2
  const pad = 2
  const viewSize = size + pad * 2
  const center = viewSize / 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference - (clamped / 100) * circumference
  let tone = 'rgba(24,195,126,.58)'
  if (clamped >= 80) tone = 'rgba(201,168,76,.72)'
  if (clamped >= 95 || blocked) tone = 'rgba(158,74,74,.82)'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${viewSize} ${viewSize}`} style={{ display: 'block' }} aria-hidden="true">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,.14)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={tone}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <circle cx={center} cy={center} r={2.1} fill="rgba(255,255,255,.16)" />
    </svg>
  )
}

const MAX_MSG_CHARS = 2000
const MAX_HISTORY_MESSAGES = 20

function sanitizeMessagesForApi(source) {
  const list = Array.isArray(source) ? source : []
  return list
    .filter((m, idx) => {
      if (!m || typeof m !== 'object') return false
      const role = String(m.role || '')
      const content = String(m.content || '').trim()
      if (!content) return false
      // Ne pas envoyer le message d'accueil local au modèle.
      if (idx === 0 && role === 'assistant' && content === WELCOME[0].content) return false
      return role === 'assistant' || role === 'user'
    })
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, MAX_MSG_CHARS),
    }))
}

export default function Chat() {
  const SIDEBAR_WIDTH = 268
  const [messages, setMessages] = useState(loadMessages)
  const [conversations, setConversations] = useState(loadConversations)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [quota, setQuota] = useState(null)
  const [showQuotaTip, setShowQuotaTip] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)
  const pendingDeltaRef = useRef('')
  const rafRef = useRef(null)

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations))
  }, [conversations])

  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await api.get('/ia/quota')
        setQuota(data)
      } catch {
        // ignore quota load failure
      }
    })()
  }, [])

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = 'auto'
    const max = 180
    const target = Math.min(inputRef.current.scrollHeight, max)
    inputRef.current.style.height = `${target}px`
    inputRef.current.style.overflowY = inputRef.current.scrollHeight > max ? 'auto' : 'hidden'
  }, [input])

  const canSend = useMemo(() => input.trim().length > 0 && !sending, [input, sending])
  const usagePct = useMemo(() => {
    if (!quota?.budget_eur) return 0
    const raw = (Number(quota.cost_eur || 0) / Number(quota.budget_eur || 1)) * 100
    return Math.max(0, Math.min(100, raw))
  }, [quota])
  const usageHint = useMemo(() => {
    const pct = Math.round(usagePct)
    return `Utilisation hebdomadaire IA: ${pct}%`
  }, [usagePct])
  const historyItems = useMemo(
    () => (conversations || []).map((c, i) => {
      const firstUser = (c?.messages || []).find((m) => m?.role === 'user')
      const preview = String(firstUser?.content || c?.title || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 88)
      return {
        id: c?.id || `conv-${i}`,
        title: c?.title || `Conversation ${i + 1}`,
        preview,
        date: fmtConvDate(c?.created_at),
      }
    }),
    [conversations]
  )

  function renderMarkdown(text) {
    marked.setOptions({ gfm: true, breaks: true })
    return marked.parse(text || '')
  }

  function renderLoading() {
    return '<div class="chat-loading-shimmer">Tomino réfléchit</div>'
  }

  async function sendMessage(overrideContent) {
    const content = (overrideContent ?? input).trim()
    if (!content || sending) return

    if (quota?.blocked) {
      const msg = `Limite hebdomadaire IA atteinte. Tomino sera disponible à nouveau le ${fmtDate(quota.next_reset)}.`
      setError(msg)
      setMessages((prev) => [...prev, { role: 'user', content }, { role: 'assistant', content: msg }])
      setInput('')
      return
    }

    setError('')
    setInput('')
    setSending(true)

    const next = [...messages, { role: 'user', content }, { role: 'assistant', content: '' }]
    setMessages(next)

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          messages: sanitizeMessagesForApi(next.slice(0, -1))
        })
      })

      if (!res.ok || !res.body) {
        const txt = await res.text()
        throw new Error(parseApiErrorBody(txt, 'Flux indisponible'))
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let done = false
      const timeout = setTimeout(() => abortRef.current?.abort(), 30000)

      while (!done) {
        const read = await reader.read()
        done = read.done
        buffer += decoder.decode(read.value || new Uint8Array(), { stream: !done })

        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          const lines = chunk
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)

          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const raw = line.replace(/^data:\s*/, '')
            let data
            try {
              data = JSON.parse(raw)
            } catch {
              continue
            }

            if (data.done) {
              setSending(false)
              continue
            }

            if (typeof data.delta === 'string') {
              pendingDeltaRef.current += data.delta
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                  const delta = pendingDeltaRef.current
                  pendingDeltaRef.current = ''
                  rafRef.current = null
                  if (!delta) return
                  setMessages((prev) => {
                    const copy = [...prev]
                    const lastIndex = copy.length - 1
                    if (lastIndex >= 0 && copy[lastIndex].role === 'assistant') {
                      copy[lastIndex] = {
                        ...copy[lastIndex],
                        content: (copy[lastIndex].content || '') + delta
                      }
                    }
                    return copy
                  })
                })
              }
            }
          }
        }
      }

      // Flush le delta résiduel si le rAF n'a pas encore tourné
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (pendingDeltaRef.current) {
        const delta = pendingDeltaRef.current
        pendingDeltaRef.current = ''
        setMessages((prev) => {
          const copy = [...prev]
          const lastIndex = copy.length - 1
          if (lastIndex >= 0 && copy[lastIndex].role === 'assistant') {
            copy[lastIndex] = { ...copy[lastIndex], content: (copy[lastIndex].content || '') + delta }
          }
          return copy
        })
      }

      clearTimeout(timeout)
      try {
        const quotaData = await api.get('/ia/quota')
        setQuota(quotaData)
      } catch {
        // silent
      }
    } catch (e) {
      if (e?.name === 'AbortError') {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: last.content || 'Réponse interrompue.', isError: true }
          }
          return copy
        })
      } else {
        const isNetwork = e instanceof TypeError && e.message === 'Failed to fetch'
        const errMsg = isNetwork
          ? 'Connexion interrompue. Vérifiez votre réseau et réessayez.'
          : (e?.message || "Désolé, je n'ai pas pu répondre pour le moment.")
        setError(errMsg)
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = { ...last, content: last.content || errMsg, isError: true }
          }
          return copy
        })
      }
      setSending(false)
    }
  }

  function retry() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || sending) return
    setMessages((prev) => prev.filter((_, i) => i < prev.length - 1))
    sendMessage(lastUser.content)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function _buildConversationTitle(sourceMessages) {
    const firstUser = (sourceMessages || []).find((m) => m?.role === 'user')
    if (!firstUser?.content) return 'Conversation'
    return String(firstUser.content).replace(/\s+/g, ' ').trim().slice(0, 36)
  }

  function _archiveCurrentConversation(sourceMessages = messages) {
    const userCount = (sourceMessages || []).filter((m) => m?.role === 'user').length
    if (!userCount) return
    const isOnlyWelcome = sourceMessages.length <= 1 && sourceMessages[0]?.content === WELCOME[0].content
    if (isOnlyWelcome) return

    const nowIso = new Date().toISOString()
    const entry = {
      id: `conv_${Date.now()}`,
      created_at: nowIso,
      title: _buildConversationTitle(sourceMessages),
      messages: sourceMessages,
    }

    setConversations((prev) => [entry, ...(prev || [])].slice(0, 50))
  }

  function openConversation(conversationId) {
    const item = (conversations || []).find((c) => c?.id === conversationId)
    if (!item || !Array.isArray(item.messages) || !item.messages.length) return
    setMessages(item.messages)
    setError('')
    setInput('')
  }

  function startNewChat() {
    _archiveCurrentConversation(messages)
    setMessages(WELCOME)
    setError('')
    setInput('')
  }

  return (
    <section>
      <div
        className="fade-up"
        style={{
          height: 'calc(100dvh - var(--top-h))',
          minHeight: 560,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--line)',
          borderRadius: 'var(--radius-lg)',
          background: 'linear-gradient(180deg, rgba(24, 28, 34, 0.94), rgba(16, 19, 24, 0.94))',
          boxShadow: 'var(--shadow)',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div
            ref={listRef}
            style={{ overflow: 'auto', padding: '18px 18px 12px', display: 'flex', flexDirection: 'column', gap: 10, background: 'linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.00))', flex: 1, minHeight: 0, minWidth: 0 }}
          >
            {messages.map((m, idx) => {
              const isUser = m.role === 'user'
              return (
                <div
                  id={`chat-msg-${idx}`}
                  key={idx}
                  className={isUser ? 'chat-msg chat-user' : 'chat-msg chat-ai'}
                  style={{
                    maxWidth: '78%',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    border: '1px solid var(--line)',
                    borderRadius: 14,
                    padding: '10px 12px',
                    lineHeight: 1.45,
                    fontSize: '.9rem',
                    background: isUser ? 'rgba(24,195,126,.10)' : 'rgba(255,255,255,.03)',
                    borderColor: isUser ? 'rgba(24,195,126,.28)' : 'var(--line)'
                  }}
                >
                  {isUser ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  ) : (
                    <>
                      <div
                        className={sending && idx === messages.length - 1 ? 'chat-streaming' : undefined}
                        dangerouslySetInnerHTML={{ __html: m.content ? renderMarkdown(m.content) : sending ? renderLoading() : '' }}
                      />
                      {m.isError && idx === messages.length - 1 && (
                        <button
                          type="button"
                          onClick={retry}
                          style={{ marginTop: 8, fontSize: '.75rem', color: 'var(--text-3)', background: 'none', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}
                        >
                          Réessayer
                        </button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <aside
            style={{
              width: SIDEBAR_WIDTH,
              flexShrink: 0,
              borderLeft: '1px solid var(--line)',
              boxShadow: 'inset 12px 0 18px -18px rgba(0,0,0,.65)',
              background: 'linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01))',
              padding: '14px 12px',
              overflow: 'auto',
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
              Historique
            </div>
            {!historyItems.length && (
              <div style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>
                Vos conversations apparaîtront ici.
              </div>
            )}
            {historyItems.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => openConversation(h.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: 8,
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,.02)',
                  cursor: 'pointer',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '.62rem', color: 'var(--text-3)' }}>{h.title}</div>
                  {h.date && <div style={{ fontFamily: 'var(--mono)', fontSize: '.58rem', color: 'var(--text-3)', flexShrink: 0, marginLeft: 6 }}>{h.date}</div>}
                </div>
                <div style={{ fontSize: '.77rem', color: 'var(--text-2)', lineHeight: 1.4 }}>{h.preview || '...'}</div>
              </button>
            ))}
          </aside>
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', position: 'sticky', bottom: 0, zIndex: 5, padding: '12px 14px', borderTop: '1px solid var(--line)', background: 'rgba(12, 15, 20, 0.92)', backdropFilter: 'blur(10px)' }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Posez une question sur votre portefeuille..."
                className="form-input"
                style={{ flex: 1, resize: 'none', overflow: 'hidden', minHeight: 50, maxHeight: 180 }}
              />
              {!!quota && (
                <div
                  onMouseEnter={() => setShowQuotaTip(true)}
                  onMouseLeave={() => setShowQuotaTip(false)}
                  onFocus={() => setShowQuotaTip(true)}
                  onBlur={() => setShowQuotaTip(false)}
                  tabIndex={0}
                  aria-label={usageHint}
                  style={{ position: 'relative', alignSelf: 'center' }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      cursor: 'help',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <UsageRing pct={usagePct} blocked={Boolean(quota?.blocked)} size={18} />
                  </div>
                  {showQuotaTip && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 24,
                        right: 0,
                        whiteSpace: 'nowrap',
                        background: 'rgba(9, 12, 16, 0.98)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        fontSize: '.72rem',
                        color: 'var(--text)',
                        padding: '7px 9px',
                        boxShadow: '0 8px 22px rgba(0,0,0,.45)',
                        zIndex: 20,
                      }}
                    >
                      {usageHint}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={startNewChat}
                className="btn btn-ghost"
                disabled={sending}
                title="Nouvelle conversation"
                aria-label="Nouvelle conversation"
                style={{ width: 50, minWidth: 50, height: 50, alignSelf: 'flex-end', display: 'grid', placeItems: 'center', fontSize: '1.2rem', padding: 0 }}
              >
                +
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={!canSend || quota?.blocked}
                className="btn btn-primary"
                style={{ minWidth: 112, height: 50, alignSelf: 'flex-end' }}
              >
                {sending ? '...' : 'Envoyer'}
              </button>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '.64rem', color: 'var(--text-3)', padding: '0 14px 12px' }}>
              Entrée pour envoyer · Shift+Entrée pour retour à la ligne · Réponses générées par IA - pas un conseil financier
            </div>
          </div>

          <div style={{ width: SIDEBAR_WIDTH, flexShrink: 0, borderLeft: '1px solid var(--line)', background: 'rgba(255,255,255,.01)' }} />
        </div>
      </div>
    </section>
  )
}
