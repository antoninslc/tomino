const IS_TAURI = typeof window !== 'undefined' && (
  window.__TAURI__ !== undefined ||
  window.__TAURI_INTERNALS__ !== undefined ||
  window.location.protocol === 'tauri:' ||
  window.location.hostname === 'tauri.localhost' ||
  window.location.hostname === 'localhost' && window.location.port !== '5173'
)

const BASE = IS_TAURI
  ? 'http://127.0.0.1:5000/api'
  : '/api'

async function get(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

async function put(path, body) {
  const r = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

async function del(path) {
  const r = await fetch(BASE + path, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export const api = { get, post, put, del }
