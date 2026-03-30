/**
 * Cache mémoire in-process — stale-while-revalidate.
 * Données sensibles uniquement en RAM, jamais en localStorage.
 */

const store = new Map()

// TTL par préfixe de route (ms)
const TTL_RULES = [
  ['/status',    30_000],   // statut marché : 30s
  ['/cours/',    60_000],   // cours unitaire : 1 min
  ['/benchmark', 300_000],  // benchmark : 5 min
  ['/rapport',   300_000],  // rapport mensuel : 5 min
]
const TTL_DEFAULT = 120_000 // tout le reste : 2 min

function ttlForKey(key) {
  for (const [prefix, ttl] of TTL_RULES) {
    if (key.startsWith(prefix)) return ttl
  }
  return TTL_DEFAULT
}

export const apiCache = {
  get(key) {
    return store.get(key)?.data ?? null
  },

  set(key, data) {
    store.set(key, { data, ts: Date.now(), ttl: ttlForKey(key) })
  },

  isStale(key) {
    const e = store.get(key)
    if (!e) return true
    return Date.now() - e.ts > e.ttl
  },

  /**
   * Supprime toutes les entrées dont la clé commence par `prefix`
   * ou est exactement `prefix` (avec ou sans query string).
   */
  invalidate(prefix) {
    const bare = prefix.split('?')[0]
    for (const k of store.keys()) {
      const kBare = k.split('?')[0]
      if (kBare === bare || kBare.startsWith(bare + '/')) {
        store.delete(k)
      }
    }
  },

  invalidateAll() {
    store.clear()
  },
}

/**
 * Carte d'invalidation : quand une mutation touche /foo,
 * on vide aussi ces autres préfixes liés.
 */
export const INVALIDATION_MAP = {
  actifs:           ['/actifs', '/resume', '/repartition'],
  mouvements:       ['/actifs', '/resume'],
  dividendes:       ['/dividendes'],
  alertes:          ['/alertes'],
  livrets:          ['/livrets', '/resume'],
  assurance_vie:    ['/assurance_vie', '/resume'],
  rapport:          ['/rapport'],
  profil:           ['/profil'],
  comptes_etrangers:['/comptes_etrangers'],
  sync:             [], // invalide tout via invalidateAll
}
