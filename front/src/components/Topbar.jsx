import { Link, matchPath, useLocation } from 'react-router-dom'

function getMeta(pathname) {
  if (pathname === '/') {
    return {
      page: 'Dashboard',
      title: "Vue d'ensemble",
      action: { to: '/actifs/ajouter?env=PEA', label: '+ Ajouter' }
    }
  }

  const p = matchPath('/portefeuille/:env', pathname)
  if (p) {
    const env = String(p.params.env || 'PEA').toUpperCase()
    return {
      page: 'Portefeuilles',
      title: env,
      action: { to: `/actifs/ajouter?env=${env}`, label: '+ Nouvelle ligne' }
    }
  }

  const r = matchPath('/repartition/:env', pathname)
  if (r) {
    return {
      page: 'Portefeuilles',
      title: 'Repartition'
    }
  }

  if (pathname === '/livrets') {
    return {
      page: 'Portefeuilles',
      title: 'Livrets'
    }
  }

  if (pathname === '/analyse') {
    return {
      page: 'Intelligence',
      title: 'Analyse IA'
    }
  }

  if (pathname === '/chat') {
    return {
      page: 'Intelligence',
      title: 'Chat'
    }
  }

  if (pathname === '/actifs/ajouter') {
    return {
      page: 'Portefeuilles',
      title: 'Nouvelle position'
    }
  }

  if (matchPath('/actifs/modifier/:id', pathname)) {
    return {
      page: 'Portefeuilles',
      title: 'Modifier position'
    }
  }

  return {
    page: 'Tomino',
    title: 'Vue'
  }
}

export default function Topbar() {
  const { pathname } = useLocation()
  const meta = getMeta(pathname)

  return (
    <header className="topbar">
      <span className="topbar-page">{meta.page}</span>
      <span className="topbar-sep">/</span>
      <span className="topbar-title">{meta.title}</span>
      <div className="topbar-right">
        {meta.action && (
          <Link to={meta.action.to} className="btn btn-primary btn-sm">
            {meta.action.label}
          </Link>
        )}
      </div>
    </header>
  )
}
