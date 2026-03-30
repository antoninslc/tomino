import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import CustomSelect from '../components/CustomSelect'
import PlusBadge from '../components/PlusBadge'
import DateInput from '../components/DateInput'
import SyncPage from './settings/SyncPage'
import PricingPage from './settings/PricingPage'
import FiscalPage from './settings/FiscalPage'
import ExportPage from './settings/ExportPage'
import ComptesEtrangersPage from './settings/ComptesEtrangersPage'
import ConfidentialitePage from './settings/ConfidentialitePage'

const BLUR_KEY = 'tomino_blur'
const SYNC_AUTH_TOKEN_KEY = 'tomino_sync_auth_token'
const SYNC_DEVICE_ID_KEY = 'tomino_sync_device_id'

const PLAN_OPTIONS = [
  { tier: 'free', label: 'Gratuit', sub: 'Local desktop, 3 alertes max, sans sync cloud.' },
  { tier: 'tomino_plus', label: 'Tomino + — 4,99€/mois', sub: 'Sync multi-appareils, alertes illimitées, IA avancée.' },
]

const FREE_FEATURES = [
  'Tracking complet (PEA, CTO, Or, Livrets, AV)',
  'Cours temps réel',
  'Dashboard et historique',
  '3 alertes prix maximum',
  'IA limitée (2 analyses/semaine, chat basique)',
  'Export backup local',
  'Application desktop uniquement',
]

const TOMINO_PLUS_FEATURES = [
  'Tout le Gratuit',
  'Sync multi-appareils (PC et mobile web)',
  'Alertes illimitées',
  'IA avancée (analyses plus profondes)',
  'Rapports mensuels automatiques',
  'Export PDF premium',
  'Simulateur "et si ?" (quand disponible)',
  'Nouvelles enveloppes en avant-première',
]

