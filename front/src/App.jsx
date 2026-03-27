import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api'
import UpdateBanner from './components/UpdateBanner'
import DemoBanner from './components/DemoBanner'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Portefeuille from './pages/Portefeuille'
import Repartition from './pages/Repartition'
import Livrets from './pages/Livrets'
import AssuranceVie from './pages/AssuranceVie'
import Dividendes from './pages/Dividendes'
import Alertes from './pages/Alertes'
import Analyse from './pages/AnalyseIA'
import Chat from './pages/Chat'
import ActifForm from './pages/ActifForm'
import Settings from './pages/Settings'
import Notifications from './pages/Notifications'
import Onboarding from './pages/Onboarding'
import Welcome from './pages/Welcome'

const DEFAULT_PROFIL = {
  horizon: 'long',
  risque: 'equilibre',
  objectif: 'croissance',
  strategie: 'mixte',
  style_ia: 'detaille',
  ton_ia: 'informel',
  secteurs_exclus: [],
  pays_exclus: [],
  benchmark: 'CW8.PA',
}

function parseFrenchDateTime(value) {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/)
  if (!match) return null
  const [, day, month, year, hour, minute] = match
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
}

function formatLastUpdateLabel(status) {
  if (!status?.derniere_maj || status.derniere_maj === '-') {
    return status?.marche_ouvert ? 'Marché ouvert · mise à jour en attente' : 'Marché fermé · aucune mise à jour'
  }

  const lastUpdate = parseFrenchDateTime(status.derniere_maj)
  if (!lastUpdate || Number.isNaN(lastUpdate.getTime())) {
    return status?.marche_ouvert ? 'Marché ouvert · mise à jour récente' : `Marché fermé · dernière MAJ ${status.derniere_maj}`
  }

  if (status?.marche_ouvert) {
    const minutes = Math.max(0, Math.floor((Date.now() - lastUpdate.getTime()) / 60000))
    if (minutes < 1) return 'Marché ouvert · MAJ à l’instant'
    if (minutes === 1) return 'Marché ouvert · MAJ il y a 1 min'
    if (minutes < 60) return `Marché ouvert · MAJ il y a ${minutes} min`
    const hours = Math.floor(minutes / 60)
    return `Marché ouvert · MAJ il y a ${hours} h`
  }

  const hh = String(lastUpdate.getHours()).padStart(2, '0')
  const mm = String(lastUpdate.getMinutes()).padStart(2, '0')
  return `Marché fermé · dernière MAJ ${hh}:${mm}`
}

function profileLooksDefault(profil) {
  if (!profil || typeof profil !== 'object') return true
  return (
    String(profil.horizon || '') === DEFAULT_PROFIL.horizon &&
    String(profil.risque || '') === DEFAULT_PROFIL.risque &&
    String(profil.objectif || '') === DEFAULT_PROFIL.objectif &&
    String(profil.strategie || '') === DEFAULT_PROFIL.strategie &&
    String(profil.style_ia || '') === DEFAULT_PROFIL.style_ia &&
    String(profil.ton_ia || '') === DEFAULT_PROFIL.ton_ia &&
    String(profil.benchmark || '') === DEFAULT_PROFIL.benchmark &&
    Array.isArray(profil.secteurs_exclus) &&
    profil.secteurs_exclus.length === 0 &&
    Array.isArray(profil.pays_exclus) &&
    profil.pays_exclus.length === 0
  )
}

