import { apiCache, INVALIDATION_MAP } from './cache'

// En production (exe Tauri) ou en dev Tauri (sidecar tourne sur 5000) → appel direct.
// En dev navigateur (Vite seul) → proxy Vite vers localhost:5001.
const BASE = (import.meta.env.PROD || !!window.__TAURI__)
  ? 'http://127.0.0.1:5000/api'
  : '/api'

/**
 * Extrait le premier segment de chemin d'une route API.
 * Ex : '/actifs/42/operation' → 'actifs'
 */
function resourceOf(path) {
  return path.split('?')[0].replace(/^\//, '').split('/')[0]
}

/**
 * Invalide le cache pour la ressource mutée + ses dépendances.
 */
function invalidateAfterMutation(path) {
  const resource = resourceOf(path)
  const prefixes = INVALIDATION_MAP[resource]
  if (prefixes) {
    for (const p of prefixes) apiCache.invalidate(p)
  } else {
    // ressource inconnue : on invalide au moins la route elle-même
    apiCache.invalidate('/' + resource)
  }
}

async function _fetch(path) {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

/**
 * GET avec stale-while-revalidate :
 * - Si le cache est frais  → retour immédiat (pas de réseau)
 * - Si le cache est périmé → retour immédiat + rafraîchissement en arrière-plan
 * - Si pas de cache        → fetch bloquant, mise en cache du résultat
 */
async function get(path) {
  const cached = apiCache.get(path)

  if (cached !== null) {
    if (apiCache.isStale(path)) {
      // Données périmées : on les retourne quand même et on rafraîchit en fond
      _fetch(path)
        .then((data) => apiCache.set(path, data))
        .catch(() => {})
    }
    return cached
  }

  // Pas de cache : fetch bloquant
  const data = await _fetch(path)
  apiCache.set(path, data)
  return data
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  const data = await r.json()
  invalidateAfterMutation(path)
  return data
}

async function put(path, body) {
  const r = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(await r.text())
  const data = await r.json()
  invalidateAfterMutation(path)
  return data
}

async function del(path) {
  const r = await fetch(BASE + path, { method: 'DELETE' })
  if (!r.ok) throw new Error(await r.text())
  const data = await r.json()
  invalidateAfterMutation(path)
  return data
}

export const api = { get, post, put, del }
export const apiBase = BASE