function buildSyncDeviceId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `dev_${window.crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  }
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

const DEFAULT_PROFILE = {
  horizon: 'long',
  risque: 'equilibre',
  objectif: 'croissance',
  strategie: 'mixte',
  style_ia: 'detaille',
  ton_ia: 'informel',
  secteurs_exclus: [],
  benchmark: 'CW8.PA',
  tier: 'free',
}

const HORIZONS = [
  { label: 'Court terme (< 3 ans)', value: 'court' },
  { label: 'Moyen terme (3-10 ans)', value: 'moyen' },
  { label: 'Long terme (> 10 ans)', value: 'long' },
]

const RISQUES = [
  { label: '< 5% (Prudent)', value: 'prudent' },
  { label: '5-15% (Équilibré)', value: 'equilibre' },
  { label: '15-30% (Dynamique)', value: 'dynamique' },
  { label: '> 30% (Spéculatif)', value: 'speculatif' },
]

const OBJECTIFS = [
  { label: 'Faire croître mon capital', value: 'croissance' },
  { label: 'Générer des revenus', value: 'revenus' },
  { label: 'Préserver mon patrimoine', value: 'preservation' },
]

const STRATEGIES = [
  { label: 'Passive (ETF uniquement)', value: 'passive' },
  { label: 'Mixte', value: 'mixte' },
  { label: 'Active (stock picking)', value: 'active' },
]

const BENCHMARKS = [
  { label: 'MSCI World (CW8.PA)', value: 'CW8.PA' },
  { label: 'CAC 40 (^FCHI)', value: '^FCHI' },
  { label: 'S&P 500 (PSP5.PA)', value: 'PSP5.PA' },
]

const EXCLUSIONS = [
  { label: 'Armement', value: 'armement' },
  { label: 'Tabac', value: 'tabac' },
  { label: 'Alcool', value: 'alcool' },
  { label: "Jeux d'argent", value: 'jeux_argent' },
  { label: 'Énergies fossiles', value: 'energies_fossiles' },
]

const TIERS = [
  {
    value: 'free',
    label: 'Éco',
    sub: 'Réponse courte, consommation minimale',
    minPlan: 'free',
  },
  {
    value: 'tomino_plus',
    label: 'Approfondi',
    sub: 'Analyse riche, consommation plus élevée',
    minPlan: 'tomino_plus',
  },
]

const COURTIERS_POPULAIRES = [
  {
    etablissement: 'DEGIRO',
    pays: 'Pays-Bas',
    adresse: 'Rembrandt Tower, 17th floor, Amstelplein 1, 1096 HA Amsterdam, Netherlands',
    type_compte: 'titres',
  },
  {
    etablissement: 'Interactive Brokers Ireland',
    pays: 'Irlande',
    adresse: '10 Earlsfort Terrace, Dublin 2, D02 T380, Ireland',
    type_compte: 'titres',
  },
  {
    etablissement: 'Trade Republic',
    pays: 'Allemagne',
    adresse: 'Kastanienallee 32, 10435 Berlin, Germany',
    type_compte: 'titres',
  },
  {
    etablissement: 'Trading 212',
    pays: 'Royaume-Uni',
    adresse: '107 Cheapside, London EC2V 6DN, United Kingdom',
    type_compte: 'titres',
  },
  {
    etablissement: 'eToro',
    pays: 'Chypre',
    adresse: 'KIBC, 4 Profiti Ilias Street, Germasogeia, 4046 Limassol, Cyprus',
    type_compte: 'titres',
  },
  {
    etablissement: 'Scalable Capital',
    pays: 'Allemagne',
    adresse: 'Seitzstraße 8e, 80538 Munich, Germany',
    type_compte: 'titres',
  },
  {
    etablissement: 'XTB',
    pays: 'Pologne',
    adresse: 'Prosta 67, 00-838 Warsaw, Poland',
    type_compte: 'titres',
  },
  {
    etablissement: 'Saxo Bank',
    pays: 'Danemark',
    adresse: 'Philip Heymans Alle 15, 2900 Hellerup, Denmark',
    type_compte: 'titres',
  },
]

const TYPE_COMPTE_OPTIONS = [
  { value: 'titres', label: 'Titres' },
  { value: 'cash', label: 'Espèces' },
  { value: 'neobanque', label: 'Compte néobanque' },
  { value: 'paiement', label: 'Compte de paiement' },
  { value: 'assurance_vie', label: 'Contrat / compte assurance vie' },
  { value: 'derives', label: 'Produits dérivés' },
  { value: 'crypto', label: 'Crypto-actifs' },
  { value: 'autre', label: 'Autre' },
]

const TITULAIRE_OPTIONS = [
  { value: 'titulaire', label: 'Titulaire' },
  { value: 'cotitulaire', label: 'Co-titulaire' },
  { value: 'mandataire', label: 'Mandataire' },
]

const DETENTION_OPTIONS = [
  { value: 'directe', label: 'Détention directe' },
  { value: 'indirecte', label: 'Détention indirecte' },
  { value: 'usufruit', label: 'Usufruit' },
  { value: 'nue_propriete', label: 'Nue-propriété' },
]

const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear()
  const years = []
  for (let y = now; y >= now - 10; y -= 1) {
    years.push({ value: String(y), label: String(y) })
  }
  return years
})()

const MOTIF_LABELS = {
  ouvert_dans_annee: 'Ouvert pendant l’année',
  clos_dans_annee: 'Clôturé pendant l’année',
  actif_sur_annee: 'Actif sur l’année',
  ouvert_et_clos_dans_annee: 'Ouvert puis clôturé pendant l’année',
  date_ouverture_manquante: 'Date d’ouverture manquante (à vérifier)',
}

const SCORE_LABELS = {
  eleve: 'Élevé',
  moyen: 'Moyen',
  faible: 'Faible',
}

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function ChoiceButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? '1px solid rgba(24,195,126,.55)' : '1px solid var(--line)',
        background: active ? 'rgba(24,195,126,.12)' : 'rgba(255,255,255,.02)',
        color: active ? 'var(--text)' : 'var(--text-2)',
        borderRadius: 12,
        padding: '11px 13px',
        textAlign: 'left',
        fontSize: '.88rem',
        fontWeight: 600,
        transition: 'all .14s ease',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function BackHeader({ title, subtitle, onBack }) {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>← Retour</button>
      </div>
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Configuration</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>{title}</h1>
          <p className="hero-subtitle">{subtitle}</p>
        </div>
      </section>
    </>
  )
}

function formatDateFr(value) {
  const raw = String(value || '').trim()
  if (!raw) return '-'
  const parts = raw.slice(0, 10).split('-')
  if (parts.length !== 3) return raw
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function typeCompteLabel(value) {
  const found = TYPE_COMPTE_OPTIONS.find((o) => o.value === value)
  return found ? found.label : (value || '-')
}

function titulaireLabel(value) {
  const found = TITULAIRE_OPTIONS.find((o) => o.value === value)
  return found ? found.label : (value || '-')
}

export default function Settings() {
  const location = useLocation()
  const navigate = useNavigate()
  const path = location.pathname
  const billingStatus = new URLSearchParams(location.search || '').get('billing')
  const isProfilePage = path === '/settings/profil'
  const isIaPage = path === '/settings/ia'
  const isComptesPage = path === '/settings/comptes-etrangers'
  const isFiscalPage = path === '/settings/fiscal'
  const isExportPage = path === '/settings/export'
  const isExportPdfPage = path === '/settings/export/pdf'
  const isExportCsvMouvementsPage = path === '/settings/export/csv-mouvements'
  const isExportCsvDividendesPage = path === '/settings/export/csv-dividendes'
  const isExportCsvFiscalPage = path === '/settings/export/csv-fiscal'
  const isExportBackupPage = path === '/settings/export/backup'
  const isSyncPage = path === '/settings/sync'
  const isPricingPage = path === '/settings/pricing'
  const isConfidentialitePage = path === '/settings/confidentialite'
  const isAnyExportSubPage = isExportPdfPage || isExportCsvMouvementsPage || isExportCsvDividendesPage || isExportCsvFiscalPage || isExportBackupPage
  const [form, setForm] = useState(DEFAULT_PROFILE)
  const [comptes, setComptes] = useState([])
  const [compteForm, setCompteForm] = useState({
    etablissement: '',
    pays: '',
    adresse: '',
    etablissement_ville: '',
    etablissement_code_postal: '',
    etablissement_identifiant: '',
    numero_compte: '',
    date_ouverture: '',
    date_cloture: '',
    type_compte: 'titres',
    type_compte_detail: '',
    titulaire: 'titulaire',
    titulaire_nom: '',
    co_titulaire_nom: '',
    detention_mode: 'directe',
    actif_numerique: false,
    plateforme_actifs_numeriques: '',
    wallet_adresse: '',
    commentaire: '',
  })
  const [editingCompteId, setEditingCompteId] = useState(null)
  const [showCourtierSuggestions, setShowCourtierSuggestions] = useState(false)
  const [declarationYear, setDeclarationYear] = useState(String(new Date().getFullYear() - 1))
  const [declaration, setDeclaration] = useState({
    annee: new Date().getFullYear() - 1,
    comptes: [],
    score_confiance: 'moyen',
    vigilances: [],
    hypotheses: [],
    checklist: [],
    stats: {
      total: 0,
      ouverts_dans_annee: 0,
      clos_dans_annee: 0,
      actifs_sur_annee: 0,
      ouverts_et_clos_dans_annee: 0,
      dates_ouverture_manquantes: 0,
      comptes_3916_bis: 0,
    },
  })
  const [declarationLoading, setDeclarationLoading] = useState(false)
  const [fiscalYear, setFiscalYear] = useState(String(new Date().getFullYear() - 1))
  const [fiscal, setFiscal] = useState(null)
  const [fiscalLoading, setFiscalLoading] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [includeIaInPdf, setIncludeIaInPdf] = useState(true)
  const [exportingCsvMouvements, setExportingCsvMouvements] = useState(false)
  const [exportingCsvDividendes, setExportingCsvDividendes] = useState(false)
  const [exportingCsvFiscal, setExportingCsvFiscal] = useState(false)
  const [exportFiscalYear, setExportFiscalYear] = useState(String(new Date().getFullYear() - 1))
  const [exportingBackup, setExportingBackup] = useState(false)
  const [importingBackup, setImportingBackup] = useState(false)
  const [selectedBackupName, setSelectedBackupName] = useState('')
  const [selectedBackupFile, setSelectedBackupFile] = useState(null)
  const [showBackupPasswordFields, setShowBackupPasswordFields] = useState(false)
  const [backupPassword, setBackupPassword] = useState('')
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [verifyingBackup, setVerifyingBackup] = useState(false)
  const [backupVerification, setBackupVerification] = useState(null)
  const [confirmRestoreChecked, setConfirmRestoreChecked] = useState(false)
  const [autoBackupStatus, setAutoBackupStatus] = useState(null)
  const [loadingAutoBackupStatus, setLoadingAutoBackupStatus] = useState(false)
  const [openingAutoBackupFolder, setOpeningAutoBackupFolder] = useState(false)
  const [syncAuthToken, setSyncAuthToken] = useState(() => localStorage.getItem(SYNC_AUTH_TOKEN_KEY) || '')
  const [syncDeviceId, setSyncDeviceId] = useState(() => {
    const existing = localStorage.getItem(SYNC_DEVICE_ID_KEY)
    if (existing) return existing
    const next = buildSyncDeviceId()
    localStorage.setItem(SYNC_DEVICE_ID_KEY, next)
    return next
  })
  const [syncAuthUser, setSyncAuthUser] = useState(null)
  const [syncSubscription, setSyncSubscription] = useState(null)
  const [syncDevices, setSyncDevices] = useState([])
  const [syncCurrentDeviceId, setSyncCurrentDeviceId] = useState('')
  const [syncAuthModalOpen, setSyncAuthModalOpen] = useState(false)
  const [syncAuthMode, setSyncAuthMode] = useState('login')
  const [syncAuthEmail, setSyncAuthEmail] = useState('')
  const [syncAuthPassword, setSyncAuthPassword] = useState('')
  const [syncAuthTier, setSyncAuthTier] = useState('free')
  const [syncAuthDeviceLabel, setSyncAuthDeviceLabel] = useState('Mon appareil')
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncAuthSaving, setSyncAuthSaving] = useState(false)
  const [syncActionSaving, setSyncActionSaving] = useState(false)
  const [syncEntryLoading, setSyncEntryLoading] = useState(false)
  const fileInputRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [autoSaveStatus, setAutoSaveStatus] = useState('')
  const autoSaveTimerRef = useRef(null)
  const [toastMsg, setToastMsg] = useState('')
  const [confirmCompte, setConfirmCompte] = useState(null)
  const [blurAmounts, setBlurAmounts] = useState(() => localStorage.getItem(BLUR_KEY) === '1')
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    if (window.__TAURI__) {
      import('@tauri-apps/api/app')
        .then(m => m.getVersion().then(setAppVersion).catch(() => {}))
        .catch(() => {})
    } else {
      setAppVersion('Web')
    }
  }, [])

  useEffect(() => {
    if (!confirmCompte) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [confirmCompte])

  const courtierSuggestions = useMemo(() => {
    const q = normalizeText(compteForm.etablissement)
    if (!q || q.length < 2) return []
    return COURTIERS_POPULAIRES
      .filter((c) => normalizeText(c.etablissement).includes(q))
      .slice(0, 6)
  }, [compteForm.etablissement])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setLoading(true)
        setError('')
        const profil = await api.get('/profil')
        if (!mounted) return
        setForm({
          horizon: profil?.horizon || DEFAULT_PROFILE.horizon,
          risque: profil?.risque || DEFAULT_PROFILE.risque,
          objectif: profil?.objectif || DEFAULT_PROFILE.objectif,
          strategie: profil?.strategie || DEFAULT_PROFILE.strategie,
          style_ia: profil?.style_ia || DEFAULT_PROFILE.style_ia,
          ton_ia: profil?.ton_ia || DEFAULT_PROFILE.ton_ia,
          secteurs_exclus: Array.isArray(profil?.secteurs_exclus) ? profil.secteurs_exclus : [],
          benchmark: profil?.benchmark || DEFAULT_PROFILE.benchmark,
          tier: profil?.tier || DEFAULT_PROFILE.tier,
        })
      } catch (e) {
        if (!mounted) return
        setError(e?.message || "Impossible de charger le profil.")
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  function toggleBlur() {
    const next = !blurAmounts
    setBlurAmounts(next)
    localStorage.setItem(BLUR_KEY, next ? '1' : '0')
    if (next) document.body.classList.add('blur-mode')
    else document.body.classList.remove('blur-mode')
  }

  function setField(name, value) {
    const next = { ...form, [name]: value }
    setForm(next)
    saveProfileAuto(next)
  }

  async function saveProfileAuto(data) {
    setAutoSaveStatus('saving')
    try {
      await api.post('/profil', {
        horizon: data.horizon,
        risque: data.risque,
        objectif: data.objectif,
        strategie: data.strategie,
        style_ia: data.style_ia,
        ton_ia: data.ton_ia,
        secteurs_exclus: data.secteurs_exclus,
        benchmark: data.benchmark,
        tier: data.tier,
      })
      setAutoSaveStatus('saved')
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = setTimeout(() => setAutoSaveStatus(''), 2000)
    } catch {
      setAutoSaveStatus('error')
    }
  }

  function toggleExclusion(value) {
    setForm((current) => {
      const has = current.secteurs_exclus.includes(value)
      return {
        ...current,
        secteurs_exclus: has
          ? current.secteurs_exclus.filter((v) => v !== value)
          : [...current.secteurs_exclus, value],
      }
    })
  }

  function showToast(message) {
    setToastMsg(message)
    window.setTimeout(() => setToastMsg(''), 2200)
  }

  function closeErrorModal() {
    setError('')
  }

  async function loadComptes() {
    try {
      const data = await api.get('/comptes-etrangers')
      setComptes(Array.isArray(data?.comptes) ? data.comptes : [])
    } catch (e) {
      setError(e?.message || 'Impossible de charger les comptes étrangers.')
    }
  }

  async function loadDeclaration(annee) {
    try {
      setDeclarationLoading(true)
      const data = await api.get(`/comptes-etrangers/declaration?annee=${encodeURIComponent(annee)}`)
      setDeclaration({
        annee: data?.annee || Number(annee),
        comptes: Array.isArray(data?.comptes) ? data.comptes : [],
        score_confiance: data?.score_confiance || 'moyen',
        vigilances: Array.isArray(data?.vigilances) ? data.vigilances : [],
        hypotheses: Array.isArray(data?.hypotheses) ? data.hypotheses : [],
        checklist: Array.isArray(data?.checklist) ? data.checklist : [],
        stats: data?.stats || {
          total: 0,
          ouverts_dans_annee: 0,
          clos_dans_annee: 0,
          actifs_sur_annee: 0,
          ouverts_et_clos_dans_annee: 0,
          dates_ouverture_manquantes: 0,
          comptes_3916_bis: 0,
        },
      })
    } catch (e) {
      setError(e?.message || 'Impossible de charger la préparation fiscale.')
    } finally {
      setDeclarationLoading(false)
    }
  }

  async function loadFiscal(annee) {
    try {
      setFiscalLoading(true)
      const data = await api.get(`/fiscal?annee=${encodeURIComponent(annee)}`)
      setFiscal(data?.annee !== undefined ? data : null)
    } catch (e) {
      setError(e?.message || 'Impossible de charger le récapitulatif fiscal.')
    } finally {
      setFiscalLoading(false)
    }
  }

  useEffect(() => {
    if (!isComptesPage) return
    loadComptes()
    loadDeclaration(declarationYear)
  }, [isComptesPage, declarationYear])

  useEffect(() => {
    if (!isFiscalPage) return
    loadFiscal(fiscalYear)
  }, [isFiscalPage, fiscalYear])

  useEffect(() => {
    if (!isExportBackupPage) return
    loadAutoBackupStatus()
  }, [isExportBackupPage])

  useEffect(() => {
    if (!isSyncPage) return
    loadSyncState()
  }, [isSyncPage, syncAuthToken])

  useEffect(() => {
    if (!isSyncPage || !billingStatus) return
    if (billingStatus === 'success') {
      showToast('Paiement reçu. Activation Tomino+ en cours...')
      
      // Retry logic: le webhook Stripe est asynchrone, il faut attendre
      let retries = 0
      const maxRetries = 8
      const waitForTominoPlus = async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 500 * (retries + 1)))
          const billingData = await syncFetch('/api/billing/subscription')
          const isTominoPlus = billingData?.subscription?.tomino_plus
          
          if (isTominoPlus) {
            await loadSyncState()
            showToast('Tomino+ activé ! Profitez de la synchronisation cloud.')
          } else if (retries < maxRetries) {
            retries++
            await waitForTominoPlus()
          } else {
            showToast('Activation en cours... Rechargez la page si nécessaire.')
            await loadSyncState()
          }
        } catch (e) {
          console.error("Erreur lors de l'attente du webhook:", e)
        }
      }
      
      waitForTominoPlus()
    } else if (billingStatus === 'cancel') {
      showToast('Paiement annulé.')
    }
    navigate('/settings/sync', { replace: true })
  }, [isSyncPage, billingStatus, navigate])

  function resetCompteForm() {
    setCompteForm({
      etablissement: '',
      pays: '',
      adresse: '',
      etablissement_ville: '',
      etablissement_code_postal: '',
      etablissement_identifiant: '',
      numero_compte: '',
      date_ouverture: '',
      date_cloture: '',
      type_compte: 'titres',
      type_compte_detail: '',
      titulaire: 'titulaire',
      titulaire_nom: '',
      co_titulaire_nom: '',
      detention_mode: 'directe',
      actif_numerique: false,
      plateforme_actifs_numeriques: '',
      wallet_adresse: '',
      commentaire: '',
    })
    setEditingCompteId(null)
    setShowCourtierSuggestions(false)
  }

  function startEditCompte(compte) {
    setCompteForm({
      etablissement: compte.etablissement || '',
      pays: compte.pays || '',
      adresse: compte.adresse || '',
      etablissement_ville: compte.etablissement_ville || '',
      etablissement_code_postal: compte.etablissement_code_postal || '',
      etablissement_identifiant: compte.etablissement_identifiant || '',
      numero_compte: compte.numero_compte || '',
      date_ouverture: compte.date_ouverture || '',
      date_cloture: compte.date_cloture || '',
      type_compte: compte.type_compte || 'titres',
      type_compte_detail: compte.type_compte_detail || '',
      titulaire: compte.titulaire || 'titulaire',
      titulaire_nom: compte.titulaire_nom || '',
      co_titulaire_nom: compte.co_titulaire_nom || '',
      detention_mode: compte.detention_mode || 'directe',
      actif_numerique: Boolean(compte.actif_numerique),
      plateforme_actifs_numeriques: compte.plateforme_actifs_numeriques || '',
      wallet_adresse: compte.wallet_adresse || '',
      commentaire: compte.commentaire || '',
    })
    setEditingCompteId(compte.id)
  }

  async function saveCompte() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...compteForm,
        actif_numerique: compteForm.actif_numerique ? 1 : 0,
      }
      const result = editingCompteId
        ? await api.put(`/comptes-etrangers/${editingCompteId}`, payload)
        : await api.post('/comptes-etrangers', payload)

      if (Array.isArray(result?.alerts) && result.alerts.length) {
        setError(result.alerts.map((a) => a.message).join(' '))
      }

      resetCompteForm()
      await loadComptes()
      await loadDeclaration(declarationYear)
      showToast(editingCompteId ? 'Compte étranger mis à jour.' : 'Compte étranger ajouté.')
    } catch (e) {
      setError(e?.message || 'Impossible d’enregistrer ce compte étranger.')
    } finally {
      setSaving(false)
    }
  }

  function applyCourtierSuggestion(courtier) {
    setCompteForm((c) => ({
      ...c,
      etablissement: courtier.etablissement,
      pays: c.pays || courtier.pays,
      adresse: c.adresse || courtier.adresse,
      type_compte: courtier.type_compte || c.type_compte,
    }))
    setShowCourtierSuggestions(false)
  }

  async function deleteCompte(compte) {
    setSaving(true)
    setError('')
    try {
      await api.del(`/comptes-etrangers/${compte.id}`)
      await loadComptes()
      await loadDeclaration(declarationYear)
      showToast('Compte étranger supprimé.')
    } catch (e) {
      setError(e?.message || 'Impossible de supprimer ce compte.')
    } finally {
      setSaving(false)
    }
  }

  function askDeleteCompte(compte) {
    setConfirmCompte(compte)
  }

  function closeConfirmCompte() {
    if (saving) return
    setConfirmCompte(null)
  }

  async function confirmDeleteCompte() {
    if (!confirmCompte) return
    await deleteCompte(confirmCompte)
    setConfirmCompte(null)
  }

  async function copyDeclarationSummary() {
    const scoreLabel = SCORE_LABELS[declaration.score_confiance] || declaration.score_confiance || '-'
    const lines = [
      `Tomino - Préparation 3916 (${declaration.annee})`,
      'Outil d’aide, pas un conseil fiscal.',
      '',
      `Score de confiance : ${scoreLabel}`,
      `Nombre de comptes à déclarer : ${declaration.stats.total}`,
      `Ouverts pendant l'année : ${declaration.stats.ouverts_dans_annee}`,
      `Clôturés pendant l'année : ${declaration.stats.clos_dans_annee}`,
      `Actifs sur l'année : ${declaration.stats.actifs_sur_annee}`,
      `Ouverts + clôturés dans l'année : ${declaration.stats.ouverts_et_clos_dans_annee || 0}`,
      `Comptes actifs numériques (3916-bis) : ${declaration.stats.comptes_3916_bis || 0}`,
      '',
      '=== COMPTES À DÉCLARER ===',
      ...declaration.comptes.map((c, idx) => (
        `${idx + 1}. ${c.etablissement} | ${c.pays || '-'} | ${typeCompteLabel(c.type_compte)} | ${titulaireLabel(c.titulaire)} | Motif: ${c.motif_declaration_label || MOTIF_LABELS[c.motif_declaration] || '-'} | Ouv.: ${formatDateFr(c.date_ouverture)} | Clos.: ${formatDateFr(c.date_cloture)} | N°: ${c.numero_compte || c.wallet_adresse || '-'} | 3916-bis: ${c.est_3916_bis ? 'Oui' : 'Non'}`
      )),
      '',
      '=== VIGILANCES ===',
      ...(declaration.vigilances?.length
        ? declaration.vigilances.map((v, i) => `${i + 1}. ${v.message} -> ${v.action}`)
        : ['Aucune vigilance bloquante détectée.']),
      '',
      '=== CHECKLIST AVANT DÉCLARATION ===',
      ...(declaration.checklist?.length
        ? declaration.checklist.map((item) => `- [${item.done ? 'x' : ' '}] ${item.label}`)
        : []),
    ]

    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast('Résumé fiscal copié dans le presse-papiers.')
    } catch {
      setError('Copie impossible. Votre navigateur bloque peut-être le presse-papiers.')
    }
  }

  async function copyFiscalSummary() {
    if (!fiscal) return
    const fmt = (n, sign = false) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...(sign ? { signDisplay: 'always' } : {}) })
    const ifuDiv = fiscal?.reconciliation_ifu?.dividendes || {}
    const ifuCes = fiscal?.reconciliation_ifu?.cessions || {}
    const missingDiv = fiscal?.manquants?.dividendes || {}
    const missingCes = fiscal?.manquants?.cessions || {}
    const lines = [
      `Tomino — Récapitulatif fiscal ${fiscal.annee}`,
      'Outil d’aide, pas un conseil fiscal.',
      '',
      `Confiance globale : ${SCORE_LABELS[fiscal?.scores_confiance?.global] || '-'}`,
      '=== DIVIDENDES ===',
      `Brut : ${fmt(fiscal.dividendes.total_brut)} € | Retenue source : ${fmt(fiscal.dividendes.total_retenue_source)} € | Net perçu : ${fmt(fiscal.dividendes.total_net)} €`,
      `Versements : ${fiscal.dividendes.nb}`,
      ...Object.entries(fiscal.dividendes.par_enveloppe || {}).map(([e, d]) => `  ${e} : brut ${fmt(d.brut)} € | retenue ${fmt(d.retenue)} € | net ${fmt(d.net)} € (${d.nb} versements)`),
      '',
      '=== PLUS-VALUES / MOINS-VALUES ===',
      `PV brutes : ${fmt(fiscal.cessions.total_pv)} €`,
      `MV réalisées : ${fmt(fiscal.cessions.total_mv)} €`,
      `Solde net : ${fmt(fiscal.cessions.solde, true)} €  (${fiscal.cessions.nb_cessions} cessions)`,
      ...Object.entries(fiscal.cessions.par_enveloppe || {}).map(([e, d]) => `  ${e} : solde ${fmt(d.solde, true)} € (PV ${fmt(d.pv)} € / MV ${fmt(d.mv)} €)`),
      '',
      '=== RAPPROCHEMENT IFU (THÉORIQUE) ===',
      `Dividendes: brut ${fmt(ifuDiv.montant_brut_theorique)} € | retenue ${fmt(ifuDiv.retenue_source_theorique)} € | net ${fmt(ifuDiv.montant_net_theorique)} € | lignes ${ifuDiv.lignes ?? 0}`,
      `Cessions: PV ${fmt(ifuCes.pv_theorique)} € | MV ${fmt(ifuCes.mv_theorique)} € | solde ${fmt(ifuCes.solde_theorique, true)} € | lignes ${ifuCes.lignes ?? 0}`,
      `Manquants dividendes: sans détail ${missingDiv.sans_detail ?? 0}, sans pays ${missingDiv.sans_pays ?? 0}, sans enveloppe ${missingDiv.sans_enveloppe ?? 0}`,
      `Manquants cessions: sans PV ${missingCes.sans_pv ?? 0}, sans date ${missingCes.sans_date ?? 0}, sans enveloppe ${missingCes.sans_enveloppe ?? 0}`,
      '',
      '=== ÉCARTS ET VIGILANCE ===',
      ...(Array.isArray(fiscal.vigilances) && fiscal.vigilances.length
        ? fiscal.vigilances.map((v, idx) => `${idx + 1}. ${v.message} -> ${v.action}`)
        : ['Aucun écart bloquant détecté.']),
      '',
      '=== HYPOTHÈSES DE CALCUL ===',
      ...(Array.isArray(fiscal.hypotheses) ? fiscal.hypotheses.map((h) => `- ${h}`) : []),
      '',
      'Comparez systématiquement avec votre IFU.',
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      showToast('Résumé fiscal copié dans le presse-papiers.')
    } catch {
      setError('Copie impossible.')
    }
  }

  function extractFilename(contentDisposition, fallbackName) {
    const raw = String(contentDisposition || '')
    const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i)
    if (utf8Match?.[1]) {
      try {
        return decodeURIComponent(utf8Match[1])
      } catch {
        return utf8Match[1]
      }
    }
    const basicMatch = raw.match(/filename="?([^";]+)"?/i)
    return basicMatch?.[1] || fallbackName
  }

  async function downloadBlobResponse(response, fallbackName) {
    const blob = await response.blob()
    const filename = extractFilename(response.headers.get('Content-Disposition'), fallbackName)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  async function parseApiErrorResponse(response, fallback) {
    const text = await response.text().catch(() => '')
    try {
      const parsed = JSON.parse(String(text || ''))
      const err = String(parsed?.erreur || '').trim()
      const action = String(parsed?.action || '').trim()
      if (err && action) return `${err} ${action}`
      if (err) return err
    } catch {
      // fallback plain text
    }
    const plain = String(text || '').trim()
    return plain || fallback
  }

  async function syncFetch(pathname, options = {}) {
    const token = String(syncAuthToken || '').trim()
    if (!token) throw new Error('Connexion requise pour la synchronisation cloud.')

    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    }

    const response = await fetch(pathname, { ...options, headers })
    if (!response.ok) {
      if (response.status === 401) {
        setSyncAuthToken('')
        setSyncAuthUser(null)
        localStorage.removeItem(SYNC_AUTH_TOKEN_KEY)
      }
      throw new Error(await parseApiErrorResponse(response, 'Erreur de synchronisation cloud'))
    }
    return response.json().catch(() => ({}))
  }

  function rememberSyncSession(token, deviceId) {
    const safeToken = String(token || '').trim()
    if (!safeToken) return
    setSyncAuthToken(safeToken)
    localStorage.setItem(SYNC_AUTH_TOKEN_KEY, safeToken)

    const safeDeviceId = String(deviceId || '').trim()
    if (safeDeviceId) {
      setSyncDeviceId(safeDeviceId)
      localStorage.setItem(SYNC_DEVICE_ID_KEY, safeDeviceId)
    }
  }

  async function loadSyncState() {
    if (!String(syncAuthToken || '').trim()) {
      setSyncAuthUser(null)
      setSyncSubscription(null)
      setSyncDevices([])
      setSyncCurrentDeviceId('')
      return
    }

    setSyncLoading(true)
    try {
      const me = await syncFetch('/api/auth/me')
      const billingData = await syncFetch('/api/billing/subscription')
      setSyncAuthUser(me?.user || null)
      setSyncSubscription(billingData?.subscription || null)

      if (!billingData?.subscription?.tomino_plus) {
        setSyncDevices([])
        setSyncCurrentDeviceId(String(me?.session?.device_id || ''))
        return
      }

      const devicesData = await syncFetch('/api/devices')
      setSyncDevices(Array.isArray(devicesData?.devices) ? devicesData.devices : [])
      setSyncCurrentDeviceId(String(devicesData?.current_device_id || me?.session?.device_id || ''))
    } catch (e) {
      setError(e?.message || 'Impossible de charger l’état de synchronisation cloud.')
    } finally {
      setSyncLoading(false)
    }
  }

  async function openSyncEntry() {
    if (syncEntryLoading) return
    const token = String(syncAuthToken || '').trim()
    if (!token) {
      navigate('/settings/pricing')
      return
    }

    setSyncEntryLoading(true)
    try {
      const response = await fetch('/api/billing/subscription', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        setSyncAuthToken('')
        setSyncAuthUser(null)
        localStorage.removeItem(SYNC_AUTH_TOKEN_KEY)
        navigate('/settings/pricing')
        return
      }

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        navigate('/settings/pricing')
        return
      }

      const isPlus = Boolean(payload?.subscription?.tomino_plus)
      navigate(isPlus ? '/settings/sync' : '/settings/pricing')
    } catch {
      navigate('/settings/pricing')
    } finally {
      setSyncEntryLoading(false)
    }
  }

  async function submitSyncAuth() {
    setSyncAuthSaving(true)
    try {
      const selectedRegisterTier = syncAuthMode === 'register' ? String(syncAuthTier || 'free').toLowerCase() : 'free'
      const endpoint = syncAuthMode === 'register' ? '/api/auth/register' : '/api/auth/login'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(syncAuthEmail || '').trim(),
          password: String(syncAuthPassword || ''),
          tier: syncAuthMode === 'register' ? syncAuthTier : undefined,
          device_id: syncDeviceId,
          device_label: String(syncAuthDeviceLabel || '').trim() || 'Mon appareil',
        }),
      })

      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Authentification impossible'))
      }
      const payload = await response.json().catch(() => ({}))
      const freshToken = String(payload?.token || '').trim()
      rememberSyncSession(freshToken, payload?.device?.device_id || syncDeviceId)

      if (syncAuthMode === 'register' && selectedRegisterTier === 'tomino_plus') {
        const checkoutResponse = await fetch('/api/billing/checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshToken}`,
          },
          body: JSON.stringify({
            tier: 'tomino_plus',
            success_url: `${window.location.origin}/settings/sync?billing=success`,
            cancel_url: `${window.location.origin}/settings/sync?billing=cancel`,
          }),
        })

        if (!checkoutResponse.ok) {
          throw new Error(await parseApiErrorResponse(checkoutResponse, 'Session de paiement Stripe invalide.'))
        }

        const checkoutPayload = await checkoutResponse.json().catch(() => ({}))
        const checkoutUrl = String(checkoutPayload?.url || '').trim()
        if (!checkoutUrl) {
          throw new Error('Session de paiement Stripe invalide.')
        }

        setSyncAuthModalOpen(false)
        setSyncAuthEmail('')
        setSyncAuthPassword('')
        window.location.href = checkoutUrl
        return
      }

      setSyncAuthUser(payload?.user || null)
      setSyncSubscription(null)
      setSyncAuthEmail('')
      setSyncAuthPassword('')
      setSyncAuthModalOpen(false)
      showToast(syncAuthMode === 'register' ? 'Compte cloud créé.' : 'Connexion cloud réussie.')
      await loadSyncState()
    } catch (e) {
      setError(e?.message || 'Échec de la connexion cloud.')
    } finally {
      setSyncAuthSaving(false)
    }
  }

  async function syncLogout() {
    setSyncActionSaving(true)
    try {
      try {
        await syncFetch('/api/auth/logout', { method: 'POST' })
      } catch {
        // Ignore server logout error and clear local session anyway.
      }
      setSyncAuthToken('')
      setSyncAuthUser(null)
      setSyncSubscription(null)
      setSyncDevices([])
      setSyncCurrentDeviceId('')
      localStorage.removeItem(SYNC_AUTH_TOKEN_KEY)
      showToast('Session cloud fermée.')
    } finally {
      setSyncActionSaving(false)
    }
  }

  async function pauseResumeSync(paused) {
    setSyncActionSaving(true)
    setError('')
    try {
      const endpoint = paused ? '/api/sync/pause' : '/api/sync/resume'
      await syncFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: syncCurrentDeviceId || syncDeviceId }),
      })
      showToast(paused ? 'Synchronisation mise en pause.' : 'Synchronisation reprise.')
      await loadSyncState()
    } catch (e) {
      setError(e?.message || 'Action de synchronisation impossible.')
    } finally {
      setSyncActionSaving(false)
    }
  }

  async function revokeDevice(deviceId) {
    setSyncActionSaving(true)
    setError('')
    try {
      await syncFetch('/api/devices/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      })
      showToast('Appareil révoqué.')
      await loadSyncState()
    } catch (e) {
      setError(e?.message || 'Révocation impossible.')
    } finally {
      setSyncActionSaving(false)
    }
  }

  async function changeSyncPlan(nextTier) {
    setSyncActionSaving(true)
    setError('')
    try {
      const token = String(syncAuthToken || '').trim()
      if (!token) throw new Error('Connexion requise pour modifier le forfait.')

      const response = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tier: nextTier }),
      })

      if (response.status === 402) {
        const paymentPayload = await response.json().catch(() => ({}))
        if (paymentPayload?.payment_required) {
          const checkout = await syncFetch('/api/billing/checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tier: nextTier,
              success_url: `${window.location.origin}/settings/sync?billing=success`,
              cancel_url: `${window.location.origin}/settings/sync?billing=cancel`,
            }),
          })
          const checkoutUrl = String(checkout?.url || '').trim()
          if (!checkoutUrl) {
            throw new Error('Session de paiement Stripe invalide.')
          }
          window.location.href = checkoutUrl
          return
        }
      }

      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Impossible de modifier le forfait.'))
      }

      const result = await response.json().catch(() => ({}))
      setSyncSubscription(result?.subscription || null)
      setSyncAuthUser((u) => (u ? { ...u, tier: result?.subscription?.tier || u.tier, tier_label: result?.subscription?.label || u.tier_label, tomino_plus: Boolean(result?.subscription?.tomino_plus) } : u))
      showToast(`Forfait mis à jour: ${result?.subscription?.label || nextTier}`)
      await loadSyncState()
    } catch (e) {
      setError(e?.message || 'Impossible de modifier le forfait.')
    } finally {
      setSyncActionSaving(false)
    }
  }

  async function openBillingPortal() {
    setSyncActionSaving(true)
    setError('')
    try {
      const payload = await syncFetch('/api/billing/portal-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: `${window.location.origin}/settings/sync` }),
      })
      const portalUrl = String(payload?.url || '').trim()
      if (!portalUrl) throw new Error('URL du portail abonnement indisponible.')
      window.location.href = portalUrl
    } catch (e) {
      setError(e?.message || 'Impossible d’ouvrir le portail abonnement.')
    } finally {
      setSyncActionSaving(false)
    }
  }

  async function downloadPatrimoinePdf() {
    setExportingPdf(true)
    setError('')
    try {
      const params = new URLSearchParams({ include_ia: includeIaInPdf ? '1' : '0' })
      const response = await fetch(`/api/export/pdf/patrimoine?${params.toString()}`)
      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Export PDF impossible'))
      }

      await downloadBlobResponse(response, `tomino-patrimoine-${new Date().toISOString().slice(0, 10)}.pdf`)
      showToast('Export PDF téléchargé.')
    } catch (e) {
      setError(e?.message || 'Impossible de télécharger le PDF patrimonial.')
    } finally {
      setExportingPdf(false)
    }
  }

  async function downloadMouvementsCsv() {
    setExportingCsvMouvements(true)
    setError('')
    try {
      const response = await fetch('/api/export/csv/mouvements')
      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Export CSV mouvements impossible'))
      }
      await downloadBlobResponse(response, `tomino-mouvements-${new Date().toISOString().slice(0, 10)}.csv`)
      showToast('Export CSV mouvements téléchargé.')
    } catch (e) {
      setError(e?.message || 'Impossible de télécharger le CSV des mouvements.')
    } finally {
      setExportingCsvMouvements(false)
    }
  }

  async function downloadDividendesCsv() {
    setExportingCsvDividendes(true)
    setError('')
    try {
      const response = await fetch('/api/export/csv/dividendes')
      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Export CSV dividendes impossible'))
      }
      await downloadBlobResponse(response, `tomino-dividendes-${new Date().toISOString().slice(0, 10)}.csv`)
      showToast('Export CSV dividendes téléchargé.')
    } catch (e) {
      setError(e?.message || 'Impossible de télécharger le CSV des dividendes.')
    } finally {
      setExportingCsvDividendes(false)
    }
  }

  async function downloadFiscalCsv() {
    setExportingCsvFiscal(true)
    setError('')
    try {
      const params = new URLSearchParams({ annee: String(exportFiscalYear || '') })
      const response = await fetch(`/api/export/csv/fiscal?${params.toString()}`)
      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Export CSV fiscal impossible'))
      }
      await downloadBlobResponse(response, `tomino-fiscal-${exportFiscalYear || new Date().getFullYear() - 1}.csv`)
      showToast('Export CSV fiscal téléchargé.')
    } catch (e) {
      setError(e?.message || 'Impossible de télécharger le CSV fiscal.')
    } finally {
      setExportingCsvFiscal(false)
    }
  }

  async function downloadDatabaseBackup() {
    setExportingBackup(true)
    setError('')
    try {
      const pwd = String(backupPassword || '')
      if (pwd && pwd.length < 8) {
        throw new Error('Mot de passe trop court (8 caractères minimum).')
      }
      if (pwd && pwd !== String(backupPasswordConfirm || '')) {
        throw new Error('La confirmation du mot de passe ne correspond pas.')
      }

      const response = await fetch('/api/export/backup', {
        method: pwd ? 'POST' : 'GET',
        headers: pwd ? { 'Content-Type': 'application/json' } : undefined,
        body: pwd ? JSON.stringify({ password: pwd }) : undefined,
      })
      if (!response.ok) {
        throw new Error(await parseApiErrorResponse(response, 'Export de sauvegarde impossible'))
      }
      await downloadBlobResponse(response, `tomino-backup-${new Date().toISOString().slice(0, 10)}.tomino-backup`)
      showToast(pwd ? 'Sauvegarde chiffrée exportée.' : 'Sauvegarde locale exportée.')
      if (isExportBackupPage) await loadAutoBackupStatus()
    } catch (e) {
      setError(e?.message || 'Impossible de télécharger la sauvegarde locale.')
    } finally {
      setExportingBackup(false)
    }
  }

  function formatIsoDateTime(value) {
    const d = new Date(String(value || ''))
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  async function loadAutoBackupStatus() {
    setLoadingAutoBackupStatus(true)
    try {
      const data = await api.get('/backup/auto/status')
      setAutoBackupStatus(data && data.ok !== false ? data : null)
    } catch {
      setAutoBackupStatus(null)
    } finally {
      setLoadingAutoBackupStatus(false)
    }
  }

  async function openAutoBackupFolder() {
    setOpeningAutoBackupFolder(true)
    setError('')
    try {
      const response = await fetch('/api/backup/auto/open-folder', { method: 'POST' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.erreur || "Impossible d'ouvrir le dossier des sauvegardes.")
      }
      showToast('Dossier des sauvegardes ouvert.')
    } catch (e) {
      setError(e?.message || "Impossible d'ouvrir le dossier des sauvegardes.")
    } finally {
      setOpeningAutoBackupFolder(false)
    }
  }

  async function importDatabaseBackup(file) {
    if (!file) return
    setImportingBackup(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('backup', file)
      if (restorePassword) formData.append('password', restorePassword)
      formData.append('confirm_restore', '1')

      const response = await fetch('/api/import/backup', {
        method: 'POST',
        body: formData,
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.erreur || 'Import de sauvegarde impossible')
      }

      showToast('Sauvegarde importée avec succès. Rechargement en cours...')
      window.setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setError(e?.message || 'Impossible d\'importer cette sauvegarde.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setSelectedBackupName('')
      setSelectedBackupFile(null)
      setBackupVerification(null)
      setConfirmRestoreChecked(false)
      setImportingBackup(false)
    }
  }

  async function verifyBackupImport(file) {
    if (!file) return
    setVerifyingBackup(true)
    setError('')
    setBackupVerification(null)
    setConfirmRestoreChecked(false)
    try {
      const formData = new FormData()
      formData.append('backup', file)
      if (restorePassword) formData.append('password', restorePassword)

      const response = await fetch('/api/import/backup/verify', {
        method: 'POST',
        body: formData,
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.erreur || 'Vérification de la sauvegarde impossible')
      }

      setBackupVerification(payload)
      showToast('Sauvegarde vérifiée. Confirmez pour restaurer.')
    } catch (e) {
      setError(e?.message || 'Impossible de vérifier cette sauvegarde.')
    } finally {
      setVerifyingBackup(false)
    }
  }

  async function restoreVerifiedBackup() {
    if (!selectedBackupFile || !backupVerification || !confirmRestoreChecked) {
      return
    }
    await importDatabaseBackup(selectedBackupFile)
  }

  function toggleBackupPasswordFields() {
    setShowBackupPasswordFields((prev) => {
      const next = !prev
      if (!next) {
        setBackupPassword('')
        setBackupPasswordConfirm('')
      }
      return next
    })
  }

  function openBackupFilePicker() {
    if (importingBackup || exportingBackup) return
    fileInputRef.current?.click()
  }

  function renderRoot() {
    return (
      <>
        <section className="hero-strip fade-up">
          <div className="hero-copy">
            <div className="hero-kicker">Configuration</div>
            <h1 className="hero-title" style={{ maxWidth: 'none' }}>Paramètres.</h1>
            <p className="hero-subtitle">Préférences de l'application Tomino.</p>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
          <div
            className="settings-group fade-up"
            style={{
              background: 'linear-gradient(180deg, rgba(16, 92, 62, 0.96), rgba(9, 68, 46, 0.96))',
              border: '1px solid rgba(24,195,126,.55)',
              boxShadow: '0 18px 44px rgba(8, 44, 30, .45)',
            }}
          >
            <div className="settings-group-label" style={{ background: 'rgba(0,0,0,.15)', color: 'rgba(216,255,238,.9)' }}>Recommandé</div>
            <div
              className="settings-row"
              style={{ width: '100%', opacity: 0.55, cursor: 'not-allowed' }}
            >
              <div className="settings-row-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="settings-row-title" style={{ color: '#eafff5' }}>Synchronisation cloud</span>
                  <span style={{ fontSize: '.65rem', fontFamily: 'var(--mono)', background: 'rgba(255,255,255,0.1)', color: 'rgba(228,255,244,.7)', borderRadius: 6, padding: '2px 7px', letterSpacing: '.04em' }}>Prochainement</span>
                </div>
                <div className="settings-row-sub" style={{ color: 'rgba(228,255,244,.6)' }}>
                  La synchronisation multi-appareils est en cours de développement.
                </div>
              </div>
              <span style={{ color: 'rgba(233,255,246,.4)', fontSize: '1.1rem' }}>›</span>
            </div>
          </div>

          <div className="settings-group fade-up">
            <div className="settings-group-label">Profil & IA</div>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/profil')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Profil investisseur</div>
                <div className="settings-row-sub">Horizon, risque, objectif, stratégie et exclusions ISR.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/ia')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Personnalisation IA</div>
                <div className="settings-row-sub">Niveau d'analyse et benchmark de référence.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
          </div>

          <div className="settings-group fade-up">
            <div className="settings-group-label">Fiscalité</div>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/comptes-etrangers')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Déclaration comptes étrangers</div>
                <div className="settings-row-sub">Aide au formulaire 3916 : comptes hors France.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/fiscal')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Récapitulatif fiscal</div>
                <div className="settings-row-sub">Plus-values et dividendes par année — aide à la déclaration de revenus.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
          </div>

          <div className="settings-group fade-up">
            <div className="settings-group-label">Données</div>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/export')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Export & import de données</div>
                <div className="settings-row-sub">PDF patrimonial, exports CSV et sauvegarde complète (.tomino-backup) avec restauration.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
          </div>

          <div className="settings-group fade-up">
            <div className="settings-group-label">Confidentialité</div>
            <button type="button" className="settings-row" onClick={() => navigate('/settings/confidentialite')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent' }}>
              <div className="settings-row-info">
                <div className="settings-row-title">Confidentialité & sécurité</div>
                <div className="settings-row-sub">Ce que Tomino stocke, ce qu'il envoie et comment vos données sont protégées.</div>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: '1.1rem' }}>›</span>
            </button>
          </div>
        </div>
      </>
    )
  }

  function renderProfilePage() {
    return (
      <>
        <BackHeader
          title="Profil investisseur"
          subtitle="Ajustez votre horizon, votre tolérance au risque et vos exclusions ISR."
          onBack={() => navigate('/settings')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Profil investisseur</div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Horizon d'investissement</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {HORIZONS.map((item) => (
                <ChoiceButton key={item.value} active={form.horizon === item.value} onClick={() => setField('horizon', item.value)}>{item.label}</ChoiceButton>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Tolérance au risque</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {RISQUES.map((item) => (
                <ChoiceButton key={item.value} active={form.risque === item.value} onClick={() => setField('risque', item.value)}>{item.label}</ChoiceButton>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Objectif principal</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {OBJECTIFS.map((item) => (
                <ChoiceButton key={item.value} active={form.objectif === item.value} onClick={() => setField('objectif', item.value)}>{item.label}</ChoiceButton>
              ))}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Stratégie d'investissement</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {STRATEGIES.map((item) => (
                <ChoiceButton key={item.value} active={form.strategie === item.value} onClick={() => setField('strategie', item.value)}>{item.label}</ChoiceButton>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Exclusions ISR</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {EXCLUSIONS.map((item) => (
                <ChoiceButton key={item.value} active={form.secteurs_exclus.includes(item.value)} onClick={() => toggleExclusion(item.value)}>
                  {form.secteurs_exclus.includes(item.value) ? '☑ ' : '☐ '}
                  {item.label}
                </ChoiceButton>
              ))}
            </div>
          </div>
        </section>
      </>
    )
  }

  function renderIaPage() {
    const isFree = form.tier === 'free'

    return (
      <>
        <BackHeader
          title="Personnalisation IA"
          subtitle="Choisissez le niveau d'analyse et le benchmark de référence utilisé par Tomino Intelligence."
          onBack={() => navigate('/settings')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Préférences IA</div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Benchmark de référence</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {BENCHMARKS.map((item) => (
                <ChoiceButton key={item.value} active={form.benchmark === item.value} onClick={() => setField('benchmark', item.value)}>{item.label}</ChoiceButton>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 4 }}>Niveau d'analyse</label>
            <p style={{ fontSize: '.78rem', color: 'var(--text-3)', marginBottom: 10, fontFamily: 'var(--mono)' }}>
              Détermine la profondeur des analyses Grok et la consommation de crédits.
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {TIERS.map((item) => {
                const tierOrder = { free: 0, tomino_plus: 1 }
                const locked = tierOrder[item.value] > tierOrder[form.tier]
                const active = form.tier === item.value
                return (
                  <button
                    key={item.value}
                    type="button"
                    disabled={locked}
                    onClick={() => !locked && setField('tier', item.value)}
                    style={{
                      border: active
                        ? '1px solid rgba(201,168,76,.6)'
                        : locked
                        ? '1px solid var(--line)'
                        : '1px solid var(--line)',
                      background: active
                        ? 'rgba(201,168,76,.10)'
                        : locked
                        ? 'rgba(255,255,255,.01)'
                        : 'rgba(255,255,255,.02)',
                      color: locked ? 'var(--text-3)' : active ? 'var(--text)' : 'var(--text-2)',
                      borderRadius: 12,
                      padding: '11px 13px',
                      textAlign: 'left',
                      cursor: locked ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      transition: 'all .14s ease',
                      opacity: locked ? 0.5 : 1,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{item.label}</div>
                      <div style={{ fontSize: '.76rem', fontFamily: 'var(--mono)', color: locked ? 'var(--text-3)' : 'var(--text-2)', marginTop: 2 }}>{item.sub}</div>
                    </div>
                    {locked && <PlusBadge />}
                  </button>
                )
              })}
            </div>
            {isFree && (
              <p style={{ marginTop: 8, fontSize: '.76rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                Le niveau Approfondi sera disponible avec un abonnement Tomino +.
              </p>
            )}
          </div>

          <div className="form-group" style={{ marginTop: 18 }}>
            <label className="form-label">Modèle utilisé</label>
            <p style={{ fontSize: '.78rem', color: 'var(--text-3)', marginBottom: 8, fontFamily: 'var(--mono)' }}>
              Modèle d'IA utilisé pour les analyses et le chat. Configurable dans une future version.
            </p>
            <div style={{
              padding: '10px 13px',
              borderRadius: 10,
              border: '1px solid var(--line)',
              background: 'rgba(255,255,255,.02)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}>
              <span style={{ fontSize: '.88rem', fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
                grok-4-1-fast-reasoning
              </span>
              <span style={{ fontSize: '.72rem', fontFamily: 'var(--mono)', color: 'var(--text-3)' }}>
                xAI
              </span>
            </div>
          </div>
        </section>

      </>
    )
  }

  function renderComptesPage() {
    const isCryptoLike = compteForm.type_compte === 'crypto' || Boolean(compteForm.actif_numerique)
    const scoreConfiance = SCORE_LABELS[declaration.score_confiance] || '-'
    return (
      <>
        <BackHeader
          title="Déclaration comptes étrangers"
          subtitle="Centralisez et contrôlez vos comptes hors France pour préparer les formulaires 3916 et 3916-bis."
          onBack={() => navigate('/settings')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 8 }}>{editingCompteId ? 'Modifier un compte étranger' : 'Nouveau compte étranger'}</div>
          <p style={{ fontSize: '.78rem', color: 'var(--text-3)', fontFamily: 'var(--mono)', marginBottom: 14 }}>
            Champs utiles pour la déclaration: établissement, pays, identifiant du compte, dates d'ouverture/clôture, qualité du titulaire et cas 3916-bis.
          </p>

          <div className="form-row">
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">Établissement *</label>
              <input
                className="form-input"
                value={compteForm.etablissement}
                onChange={(e) => {
                  const v = e.target.value
                  setCompteForm((c) => ({ ...c, etablissement: v }))
                  setShowCourtierSuggestions(v.trim().length >= 2)
                }}
                onFocus={() => setShowCourtierSuggestions(compteForm.etablissement.trim().length >= 2)}
                onBlur={() => setTimeout(() => setShowCourtierSuggestions(false), 140)}
                placeholder="Commencez à taper (ex : DEGIRO, Interactive Brokers...)"
                autoComplete="off"
              />

              {showCourtierSuggestions && courtierSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#1a1d22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden', zIndex: 30, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  {courtierSuggestions.map((c) => (
                    <button
                      key={c.etablissement}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        applyCourtierSuggestion(c)
                      }}
                      style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', textAlign: 'left', border: 0, color: 'var(--text)', background: 'transparent', cursor: 'pointer' }}
                    >
                      <span style={{ fontSize: '.86rem' }}>{c.etablissement}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '.68rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{c.pays}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Pays *</label>
              <input className="form-input" value={compteForm.pays} onChange={(e) => setCompteForm((c) => ({ ...c, pays: e.target.value }))} placeholder="ex : Irlande" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Adresse de l’établissement</label>
              <input className="form-input" value={compteForm.adresse} onChange={(e) => setCompteForm((c) => ({ ...c, adresse: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Numéro / identifiant de compte</label>
              <input className="form-input" value={compteForm.numero_compte} onChange={(e) => setCompteForm((c) => ({ ...c, numero_compte: e.target.value }))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Ville de l’établissement</label>
              <input className="form-input" value={compteForm.etablissement_ville} onChange={(e) => setCompteForm((c) => ({ ...c, etablissement_ville: e.target.value }))} placeholder="ex : Dublin" />
            </div>
            <div className="form-group">
              <label className="form-label">Code postal / code local</label>
              <input className="form-input" value={compteForm.etablissement_code_postal} onChange={(e) => setCompteForm((c) => ({ ...c, etablissement_code_postal: e.target.value }))} placeholder="ex : D02 T380" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Identifiant établissement (BIC/SWIFT, registre...)</label>
              <input className="form-input" value={compteForm.etablissement_identifiant} onChange={(e) => setCompteForm((c) => ({ ...c, etablissement_identifiant: e.target.value }))} placeholder="ex : TRWIXXX" />
            </div>
            <div className="form-group">
              <label className="form-label">Type détaillé (optionnel)</label>
              <input className="form-input" value={compteForm.type_compte_detail} onChange={(e) => setCompteForm((c) => ({ ...c, type_compte_detail: e.target.value }))} placeholder="ex : Compte-titres individuel" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date d’ouverture</label>
              <DateInput value={compteForm.date_ouverture} onChange={(v) => setCompteForm((c) => ({ ...c, date_ouverture: v }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Date de clôture (si applicable)</label>
              <DateInput value={compteForm.date_cloture} onChange={(v) => setCompteForm((c) => ({ ...c, date_cloture: v }))} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type de compte</label>
              <CustomSelect
                value={compteForm.type_compte}
                onChange={(next) => setCompteForm((c) => ({ ...c, type_compte: next }))}
                options={TYPE_COMPTE_OPTIONS}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Mode de détention</label>
              <CustomSelect
                value={compteForm.detention_mode}
                onChange={(next) => setCompteForm((c) => ({ ...c, detention_mode: next }))}
                options={DETENTION_OPTIONS}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Qualité du déclarant</label>
              <CustomSelect
                value={compteForm.titulaire}
                onChange={(next) => setCompteForm((c) => ({ ...c, titulaire: next }))}
                options={TITULAIRE_OPTIONS}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nom du titulaire principal</label>
              <input className="form-input" value={compteForm.titulaire_nom} onChange={(e) => setCompteForm((c) => ({ ...c, titulaire_nom: e.target.value }))} placeholder="ex : Jean Dupont" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nom du co-titulaire (si applicable)</label>
              <input className="form-input" value={compteForm.co_titulaire_nom} onChange={(e) => setCompteForm((c) => ({ ...c, co_titulaire_nom: e.target.value }))} placeholder="Optionnel" />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'end' }}>
              <button
                type="button"
                className={`btn ${compteForm.actif_numerique ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setCompteForm((c) => ({ ...c, actif_numerique: !c.actif_numerique }))}
              >
                {compteForm.actif_numerique ? '✓ Compte d’actifs numériques (3916-bis)' : 'Compte d’actifs numériques (3916-bis)'}
              </button>
            </div>
          </div>

          {isCryptoLike && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Plateforme d’actifs numériques</label>
                <input className="form-input" value={compteForm.plateforme_actifs_numeriques} onChange={(e) => setCompteForm((c) => ({ ...c, plateforme_actifs_numeriques: e.target.value }))} placeholder="ex : Binance, Kraken" />
              </div>
              <div className="form-group">
                <label className="form-label">Adresse wallet / identifiant technique</label>
                <input className="form-input" value={compteForm.wallet_adresse} onChange={(e) => setCompteForm((c) => ({ ...c, wallet_adresse: e.target.value }))} placeholder="ex : 0x..." />
              </div>
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Commentaire</label>
            <textarea className="form-input" rows={3} value={compteForm.commentaire} onChange={(e) => setCompteForm((c) => ({ ...c, commentaire: e.target.value }))} placeholder="Infos utiles pour votre saisie 3916" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {editingCompteId && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={resetCompteForm}
                disabled={saving}
              >
                Annuler l’édition
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !compteForm.etablissement.trim() || !compteForm.pays.trim()}
              onClick={saveCompte}
            >
              {saving ? 'Enregistrement...' : (editingCompteId ? 'Mettre à jour le compte' : 'Ajouter le compte')}
            </button>
          </div>
        </section>

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Récapitulatif 3916</div>

          {!comptes.length ? (
            <p className="text-text2">Aucun compte étranger enregistré.</p>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Établissement</th>
                    <th>Pays</th>
                    <th>Numéro</th>
                    <th>Ouverture</th>
                    <th>Clôture</th>
                    <th>Type</th>
                    <th>Qualité</th>
                    <th>3916-bis</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {comptes.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <div className="td-name">{c.etablissement}</div>
                        {c.adresse ? <div className="td-mono dim" style={{ fontSize: '.68rem' }}>{c.adresse}</div> : null}
                      </td>
                      <td>{c.pays || '-'}</td>
                      <td className="td-mono">{c.numero_compte || '-'}</td>
                      <td className="td-mono dim" style={{ fontSize: '.72rem' }}>{c.date_ouverture || '-'}</td>
                      <td className="td-mono dim" style={{ fontSize: '.72rem' }}>{c.date_cloture || '-'}</td>
                      <td>{typeCompteLabel(c.type_compte)}</td>
                      <td>{titulaireLabel(c.titulaire)}</td>
                      <td>{(c.type_compte === 'crypto' || c.actif_numerique) ? 'Oui' : 'Non'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEditCompte(c)} disabled={saving}>Modifier</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => askDeleteCompte(c)} disabled={saving}>Supprimer</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: '.78rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            Aide informative pour la préparation de la déclaration. Ce module ne constitue pas un conseil fiscal.
          </div>
        </section>

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 12 }}>Assistant déclaration d'impôts (3916)</div>

          <div className="form-row" style={{ alignItems: 'end' }}>
            <div className="form-group" style={{ maxWidth: 220 }}>
              <label className="form-label">Année fiscale</label>
              <CustomSelect
                value={declarationYear}
                onChange={(next) => setDeclarationYear(next)}
                options={YEAR_OPTIONS}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={copyDeclarationSummary}
                disabled={declarationLoading || !declaration.comptes.length}
              >
                Copier le résumé fiscal
              </button>
            </div>
          </div>

          {declarationLoading ? (
            <p className="text-text2">Calcul des comptes à déclarer...</p>
          ) : (
            <>
              <div className="g4" style={{ marginBottom: 12 }}>
                <div className="stat">
                  <div className="stat-label">Comptes à déclarer</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{declaration.stats.total}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Ouverts sur l'année</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{declaration.stats.ouverts_dans_annee}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Clôturés sur l'année</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{declaration.stats.clos_dans_annee}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Actifs sur l'année</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{declaration.stats.actifs_sur_annee}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Confiance données</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{scoreConfiance}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Cas 3916-bis</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{declaration.stats.comptes_3916_bis || 0}</div>
                </div>
              </div>

              <div style={{ marginBottom: 12, fontSize: '.78rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                Motifs traçables inclus dans chaque ligne: utile pour justifier rapidement pourquoi un compte est retenu (ouvert, clôturé, actif, date manquante).
              </div>

              {!declaration.comptes.length ? (
                <p className="text-text2">Aucun compte à déclarer sur l'année {declaration.annee}.</p>
              ) : (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Établissement</th>
                        <th>Pays</th>
                        <th>Motif</th>
                        <th>Ouverture</th>
                        <th>Clôture</th>
                        <th>Type</th>
                        <th>Qualité</th>
                        <th>Trace règles</th>
                        <th>Vigilance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declaration.comptes.map((c) => (
                        <tr key={`decl-${c.id}`}>
                          <td>
                            <div className="td-name">{c.etablissement}</div>
                            {c.numero_compte ? <div className="td-mono dim" style={{ fontSize: '.68rem' }}>N° {c.numero_compte}</div> : null}
                          </td>
                          <td>{c.pays || '-'}</td>
                          <td>{c.motif_declaration_label || MOTIF_LABELS[c.motif_declaration] || '-'}</td>
                          <td className="td-mono dim" style={{ fontSize: '.72rem' }}>{formatDateFr(c.date_ouverture)}</td>
                          <td className="td-mono dim" style={{ fontSize: '.72rem' }}>{formatDateFr(c.date_cloture)}</td>
                          <td>{typeCompteLabel(c.type_compte)}</td>
                          <td>{titulaireLabel(c.titulaire)}</td>
                          <td className="td-mono dim" style={{ fontSize: '.68rem' }}>{Array.isArray(c.trace_regles) && c.trace_regles.length ? c.trace_regles.join(', ') : '-'}</td>
                          <td className="td-mono dim" style={{ fontSize: '.68rem' }}>{Array.isArray(c.vigilances_compte) && c.vigilances_compte.length ? c.vigilances_compte.join(' | ') : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="g2" style={{ marginTop: 12 }}>
                <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                  <div className="card-label" style={{ marginBottom: 10 }}>Écarts et vigilance</div>
                  {declaration.vigilances?.length ? (
                    <ul style={{ display: 'grid', gap: 8, margin: 0, paddingLeft: 18 }}>
                      {declaration.vigilances.map((v, idx) => (
                        <li key={`v-${idx}`} style={{ fontSize: '.8rem', color: 'var(--text2)' }}>
                          {v.message} - <span style={{ color: 'var(--text)' }}>{v.action}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-text2">Aucune vigilance bloquante détectée.</p>
                  )}
                </div>

                <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                  <div className="card-label" style={{ marginBottom: 10 }}>Checklist avant déclaration</div>
                  {declaration.checklist?.length ? (
                    <ul style={{ display: 'grid', gap: 8, margin: 0, paddingLeft: 18 }}>
                      {declaration.checklist.map((item, idx) => (
                        <li key={`ck-${idx}`} style={{ fontSize: '.8rem', color: item.done ? 'var(--green)' : 'var(--text2)' }}>
                          {item.done ? '✓' : '•'} {item.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-text2">Checklist indisponible.</p>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12, fontSize: '.78rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                Règle appliquée: un compte est retenu s'il a été ouvert avant fin d'année et non clôturé avant le 1er janvier de cette année.
              </div>
            </>
          )}
        </section>
      </>
    )
  }

  function renderFiscalPage() {
    const fmt = (n, sign = false) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2, ...(sign ? { signDisplay: 'always' } : {}) })
    const divParEnv = fiscal?.dividendes?.par_enveloppe || {}
    const divParSource = fiscal?.dividendes?.par_source || {}
    const pvParEnv = fiscal?.cessions?.par_enveloppe || {}
    const ifuDiv = fiscal?.reconciliation_ifu?.dividendes || {}
    const ifuCes = fiscal?.reconciliation_ifu?.cessions || {}
    const missingDiv = fiscal?.manquants?.dividendes || {}
    const missingCes = fiscal?.manquants?.cessions || {}
    return (
      <>
        <BackHeader
          title="Récapitulatif fiscal"
          subtitle="Plus-values réalisées et dividendes reçus — préparez votre déclaration de revenus."
          onBack={() => navigate('/settings')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="form-row" style={{ alignItems: 'end', marginBottom: 0 }}>
            <div className="form-group" style={{ maxWidth: 220 }}>
              <label className="form-label">Année fiscale</label>
              <CustomSelect
                value={fiscalYear}
                onChange={(next) => setFiscalYear(next)}
                options={YEAR_OPTIONS}
              />
            </div>
            <div className="form-group" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={copyFiscalSummary}
                disabled={fiscalLoading || !fiscal}
              >
                Copier le résumé
              </button>
            </div>
          </div>
        </section>

        {fiscalLoading && <p className="text-text2">Chargement…</p>}

        {!fiscalLoading && fiscal && (
          <>
            <section className="card fade-up" style={{ maxWidth: 980 }}>
              <div className="card-label" style={{ marginBottom: 12 }}>Dividendes et revenus</div>
              <div className="g4" style={{ marginBottom: Object.keys(divParEnv).length ? 16 : 0 }}>
                <div className="stat">
                  <div className="stat-label">Total brut</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmt(fiscal.dividendes.total_brut)} €</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Retenue à la source</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmt(fiscal.dividendes.total_retenue_source)} €</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Net perçu</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fmt(fiscal.dividendes.total_net)} €</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Versements</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fiscal.dividendes.nb}</div>
                </div>
              </div>
              {Object.keys(divParEnv).length > 0 && (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr><th>Enveloppe</th><th>Brut</th><th>Retenue</th><th>Net</th><th>Versements</th><th>Régime fiscal</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(divParEnv).map(([env, d]) => (
                        <tr key={env}>
                          <td><span className="badge">{env}</span></td>
                          <td className="td-mono strong">{fmt(d.brut)} €</td>
                          <td className="td-mono">{fmt(d.retenue)} €</td>
                          <td className="td-mono">{fmt(d.net)} €</td>
                          <td className="td-mono">{d.nb}</td>
                          <td style={{ fontSize: '.71rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                            {env === 'PEA' ? "Exonéré d'IR — PS 17,2 % en cas de retrait" : env === 'CTO' ? 'PFU 30 % (IR 12,8 % + PS 17,2 %)' : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {Object.keys(divParSource).length > 0 && (
                <div className="tbl-wrap" style={{ marginTop: 12 }}>
                  <table>
                    <thead>
                      <tr><th>Enveloppe</th><th>Pays/source</th><th>Brut</th><th>Retenue</th><th>Net</th><th>Versements</th></tr>
                    </thead>
                    <tbody>
                      {Object.values(divParSource).map((s, idx) => (
                        <tr key={`${s.enveloppe}-${s.pays_source}-${idx}`}>
                          <td><span className="badge">{s.enveloppe}</span></td>
                          <td>{s.pays_source}</td>
                          <td className="td-mono">{fmt(s.brut)} €</td>
                          <td className="td-mono">{fmt(s.retenue)} €</td>
                          <td className="td-mono">{fmt(s.net)} €</td>
                          <td className="td-mono">{s.nb}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!fiscal.dividendes.nb && <p className="text-text2">Aucun dividende enregistré sur {fiscal.annee}.</p>}
            </section>

            <section className="card fade-up" style={{ maxWidth: 980 }}>
              <div className="card-label" style={{ marginBottom: 12 }}>Plus-values et moins-values réalisées</div>
              <div className="g4" style={{ marginBottom: Object.keys(pvParEnv).length ? 16 : 0 }}>
                <div className="stat">
                  <div className="stat-label">PV brutes</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: fiscal.cessions.total_pv > 0 ? 'var(--green)' : 'inherit' }}>{fmt(fiscal.cessions.total_pv)} €</div>
                </div>
                <div className="stat">
                  <div className="stat-label">MV réalisées</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: fiscal.cessions.total_mv < 0 ? 'var(--red)' : 'inherit' }}>{fmt(fiscal.cessions.total_mv)} €</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Solde net PV/MV</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: fiscal.cessions.solde >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(fiscal.cessions.solde, true)} €</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Cessions</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{fiscal.cessions.nb_cessions}</div>
                </div>
              </div>
              {Object.keys(pvParEnv).length > 0 && (
                <div className="tbl-wrap">
                  <table>
                    <thead>
                      <tr><th>Enveloppe</th><th>PV brutes</th><th>MV</th><th>Solde</th><th>Produit net</th><th>Cessions</th><th>Régime fiscal</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(pvParEnv).map(([env, d]) => (
                        <tr key={env}>
                          <td><span className="badge">{env}</span></td>
                          <td className={`td-mono ${d.pv > 0 ? 'green' : ''}`}>{fmt(d.pv)} €</td>
                          <td className={`td-mono ${d.mv < 0 ? 'red' : ''}`}>{fmt(d.mv)} €</td>
                          <td className={`td-mono strong ${d.solde >= 0 ? 'green' : 'red'}`}>{fmt(d.solde, true)} €</td>
                          <td className="td-mono">{fmt(d.produit_net)} €</td>
                          <td className="td-mono">{d.nb_cessions}</td>
                          <td style={{ fontSize: '.71rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                            {env === 'PEA' ? "Exonéré d'IR (>5 ans) — PS 17,2 % au retrait" : env === 'CTO' ? 'PFU 30 % ou barème progressif' : env === 'OR' ? 'Taxe forfaitaire 11,5 % ou RCM' : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!fiscal.cessions.nb_cessions && <p className="text-text2">Aucune cession enregistrée sur {fiscal.annee}.</p>}
            </section>

            <section className="card fade-up" style={{ maxWidth: 980 }}>
              <div className="card-label" style={{ marginBottom: 12 }}>Écarts et vigilance</div>
              {Array.isArray(fiscal.vigilances) && fiscal.vigilances.length > 0 ? (
                <ul style={{ display: 'grid', gap: 8, margin: 0, paddingLeft: 18 }}>
                  {fiscal.vigilances.map((v, idx) => (
                    <li key={`fis-v-${idx}`} style={{ fontSize: '.82rem', color: 'var(--text2)' }}>
                      {v.message} - <span style={{ color: 'var(--text)' }}>{v.action}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-text2">Aucun écart critique détecté.</p>
              )}

              <div style={{ marginTop: 12, fontSize: '.78rem', color: 'var(--text-3)', fontFamily: 'var(--mono)', lineHeight: 1.7 }}>
                Confiance dividendes: {SCORE_LABELS[fiscal?.scores_confiance?.dividendes] || '-'} | Confiance cessions: {SCORE_LABELS[fiscal?.scores_confiance?.cessions] || '-'} | Global: {SCORE_LABELS[fiscal?.scores_confiance?.global] || '-'}
              </div>
            </section>

            <section className="card fade-up" style={{ maxWidth: 980 }}>
              <div className="card-label" style={{ marginBottom: 12 }}>Rapprochement IFU (théorique)</div>

              <div className="tbl-wrap" style={{ marginBottom: 12 }}>
                <table>
                  <thead>
                    <tr><th>Bloc</th><th>Brut / PV</th><th>Retenue / MV</th><th>Net / Solde</th><th>Lignes</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Dividendes</td>
                      <td className="td-mono">{fmt(ifuDiv.montant_brut_theorique)} €</td>
                      <td className="td-mono">{fmt(ifuDiv.retenue_source_theorique)} €</td>
                      <td className="td-mono">{fmt(ifuDiv.montant_net_theorique)} €</td>
                      <td className="td-mono">{ifuDiv.lignes ?? 0}</td>
                    </tr>
                    <tr>
                      <td>Cessions</td>
                      <td className="td-mono">{fmt(ifuCes.pv_theorique)} €</td>
                      <td className="td-mono">{fmt(ifuCes.mv_theorique)} €</td>
                      <td className={`td-mono ${Number(ifuCes.solde_theorique || 0) >= 0 ? 'green' : 'red'}`}>{fmt(ifuCes.solde_theorique, true)} €</td>
                      <td className="td-mono">{ifuCes.lignes ?? 0}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="g2" style={{ gap: 10 }}>
                <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>Champs manquants — Dividendes</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--text2)', display: 'grid', gap: 6 }}>
                    <div>Sans détail brut/retenue/net: <span className="td-mono">{missingDiv.sans_detail ?? 0}</span></div>
                    <div>Sans pays source: <span className="td-mono">{missingDiv.sans_pays ?? 0}</span></div>
                    <div>Sans enveloppe: <span className="td-mono">{missingDiv.sans_enveloppe ?? 0}</span></div>
                  </div>
                </div>
                <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>Champs manquants — Cessions</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--text2)', display: 'grid', gap: 6 }}>
                    <div>Sans PV/MV renseignée: <span className="td-mono">{missingCes.sans_pv ?? 0}</span></div>
                    <div>Sans date d'opération: <span className="td-mono">{missingCes.sans_date ?? 0}</span></div>
                    <div>Sans enveloppe: <span className="td-mono">{missingCes.sans_enveloppe ?? 0}</span></div>
                  </div>
                </div>
              </div>
            </section>

            <section className="card fade-up" style={{ maxWidth: 980 }}>
              <div className="card-label" style={{ marginBottom: 12 }}>Hypothèses de calcul</div>
              {Array.isArray(fiscal.hypotheses) && fiscal.hypotheses.length > 0 ? (
                <ul style={{ display: 'grid', gap: 10, margin: 0, paddingLeft: 18, marginBottom: 14 }}>
                  {fiscal.hypotheses.map((h, idx) => (
                    <li key={`fis-h-${idx}`} style={{ fontSize: '.9rem', lineHeight: 1.55, color: 'var(--text2)' }}>{h}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-text2" style={{ marginBottom: 14 }}>Aucune hypothèse signalée.</p>
              )}

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: '.78rem', color: 'var(--text-3)', fontFamily: 'var(--mono)', lineHeight: 1.8 }}>
                Données issues de vos saisies Tomino — comparez avec votre IFU (Imprimé Fiscal Unique) transmis par votre courtier chaque février. Ce module est un outil d’aide, pas un conseil fiscal.
              </div>
            </section>
          </>
        )}
      </>
    )
  }

  function renderExportPage() {
    return (
      <>
        <BackHeader
          title="Export & import"
          subtitle="Exportez vos données et restaurez vos sauvegardes depuis Tomino."
          onBack={() => navigate('/settings')}
        />

        <section style={{ display: 'grid', gap: 12, maxWidth: 980 }}>
          <button type="button" className="settings-row" onClick={() => navigate('/settings/export/pdf')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
            <div className="settings-row-info">
              <div className="settings-row-title">Export patrimonial PDF</div>
              <div className="settings-row-sub">Télécharger un rapport PDF (résumé, allocation, performances, positions).</div>
            </div>
            <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
          </button>

          <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-mouvements')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
            <div className="settings-row-info">
              <div className="settings-row-title">Mouvements (CSV)</div>
              <div className="settings-row-sub">Tous les achats et ventes enregistrés.</div>
            </div>
            <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
          </button>

          <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-dividendes')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
            <div className="settings-row-info">
              <div className="settings-row-title">Dividendes (CSV)</div>
              <div className="settings-row-sub">Tous les versements de dividendes.</div>
            </div>
            <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
          </button>

          <button type="button" className="settings-row" onClick={() => navigate('/settings/export/csv-fiscal')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
            <div className="settings-row-info">
              <div className="settings-row-title">Synthèse fiscale (CSV)</div>
              <div className="settings-row-sub">Rapport fiscal intégrant dividendes bruts et plus/moins-values.</div>
            </div>
            <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
          </button>

          <button type="button" className="settings-row" onClick={() => navigate('/settings/export/backup')} style={{ width: '100%', border: 0, textAlign: 'left', background: 'transparent', padding: 0 }}>
            <div className="settings-row-info">
              <div className="settings-row-title">Sauvegarde complète (.tomino-backup)</div>
              <div className="settings-row-sub">Exporter ou réimporter la base locale avec validation d'intégrité.</div>
            </div>
            <span style={{ color: 'var(--text2)', fontSize: '1.2rem' }}>›</span>
          </button>
        </section>
      </>
    )
  }

  function renderExportPdfPage() {
    return (
      <>
        <BackHeader
          title="Export patrimonial PDF"
          subtitle="Générez un rapport PDF de votre patrimoine depuis vos données Tomino."
          onBack={() => navigate('/settings/export')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>Configuration</div>
          <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: 12 }}>
            L'export inclut un résumé global, l'allocation par enveloppe, les performances latentes,
            les positions principales et votre dernier commentaire IA disponible.
          </p>

          <div className="settings-row" style={{ marginBottom: 12 }} onClick={() => setIncludeIaInPdf((v) => !v)}>
            <div className="settings-row-info">
              <div className="settings-row-title">Inclure le commentaire IA</div>
              <div className="settings-row-sub">
                {includeIaInPdf
                  ? 'Le PDF inclura la section commentaire IA le plus récent.'
                  : 'Le PDF sera généré sans section commentaire IA.'}
              </div>
            </div>
            <button
              className={`toggle-switch${includeIaInPdf ? ' on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setIncludeIaInPdf((v) => !v)
              }}
              type="button"
              aria-pressed={includeIaInPdf}
              aria-label="Inclure ou non les commentaires IA dans le PDF"
            />
          </div>

          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Contenu du PDF</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-2)', fontSize: '.85rem' }}>
                <li>Résumé patrimonial (total, investi, PV globale)</li>
                <li>Allocation PEA/CTO/Or/Livrets/Assurance vie</li>
                <li>Performances par enveloppe</li>
                <li>Positions principales valorisées</li>
                {includeIaInPdf && <li>Dernière analyse IA enregistrée</li>}
              </ul>
            </div>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Format</div>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Fichier PDF généré côté serveur local, prêt à partager ou archiver.
                Vos données restent locales dans votre environnement Tomino.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={downloadPatrimoinePdf} disabled={exportingPdf}>
              {exportingPdf ? 'Génération du PDF...' : 'Télécharger le PDF patrimonial'}
            </button>
          </div>
        </section>
      </>
    )
  }

  function renderExportCsvMouvementsPage() {
    return (
      <>
        <BackHeader
          title="Mouvements (CSV)"
          subtitle="Exportez tous vos achats et ventes enregistrés."
          onBack={() => navigate('/settings/export')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>Contenu</div>
          <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: 12 }}>
            Incluera toutes les opérations passées et présentes : dates, enveloppes, tickers, quantités, prix, frais, et plus-values réalisées.
          </p>

          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Données incluses</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-2)', fontSize: '.85rem' }}>
                <li>Date et type d'opération</li>
                <li>Enveloppe (PEA / CTO / Or)</li>
                <li>Actif / Ticker</li>
                <li>Quantité et prix unitaire</li>
                <li>Frais d'opération</li>
                <li>Montants nets et bruts</li>
                <li>Plus-values réalisées (si vente)</li>
              </ul>
            </div>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Format</div>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Fichier CSV avec séparateur point-virgule,
                encodage UTF-8 compatible avec Excel.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={downloadMouvementsCsv} disabled={exportingCsvMouvements}>
              {exportingCsvMouvements ? 'Téléchargement en cours...' : 'Télécharger le CSV'}
            </button>
          </div>
        </section>
      </>
    )
  }

  function renderExportCsvDividendesPage() {
    return (
      <>
        <BackHeader
          title="Dividendes (CSV)"
          subtitle="Exportez l'historique de tous vos versements de dividendes."
          onBack={() => navigate('/settings/export')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>Contenu</div>
          <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: 12 }}>
            Incluera tous les versements enregistrés avec détail brut, retenues à la source, montants nets, pays source et devises.
          </p>

          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Données incluses</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-2)', fontSize: '.85rem' }}>
                <li>Date de versement</li>
                <li>Nom et ticker du titre</li>
                <li>Enveloppe fiscale</li>
                <li>Montant brut encaissé</li>
                <li>Retenue à la source</li>
                <li>Montant net reçu</li>
                <li>Pays et devise source</li>
              </ul>
            </div>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Format</div>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Fichier CSV avec séparateur point-virgule,
                encodage UTF-8 compatible avec Excel.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={downloadDividendesCsv} disabled={exportingCsvDividendes}>
              {exportingCsvDividendes ? 'Téléchargement en cours...' : 'Télécharger le CSV'}
            </button>
          </div>
        </section>
      </>
    )
  }

  function renderExportCsvFiscalPage() {
    return (
      <>
        <BackHeader
          title="Synthèse fiscale (CSV)"
          subtitle="Rapport fiscal par année incluant dividendes bruts et plus/moins-values."
          onBack={() => navigate('/settings/export')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>Sélection d'année</div>
          <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: 12 }}>
            Générez un rapport fiscal pour l'année choisie. Les données intègrent dividendes bruts,
            plus-values/moins-values réalisées et latentes détaillées par enveloppe.
          </p>

          <div className="form-row" style={{ marginBottom: 12, alignItems: 'center' }}>
            <label className="form-label" style={{ margin: 0, minWidth: 130 }}>Année fiscale</label>
            <input
              className="form-input"
              type="number"
              min="1990"
              max="2100"
              value={exportFiscalYear}
              onChange={(e) => setExportFiscalYear(e.target.value)}
              placeholder={String(new Date().getFullYear())}
              style={{ maxWidth: 160 }}
            />
          </div>

          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Données incluses</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--text-2)', fontSize: '.85rem' }}>
                <li>Total année (dividendes bruts)</li>
                <li>Plus-values réalisées par enveloppe</li>
                <li>Moins-values réalisées par enveloppe</li>
                <li>Plus-values latentes par enveloppe</li>
                <li>Moins-values latentes par enveloppe</li>
                <li>Rapprochement avec IFU estimé</li>
              </ul>
            </div>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Format</div>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Fichier CSV avec séparateur point-virgule,
                encodage UTF-8 compatible avec Excel.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={downloadFiscalCsv} disabled={exportingCsvFiscal}>
              {exportingCsvFiscal ? 'Téléchargement en cours...' : `Télécharger fiscal ${exportFiscalYear}`}
            </button>
          </div>
        </section>
      </>
    )
  }

  function renderExportBackupPage() {
    return (
      <>
        <BackHeader
          title="Sauvegarde complète (export / import)"
          subtitle="Exportez et restaurez la base locale Tomino au format .tomino-backup."
          onBack={() => navigate('/settings/export')}
        />

        <section className="card fade-up" style={{ maxWidth: 980 }}>
          <div className="card-label" style={{ marginBottom: 10 }}>Export / Import de base</div>
          <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: 12 }}>
            Le fichier <strong>.tomino-backup</strong> contient votre base SQLite et un manifeste d'intégrité
            (empreinte SHA-256). L'import vérifie automatiquement la structure et la cohérence du fichier.
          </p>

          <div className="g2" style={{ marginBottom: 12 }}>
            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Export</div>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Télécharge une sauvegarde complète pour archivage ou transfert vers un autre appareil.
              </p>
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-primary" onClick={downloadDatabaseBackup} disabled={exportingBackup || importingBackup}>
                  {exportingBackup ? 'Création de la sauvegarde...' : 'Télécharger la sauvegarde .tomino-backup'}
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={toggleBackupPasswordFields}
                  disabled={exportingBackup || importingBackup}
                  aria-expanded={showBackupPasswordFields}
                  style={{ width: '100%', justifyContent: 'space-between' }}
                >
                  <span>Sécuriser avec un mot de passe (optionnel)</span>
                  <span aria-hidden="true" style={{ fontSize: '.9rem' }}>{showBackupPasswordFields ? '▲' : '▼'}</span>
                </button>

                {showBackupPasswordFields && (
                  <>
                    <div className="form-row" style={{ marginTop: 12 }}>
                      <div className="form-group">
                        <label className="form-label">Mot de passe</label>
                        <input
                          className="form-input"
                          type="password"
                          value={backupPassword}
                          onChange={(e) => setBackupPassword(e.target.value)}
                          placeholder="8 caractères minimum"
                          autoComplete="new-password"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Confirmer le mot de passe</label>
                        <input
                          className="form-input"
                          type="password"
                          value={backupPasswordConfirm}
                          onChange={(e) => setBackupPasswordConfirm(e.target.value)}
                          placeholder="Répéter le mot de passe"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <p style={{ marginTop: 8, color: 'var(--text-3)', fontSize: '.75rem', fontFamily: 'var(--mono)' }}>
                      Si un mot de passe est renseigné, la sauvegarde est chiffrée. Sans ce mot de passe, la restauration sera impossible.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
              <div className="card-label" style={{ marginBottom: 8 }}>Import</div>
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Restaure une sauvegarde locale validée. Une copie de sécurité pré-import est conservée.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".tomino-backup,.zip,application/zip"
                style={{ display: 'none' }}
                disabled={importingBackup || exportingBackup}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setSelectedBackupName(file.name || '')
                  setSelectedBackupFile(file)
                  verifyBackupImport(file)
                }}
              />

              <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={openBackupFilePicker}
                  disabled={importingBackup || exportingBackup || verifyingBackup}
                >
                  {verifyingBackup ? 'Vérification...' : importingBackup ? 'Import en cours...' : 'Choisir un fichier .tomino-backup'}
                </button>
                <span style={{ color: 'var(--text-3)', fontSize: '.78rem', fontFamily: 'var(--mono)' }}>
                  {selectedBackupName || 'Aucun fichier sélectionné'}
                </span>
              </div>

              <div className="form-group" style={{ marginTop: 10 }}>
                <label className="form-label">Mot de passe de restauration (si sauvegarde chiffrée)</label>
                <input
                  className="form-input"
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Saisir le mot de passe si nécessaire"
                  autoComplete="current-password"
                />
              </div>

              {backupVerification && (
                <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,.01)', display: 'grid', gap: 8 }}>
                  <div style={{ color: 'var(--text)', fontSize: '.84rem', fontWeight: 600 }}>
                    Vérification réussie: prêt à restaurer
                  </div>
                  <div style={{ color: 'var(--text-2)', fontSize: '.8rem' }}>
                    Fichier: {backupVerification.filename || selectedBackupName || '-'}
                  </div>
                  <div style={{ color: 'var(--text-2)', fontSize: '.8rem' }}>
                    Backup: schéma v{backupVerification?.manifest?.schema_version ?? '-'} • {Number(backupVerification?.manifest?.db_size || 0).toLocaleString('fr-FR')} octets • créé le {formatIsoDateTime(backupVerification?.manifest?.created_at)}
                  </div>
                  <div style={{ color: 'var(--text-2)', fontSize: '.8rem' }}>
                    Chiffrement: {backupVerification?.manifest?.encrypted ? 'Oui (mot de passe requis)' : 'Non'}
                  </div>
                  <div style={{ color: 'var(--text-2)', fontSize: '.8rem' }}>
                    Base actuelle: schéma v{backupVerification?.current?.schema_version ?? '-'} • {Number(backupVerification?.current?.size || 0).toLocaleString('fr-FR')} octets
                  </div>
                  <div style={{ color: 'var(--text-3)', fontSize: '.76rem', fontFamily: 'var(--mono)', lineHeight: 1.5 }}>
                    {backupVerification.warning || "Cette opération écrase la base actuelle."}
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: 'var(--text-2)', fontSize: '.82rem' }}>
                    <input
                      type="checkbox"
                      checked={confirmRestoreChecked}
                      onChange={(e) => setConfirmRestoreChecked(Boolean(e.target.checked))}
                      disabled={importingBackup || verifyingBackup}
                    />
                    Je confirme la restauration et l'écrasement de la base locale actuelle.
                  </label>

                  <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={restoreVerifiedBackup}
                      disabled={!confirmRestoreChecked || importingBackup || verifyingBackup}
                    >
                      {importingBackup ? 'Restauration en cours...' : 'Restaurer cette sauvegarde'}
                    </button>
                  </div>
                </div>
              )}

              <p style={{ marginTop: 8, color: 'var(--text-3)', fontSize: '.75rem', fontFamily: 'var(--mono)' }}>
                Astuce: utilisez la même version majeure de Tomino pour limiter les écarts de schéma.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--line)', color: 'var(--text-3)', fontSize: '.78rem', fontFamily: 'var(--mono)', lineHeight: 1.65 }}>
            Validation effectuée à l'import: format d'archive, manifeste JSON, taille, SHA-256 et présence des tables métiers.
          </div>

          <div className="card" style={{ marginTop: 12, background: 'rgba(255,255,255,.01)' }}>
            <div className="card-label" style={{ marginBottom: 8 }}>Sauvegardes automatiques locales</div>
            {loadingAutoBackupStatus ? (
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem' }}>Chargement du statut...</p>
            ) : autoBackupStatus ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ color: 'var(--text-2)', fontSize: '.85rem' }}>
                  Rotation active: {autoBackupStatus.daily_count}/{autoBackupStatus.daily_keep} quotidiennes, {autoBackupStatus.weekly_count}/{autoBackupStatus.weekly_keep} hebdomadaires.
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: '.82rem' }}>
                  Dernière quotidienne: {autoBackupStatus.last_daily?.filename || '-'} ({formatIsoDateTime(autoBackupStatus.last_daily?.updated_at)})
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: '.82rem' }}>
                  Dernière hebdomadaire: {autoBackupStatus.last_weekly?.filename || '-'} ({formatIsoDateTime(autoBackupStatus.last_weekly?.updated_at)})
                </div>
                <div style={{ color: 'var(--text-3)', fontSize: '.75rem', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
                  Dossier: {autoBackupStatus.dir || '-'}
                </div>
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-2)', fontSize: '.85rem' }}>
                Statut indisponible pour le moment.
              </p>
            )}

            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-ghost" onClick={loadAutoBackupStatus} disabled={loadingAutoBackupStatus || openingAutoBackupFolder}>
                {loadingAutoBackupStatus ? 'Actualisation...' : 'Actualiser le statut'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={openAutoBackupFolder} disabled={openingAutoBackupFolder || loadingAutoBackupStatus}>
                {openingAutoBackupFolder ? 'Ouverture...' : 'Ouvrir le dossier des sauvegardes'}
              </button>
            </div>
          </div>
        </section>
      </>
    )
  }

  function renderSyncPage() {
    const isTominoPlus = Boolean(syncSubscription?.tomino_plus || syncAuthUser?.tomino_plus || String(syncAuthUser?.tier || '').toLowerCase() === 'tomino_plus')
    const currentTier = String(syncSubscription?.tier || syncAuthUser?.tier || 'free').toLowerCase()
    const currentDevice = (syncDevices || []).find((d) => d.device_id === syncCurrentDeviceId) || null
    const otherDevices = (syncDevices || []).filter((d) => d.device_id && d.device_id !== syncCurrentDeviceId && !d.revoked_at)

    return (
      <>
        <BackHeader
          title="Synchronisation cloud"
          subtitle="Le compte est requis uniquement pour la sync cloud. L'usage Gratuit reste local-first sur desktop."
          onBack={() => navigate('/settings')}
        />

        {!syncAuthToken && (
          <section className="card fade-up" style={{ maxWidth: 980 }}>
            <div className="card-label" style={{ marginBottom: 10 }}>Activer la synchronisation cloud</div>
            <p style={{ color: 'var(--text-2)', fontSize: '.9rem', lineHeight: 1.65, marginBottom: 12 }}>
              Créez un compte (ou connectez-vous) pour synchroniser votre patrimoine entre plusieurs appareils.
              Sans compte, Tomino reste entièrement utilisable en local sur desktop.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSyncAuthMode('login')
                  setSyncAuthModalOpen(true)
                }}
              >
                Se connecter
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSyncAuthMode('register')
                  setSyncAuthTier('free')
                  setSyncAuthModalOpen(true)
                }}
              >
                Créer un compte cloud
              </button>
            </div>
          </section>
        )}

        {syncAuthToken && (
          <section className="card fade-up" style={{ maxWidth: 980 }}>
            <div className="card-label" style={{ marginBottom: 10 }}>État de synchronisation</div>
            {syncLoading ? (
              <p className="text-text2">Chargement de l'état cloud...</p>
            ) : (
              <>
                <div className="card" style={{ background: 'rgba(255,255,255,.01)', marginBottom: 12 }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>Abonnement</div>
                  <div style={{ color: 'var(--text-2)', fontSize: '.84rem', lineHeight: 1.7 }}>
                    <div>
                      Formule actuelle: <span className="td-mono">{syncSubscription?.label || syncAuthUser?.tier_label || 'Gratuit'}</span>
                    </div>
                    <div>
                      État cloud: <span className="td-mono">{isTominoPlus ? 'Tomino+ actif' : 'Mode local (Gratuit)'}</span>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/settings/pricing')}>
                      Gérer l'offre
                    </button>
                  </div>
                </div>

                {!isTominoPlus && (
                  <div className="card" style={{ background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.35)', marginBottom: 12 }}>
                    <div className="card-label" style={{ marginBottom: 8, color: '#f5dd9d' }}>Fonctionnalités cloud verrouillées</div>
                    <p style={{ margin: 0, color: '#e6d6a4', fontSize: '.84rem', lineHeight: 1.65 }}>
                      En Gratuit, votre application reste 100% locale. Passez à Tomino + pour activer la synchronisation cloud et la gestion des appareils.
                    </p>
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn-ghost" onClick={() => navigate('/settings/pricing')}>
                        Voir les tarifs
                      </button>
                    </div>
                  </div>
                )}

                <div className="g2" style={{ marginBottom: 12 }}>
                  <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                    <div className="card-label" style={{ marginBottom: 8 }}>Compte cloud</div>
                    <div style={{ color: 'var(--text-2)', fontSize: '.84rem', lineHeight: 1.7 }}>
                      <div>Email: <span className="td-mono">{syncAuthUser?.email || '-'}</span></div>
                      <div>Plan: <span className="td-mono">{syncSubscription?.label || syncAuthUser?.tier_label || 'Gratuit'}</span></div>
                      <div>Appareil courant: <span className="td-mono">{syncCurrentDeviceId || syncDeviceId || '-'}</span></div>
                    </div>
                  </div>
                  <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                    <div className="card-label" style={{ marginBottom: 8 }}>Synchronisation</div>
                    <div style={{ color: 'var(--text-2)', fontSize: '.84rem', lineHeight: 1.7 }}>
                      <div>Statut: <span className="td-mono">{currentDevice?.sync_paused ? 'En pause' : 'Active'}</span></div>
                      <div>Dernier curseur: <span className="td-mono">{currentDevice?.last_sync_cursor ?? 0}</span></div>
                      <div>Dernière activité: <span className="td-mono">{formatIsoDateTime(currentDevice?.last_seen_at)}</span></div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: 12 }}>
                  <button type="button" className="btn btn-ghost" onClick={loadSyncState} disabled={syncLoading || syncActionSaving}>
                    {syncLoading ? 'Actualisation...' : 'Actualiser'}
                  </button>
                  {String(syncSubscription?.provider || '').toLowerCase() === 'stripe' && isTominoPlus && (
                    <button type="button" className="btn btn-ghost" onClick={openBillingPortal} disabled={syncActionSaving}>
                      Gérer l’abonnement
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => pauseResumeSync(!(currentDevice?.sync_paused))}
                    disabled={syncActionSaving || !syncCurrentDeviceId || !isTominoPlus}
                  >
                    {syncActionSaving
                      ? 'Mise à jour...'
                      : currentDevice?.sync_paused
                      ? 'Reprendre la synchronisation'
                      : 'Mettre en pause la synchronisation'}
                  </button>
                  <button type="button" className="btn btn-danger" onClick={syncLogout} disabled={syncActionSaving}>
                    {syncActionSaving ? 'Déconnexion...' : 'Se déconnecter du cloud'}
                  </button>
                </div>

                <div className="card" style={{ background: 'rgba(255,255,255,.01)' }}>
                  <div className="card-label" style={{ marginBottom: 8 }}>Appareils connectés</div>
                  {!isTominoPlus ? (
                    <p className="text-text2">Disponible uniquement avec Tomino +.</p>
                  ) : !syncDevices.length ? (
                    <p className="text-text2">Aucun appareil connecté pour le moment.</p>
                  ) : (
                    <div className="tbl-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Appareil</th>
                            <th>ID</th>
                            <th>Statut</th>
                            <th>Dernière activité</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {syncDevices.map((d) => {
                            const isCurrent = d.device_id === syncCurrentDeviceId
                            const isRevoked = Boolean(d.revoked_at)
                            return (
                              <tr key={String(d.device_id || d.id)}>
                                <td>{d.device_label || 'Appareil sans nom'}{isCurrent ? ' (courant)' : ''}</td>
                                <td className="td-mono">{d.device_id || '-'}</td>
                                <td>{isRevoked ? 'Révoqué' : (d.sync_paused ? 'En pause' : 'Actif')}</td>
                                <td className="td-mono">{formatIsoDateTime(d.last_seen_at)}</td>
                                <td>
                                  {!isCurrent && !isRevoked && (
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() => revokeDevice(d.device_id)}
                                      disabled={syncActionSaving}
                                    >
                                      Révoquer
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!!otherDevices.length && (
                    <p style={{ marginTop: 10, color: 'var(--text-3)', fontSize: '.75rem', fontFamily: 'var(--mono)' }}>
                      La révocation d'un appareil invalide ses sessions cloud actives.
                    </p>
                  )}
                </div>
              </>
            )}
          </section>
        )}
      </>
    )
  }

  function renderPricingPage() {
    const isTominoPlus = Boolean(syncSubscription?.tomino_plus || syncAuthUser?.tomino_plus || String(syncAuthUser?.tier || '').toLowerCase() === 'tomino_plus')

    return (
      <>
        <BackHeader
          title="Tarifs"
          subtitle="Comparez Gratuit et Tomino+ pour choisir le niveau adapté à votre usage."
          onBack={() => navigate('/settings')}
        />

        <section className="card fade-up" style={{ maxWidth: 1060, background: 'linear-gradient(180deg, rgba(10,16,24,.95), rgba(10,13,18,.95))', border: '1px solid rgba(77,124,255,.25)' }}>
          <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
            <div className="card-label" style={{ color: '#b8d5ff' }}>Gratuit vs Tomino+</div>
            <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: '2rem', letterSpacing: '.01em' }}>Simple, transparent, sans surprise.</h2>
            <p style={{ margin: 0, color: 'var(--text-2)', maxWidth: 760, lineHeight: 1.65 }}>
              Gratuit couvre tout le suivi local. Tomino+ débloque l'expérience cloud et les outils premium pour piloter votre patrimoine sur plusieurs appareils.
            </p>
          </div>

          <div className="g2" style={{ alignItems: 'stretch' }}>
            <article className="card" style={{ background: 'rgba(255,255,255,.01)', border: '1px solid rgba(255,255,255,.10)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div className="card-label">Gratuit</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem' }}>0€</div>
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '.84rem', marginBottom: 12 }}>Gratuit, sans compte obligatoire.</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {FREE_FEATURES.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--text-2)', fontSize: '.86rem' }}>
                    <span style={{ color: 'var(--green)', marginTop: 1 }}>✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="card" style={{ background: 'linear-gradient(180deg, rgba(30,21,8,.78), rgba(16,12,6,.86))', border: '1px solid rgba(201,168,76,.45)', boxShadow: '0 16px 36px rgba(0,0,0,.35)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div className="card-label" style={{ color: '#f5dd9d' }}>Tomino+</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '1.6rem', color: '#f7e8b9' }}>4,99€<span style={{ fontSize: '.85rem', color: '#dccf9f' }}>/mois</span></div>
              </div>
              <div style={{ color: '#e6d6a4', fontSize: '.84rem', marginBottom: 12 }}>Pour la sync cloud, l'IA avancée et les outils premium.</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {TOMINO_PLUS_FEATURES.map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#e9dfbd', fontSize: '.86rem' }}>
                    <span style={{ color: '#f2d37c', marginTop: 1 }}>★</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
              Sync cloud — prochainement
            </button>
            {!isTominoPlus && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!syncAuthToken) {
                    setSyncAuthMode('register')
                    setSyncAuthTier('tomino_plus')
                    setSyncAuthModalOpen(true)
                    return
                  }
                  changeSyncPlan('tomino_plus')
                }}
                disabled={syncActionSaving}
              >
                {syncActionSaving ? 'Ouverture...' : 'Activer Tomino+'}
              </button>
            )}
          </div>
        </section>
      </>
    )
  }

  return (
    <section>
      {!!toastMsg && (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 120, background: 'rgba(16,18,24,.96)', border: '1px solid rgba(24,195,126,.45)', color: '#9af8c9', borderRadius: 12, padding: '10px 14px', fontSize: '.86rem', boxShadow: '0 10px 32px rgba(0,0,0,.4)' }}>
          {toastMsg}
        </div>
      )}

      {loading && <p className="text-text2">Chargement du profil...</p>}

      {!loading && (
        <div style={{ display: 'grid', gap: 16 }}>
          {!isProfilePage && !isIaPage && !isComptesPage && !isFiscalPage && !isExportPage && !isAnyExportSubPage && !isSyncPage && !isPricingPage && !isConfidentialitePage && renderRoot()}
          {isProfilePage && renderProfilePage()}
          {isIaPage && renderIaPage()}
          {isComptesPage && <ComptesEtrangersPage render={renderComptesPage} />}
          {isFiscalPage && <FiscalPage render={renderFiscalPage} />}
          {isExportPage && <ExportPage ctx={{ BackHeader, navigate }} />}
          {isExportPdfPage && renderExportPdfPage()}
          {isExportCsvMouvementsPage && renderExportCsvMouvementsPage()}
          {isExportCsvDividendesPage && renderExportCsvDividendesPage()}
          {isExportCsvFiscalPage && renderExportCsvFiscalPage()}
          {isExportBackupPage && renderExportBackupPage()}
          {isSyncPage && (
            <SyncPage
              ctx={{
                BackHeader,
                navigate,
                syncSubscription,
                syncAuthUser,
                syncAuthToken,
                syncCurrentDeviceId,
                syncDeviceId,
                syncDevices,
                syncLoading,
                syncActionSaving,
                setSyncAuthMode,
                setSyncAuthModalOpen,
                setSyncAuthTier,
                loadSyncState,
                openBillingPortal,
                pauseResumeSync,
                syncLogout,
                revokeDevice,
                formatIsoDateTime,
              }}
            />
          )}
          {isConfidentialitePage && (
            <ConfidentialitePage ctx={{ BackHeader, navigate, blurAmounts, toggleBlur }} />
          )}
          {isPricingPage && (
            <PricingPage
              ctx={{
                BackHeader,
                navigate,
                syncSubscription,
                syncAuthUser,
                syncAuthToken,
                syncActionSaving,
                setSyncAuthMode,
                setSyncAuthTier,
                setSyncAuthModalOpen,
                changeSyncPlan,
                FREE_FEATURES,
                TOMINO_PLUS_FEATURES,
              }}
            />
          )}

          {(isProfilePage || isIaPage) && autoSaveStatus && (
            <div style={{ maxWidth: 980, display: 'flex', justifyContent: 'flex-end', minHeight: 28, alignItems: 'center' }}>
              {autoSaveStatus === 'saving' && (
                <span style={{ fontSize: '.74rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>Enregistrement...</span>
              )}
              {autoSaveStatus === 'saved' && (
                <span style={{ fontSize: '.74rem', color: 'var(--green)', fontFamily: 'var(--mono)' }}>Enregistré</span>
              )}
              {autoSaveStatus === 'error' && (
                <span style={{ fontSize: '.74rem', color: 'var(--red)', fontFamily: 'var(--mono)' }}>Erreur — impossible d'enregistrer</span>
              )}
            </div>
          )}

          <div style={{ textAlign: 'center', marginTop: 40, paddingBottom: 24, fontSize: '.75rem', color: 'var(--text-3)', letterSpacing: '.3px' }}>
            <div style={{ marginBottom: 10 }}>Tomino v{appVersion || '...'}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18 }}>
              <button type="button" onClick={() => navigate('/politique-confidentialite')} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: '.73rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)' }}>
                Politique de confidentialité
              </button>
              <button type="button" onClick={() => navigate('/mentions-legales')} style={{ background: 'none', border: 0, color: 'var(--text-3)', fontSize: '.73rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'rgba(255,255,255,0.15)' }}>
                Mentions légales
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCompte && createPortal(
        <div className="confirm-overlay" onClick={closeConfirmCompte}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title">Supprimer ce compte étranger ?</div>
            <div className="confirm-text">
              Le compte {confirmCompte.etablissement || ''} sera supprimé du récapitulatif 3916.
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={closeConfirmCompte} disabled={saving}>Annuler</button>
              <button type="button" className="btn btn-danger" onClick={confirmDeleteCompte} disabled={saving}>
                {saving ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {error && createPortal(
        <div className="confirm-overlay" onClick={closeErrorModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-title" style={{ color: 'var(--red)' }}>Erreur</div>
            <div className="confirm-text">
              {error}
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn btn-primary" onClick={closeErrorModal}>
                Fermer
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {syncAuthModalOpen && createPortal(
        <div className="confirm-overlay" onClick={() => !syncAuthSaving && setSyncAuthModalOpen(false)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="confirm-title">{syncAuthMode === 'register' ? 'Créer un compte cloud' : 'Connexion cloud'}</div>
            <div className="confirm-text" style={{ marginBottom: 14, color: 'var(--text-2)', lineHeight: 1.55 }}>
              {syncAuthMode === 'register' 
                ? 'Créez gratuitement votre compte de synchronisation. Choisissez votre forfait et commencez.'
                : 'Reconnectez-vous à votre compte cloud existant pour restaurer la synchronisation.'}
            </div>

            <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email</label>
                <input 
                  className="form-input" 
                  type="email" 
                  value={syncAuthEmail} 
                  onChange={(e) => setSyncAuthEmail(e.target.value)} 
                  placeholder="vous@exemple.com" 
                  autoComplete="email"
                  disabled={syncAuthSaving}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Mot de passe</label>
                <input 
                  className="form-input" 
                  type="password" 
                  value={syncAuthPassword} 
                  onChange={(e) => setSyncAuthPassword(e.target.value)} 
                  placeholder="8 caractères minimum" 
                  autoComplete={syncAuthMode === 'register' ? 'new-password' : 'current-password'}
                  disabled={syncAuthSaving}
                />
              </div>

              {syncAuthMode === 'register' && (
                <div style={{ marginTop: 6 }}>
                  <label className="form-label" style={{ marginBottom: 12 }}>Forfait au démarrage</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {/* Gratuit */}
                    <button
                      key="free"
                      type="button"
                      onClick={() => setSyncAuthTier('free')}
                      disabled={syncAuthSaving}
                      style={{
                        padding: '16px',
                        borderRadius: 12,
                        border: syncAuthTier === 'free' ? '2px solid rgba(255,255,255,.4)' : '1px solid var(--line)',
                        background: syncAuthTier === 'free' 
                          ? 'rgba(255,255,255,.05)'
                          : 'rgba(255,255,255,.01)',
                        cursor: 'pointer',
                        transition: 'all .16s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        textAlign: 'left',
                        boxShadow: syncAuthTier === 'free' ? '0 0 24px rgba(255,255,255,.12)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (syncAuthTier !== 'free') {
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,.2)'
                          e.currentTarget.style.background = 'rgba(255,255,255,.02)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (syncAuthTier !== 'free') {
                          e.currentTarget.style.borderColor = 'var(--line)'
                          e.currentTarget.style.background = 'rgba(255,255,255,.01)'
                        }
                      }}
                    >
                      <span style={{ fontSize: '.72rem', letterSpacing: '.4px', color: 'var(--text-3)', fontWeight: 600 }}>GRATUIT</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>0€</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-3)', lineHeight: 1.3, marginBottom: 6 }}>Sans compte obligatoire.</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--green)', fontWeight: 600, flexShrink: 0 }}>✓</span>
                          <span>Tracking complet</span>
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--green)', fontWeight: 600, flexShrink: 0 }}>✓</span>
                          <span>3 alertes max</span>
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--green)', fontWeight: 600, flexShrink: 0 }}>✓</span>
                          <span>IA limitée</span>
                        </div>
                      </div>
                    </button>

                    {/* Tomino+ */}
                    <button
                      key="tomino_plus"
                      type="button"
                      onClick={() => setSyncAuthTier('tomino_plus')}
                      disabled={syncAuthSaving}
                      style={{
                        padding: '16px',
                        borderRadius: 12,
                        border: syncAuthTier === 'tomino_plus' ? '2px solid var(--gold)' : '1px solid rgba(201,168,76,.4)',
                        background: syncAuthTier === 'tomino_plus' 
                          ? 'rgba(201,168,76,.16)'
                          : 'rgba(201,168,76,.05)',
                        cursor: 'pointer',
                        transition: 'all .16s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        textAlign: 'left',
                        boxShadow: syncAuthTier === 'tomino_plus' ? '0 0 24px rgba(201,168,76,.25)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (syncAuthTier !== 'tomino_plus') {
                          e.currentTarget.style.borderColor = 'rgba(201,168,76,.6)'
                          e.currentTarget.style.background = 'rgba(201,168,76,.08)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (syncAuthTier !== 'tomino_plus') {
                          e.currentTarget.style.borderColor = 'rgba(201,168,76,.4)'
                          e.currentTarget.style.background = 'rgba(201,168,76,.05)'
                        }
                      }}
                    >
                      <span style={{ fontSize: '.72rem', letterSpacing: '.4px', color: 'var(--gold)', fontWeight: 600 }}>TOMINO+</span>
                      <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--gold)' }}>4,99€<span style={{ fontSize: '.7rem', color: 'var(--text-2)', fontWeight: 400 }}>/mois</span></div>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-3)', lineHeight: 1.3, marginBottom: 6 }}>Sync cloud, IA avancée.</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>★</span>
                          <span>Tout le Gratuit</span>
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>★</span>
                          <span>Sync multi-appareils</span>
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>★</span>
                          <span>Alertes illimitées</span>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="confirm-actions" style={{ marginTop: 14, gap: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSyncAuthMode((m) => (m === 'register' ? 'login' : 'register'))}
                disabled={syncAuthSaving}
              >
                {syncAuthMode === 'register' ? 'Déjà un compte ? Se connecter' : 'Créer un compte'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitSyncAuth}
                disabled={syncAuthSaving || !String(syncAuthEmail || '').trim() || !String(syncAuthPassword || '').trim()}
              >
                {syncAuthSaving
                  ? (syncAuthMode === 'register' ? 'Création...' : 'Connexion...')
                  : (syncAuthMode === 'register' ? 'Créer le compte' : 'Se connecter')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </section>
  )
}