function Topbar() {
  const location = useLocation()
  const path = location.pathname
  const [status, setStatus] = useState(null)

  const portfolioMatch = path.match(/^\/portefeuille\/(PEA|CTO|OR)$/)
  const repartitionMatch = path.match(/^\/repartition\/(PEA|CTO|OR)$/)
  const formAdd = path === '/actifs/ajouter'
  const formEdit = /^\/actifs\/modifier\/\d+$/.test(path)
  const envInQuery = new URLSearchParams(location.search).get('env') || 'PEA'
  const envForm = (envInQuery || 'PEA').toUpperCase()

  let page = 'Tomino'
  let title = ''

  useEffect(() => {
    let mounted = true

    async function loadStatus() {
      try {
        const data = await api.get('/status')
        if (mounted) setStatus(data)
      } catch {
        if (mounted) setStatus(null)
      }
    }

    loadStatus()
    const id = window.setInterval(loadStatus, 60000)
    return () => {
      mounted = false
      window.clearInterval(id)
    }
  }, [])

  const marketOpen = Boolean(status?.marche_ouvert)
  const lastLabel = formatLastUpdateLabel(status)
  const nextLabel = status?.prochaine_maj ? `Prochaine MAJ ${status.prochaine_maj}` : 'Prochaine MAJ -'

  const actions = (
    <div className="topbar-status-wrap">
      <span
        className="status-dot"
        style={marketOpen ? undefined : { background: 'rgba(173,183,199,.78)', boxShadow: '0 0 0 4px rgba(173,183,199,.10)', animation: 'none' }}
      />
      <div className="topbar-status-copy">
        <div className="topbar-status-line">{lastLabel}</div>
        <div className="topbar-status-next">{nextLabel}</div>
      </div>
    </div>
  )

  if (path === '/') {
    page = 'Dashboard'
    title = "Vue d'ensemble"
  } else if (portfolioMatch) {
    const env = portfolioMatch[1]
    page = 'Portefeuilles'
    title = env
  } else if (repartitionMatch) {
    page = 'Portefeuilles'
    title = 'Répartition'
  } else if (path === '/livrets') {
    page = 'Portefeuilles'
    title = 'Livrets'
  } else if (path === '/assurance-vie') {
    page = 'Portefeuilles'
    title = 'Assurance vie'
  } else if (path === '/dividendes') {
    page = 'Portefeuilles'
    title = 'Dividendes'
  } else if (path === '/alertes') {
    page = 'Portefeuilles'
    title = 'Alertes'
  } else if (path === '/notifications') {
    page = 'Tomino'
    title = 'Notifications'
  } else if (path === '/analyse') {
    page = 'Tomino Intelligence'
    title = 'Analyse'
  } else if (path === '/chat') {
    page = 'Tomino Intelligence'
    title = 'Chat'
  } else if (path === '/settings') {
    page = 'Tomino'
    title = 'Paramètres'
  } else if (path === '/settings/profil') {
    page = 'Paramètres'
    title = 'Profil investisseur'
  } else if (path === '/settings/ia') {
    page = 'Paramètres'
    title = 'Personnalisation IA'
  } else if (path === '/settings/comptes-etrangers') {
    page = 'Paramètres'
    title = 'Comptes étrangers'
  } else if (path === '/settings/fiscal') {
    page = 'Paramètres'
    title = 'Récapitulatif fiscal'
  } else if (path === '/settings/export') {
    page = 'Paramètres'
    title = 'Export'
  } else if (path === '/settings/export/pdf') {
    page = 'Paramètres'
    title = 'Export PDF'
  } else if (path === '/settings/export/csv-mouvements') {
    page = 'Paramètres'
    title = 'Export CSV mouvements'
  } else if (path === '/settings/export/csv-dividendes') {
    page = 'Paramètres'
    title = 'Export CSV dividendes'
  } else if (path === '/settings/export/csv-fiscal') {
    page = 'Paramètres'
    title = 'Export CSV fiscal'
  } else if (path === '/settings/export/backup') {
    page = 'Paramètres'
    title = 'Sauvegarde complète'
  } else if (path === '/settings/sync') {
    page = 'Paramètres'
    title = 'Synchronisation cloud'
  } else if (path === '/settings/pricing') {
    page = 'Paramètres'
    title = 'Tarifs'
  } else if (formAdd) {
    page = `Portefeuilles / ${envForm}`
    title = 'Nouvelle position'
  } else if (formEdit) {
    page = `Portefeuilles / ${envForm}`
    title = 'Modifier une position'
  }

  return (
    <header className="topbar">
      <span className="topbar-page">{page}</span>
      <span className="topbar-sep">/</span>
      <span className="topbar-title">{title}</span>
      <div className="topbar-right">{actions}</div>
    </header>
  )
}

export default function App() {
  const location = useLocation()
  const isChatPage = location.pathname === '/chat'
  const isOnboardingPage = location.pathname === '/onboarding'
  const isWelcomePage = location.pathname === '/welcome'
  const isSyncPage = location.pathname === '/settings/sync'
  const [profileChecked, setProfileChecked] = useState(false)
  const [needOnboarding, setNeedOnboarding] = useState(false)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    if (/\/actifs\/(ajouter|modifier)/.test(location.pathname)) return
    const id = window.setTimeout(() => window.location.reload(), 300000)
    return () => window.clearTimeout(id)
  }, [location.pathname])

  useEffect(() => {
    if (localStorage.getItem('tomino_blur') === '1') document.body.classList.add('blur-mode')
    else document.body.classList.remove('blur-mode')
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const profil = await api.get('/profil')
        const hasFlag = typeof profil?.profil_exists === 'boolean'
        const doneLocally = localStorage.getItem('tomino_onboarding_done') === '1'
        const need = hasFlag ? !profil.profil_exists : (!doneLocally && profileLooksDefault(profil))
        if (mounted) {
          setNeedOnboarding(need)
          setIsDemo(profil?.is_demo === 1)
        }
      } catch {
        if (mounted) setNeedOnboarding(false)
      } finally {
        if (mounted) setProfileChecked(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  if (!profileChecked) {
    return (
      <section style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p className="text-text2">Chargement...</p>
      </section>
    )
  }

  // Autoriser la page de connexion (sync) même si pas de profil
  if (needOnboarding && !isOnboardingPage && !isWelcomePage && !isSyncPage) {
    return <Navigate to="/welcome" replace />
  }

  if (!needOnboarding && (isOnboardingPage || isWelcomePage)) {
    return <Navigate to="/" replace />
  }

  if (isWelcomePage) {
    return (
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    )
  }

  if (isOnboardingPage) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <div className="app-shell">
      <DemoBanner isDemo={isDemo} />
      <UpdateBanner />
      <Sidebar />
      <main className="main">
        <Topbar />
        <div className={isChatPage ? 'content content-chat' : 'content'}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/portefeuille/:env" element={<Portefeuille />} />
            <Route path="/actifs/ajouter" element={<ActifForm />} />
            <Route path="/actifs/modifier/:id" element={<ActifForm />} />
            <Route path="/repartition" element={<Navigate to="/repartition/PEA" />} />
            <Route path="/repartition/:env" element={<Repartition />} />
            <Route path="/livrets" element={<Livrets />} />
            <Route path="/assurance-vie" element={<AssuranceVie />} />
            <Route path="/dividendes" element={<Dividendes />} />
            <Route path="/alertes" element={<Alertes />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/analyse" element={<Analyse />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/settings/*" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
