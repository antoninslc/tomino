import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const BASE = '/api'

// ── Traductions ────────────────────────────────────────────
const SECTEUR_FR = {
  'Technology': 'Technologie', 'Healthcare': 'Santé', 'Financials': 'Finance',
  'Consumer Cyclical': 'Conso. cyclique', 'Consumer Defensive': 'Conso. défensive',
  'Industrials': 'Industrie', 'Basic Materials': 'Matières premières',
  'Real Estate': 'Immobilier', 'Utilities': 'Services collectivités',
  'Energy': 'Énergie', 'Communication Services': 'Communication',
}
const INDUSTRIE_FR = {
  'Aerospace & Defense': 'Aérospatiale & Défense',
  'Software\u2014Application': 'Logiciels', 'Software\u2014Infrastructure': 'Logiciels infra',
  'Semiconductors': 'Semi-conducteurs', 'Consumer Electronics': 'Électronique grand public',
  'Banks\u2014Diversified': 'Banques', 'Asset Management': "Gestion d'actifs",
  'Insurance\u2014Life': 'Assurance vie', 'Insurance\u2014Diversified': 'Assurance',
  'Drug Manufacturers\u2014General': 'Pharmaceutique', 'Medical Devices': 'Dispositifs médicaux',
  'Biotechnology': 'Biotechnologie', 'Oil & Gas Integrated': 'Pétrole & Gaz',
  'Auto Manufacturers': 'Automobiles', 'Specialty Retail': 'Commerce spécialisé',
  'Internet Retail': 'Commerce en ligne', 'Luxury Goods': 'Luxe',
  'Telecom Services': 'Télécommunications', 'Electric Utilities': 'Électricité',
  'Airlines': 'Compagnies aériennes', 'Capital Markets': 'Marchés de capitaux',
  'Engineering & Construction': 'BTP & Construction', 'Railroads': 'Ferroviaire',
  'Staffing & Employment Services': 'Ressources humaines',
}
const PAYS_FR = {
  'France': 'France', 'United States': 'États-Unis', 'Germany': 'Allemagne',
  'United Kingdom': 'Royaume-Uni', 'Netherlands': 'Pays-Bas', 'Switzerland': 'Suisse',
  'Japan': 'Japon', 'China': 'Chine', 'South Korea': 'Corée du Sud',
  'Canada': 'Canada', 'Australia': 'Australie', 'Italy': 'Italie', 'Spain': 'Espagne',
  'Sweden': 'Suède', 'Denmark': 'Danemark', 'Norway': 'Norvège',
  'Belgium': 'Belgique', 'Ireland': 'Irlande', 'Singapore': 'Singapour',
  'India': 'Inde', 'Brazil': 'Brésil', 'Taiwan': 'Taïwan',
}
const tr = (map, v) => (v && map[v]) || v || ''

// ── Infos métriques (modales détaillées) ──────────────────
const METRIC_INFO = {
  '52w': {
    def: "La fourchette 52 semaines indique le plus bas et le plus haut atteints par le cours sur les 12 derniers mois. C'est un repère rapide pour situer l'action dans son cycle récent.",
    niveaux: [
      { label: 'Près du plus bas', color: '#ff6b6b', desc: "L'action a fortement baissé — possible opportunité ou signe de difficultés structurelles. Investiguer les causes." },
      { label: 'Milieu de fourchette', color: '#718095', desc: "Zone neutre. Pas de signal fort dans un sens ou dans l'autre." },
      { label: 'Près du plus haut', color: '#18c37e', desc: "L'action est en tendance haussière. Attention à ne pas acheter au sommet sans raison fondamentale solide." },
    ],
    exemple: "LVMH (MC.PA) à 580 € alors que son range 52 semaines est 520–720 € : le cours est à 28% du range, plutôt en bas de fourchette malgré des fondamentaux solides.",
  },
  'capitalisation': {
    def: "La capitalisation boursière est la valeur totale de l'entreprise selon le marché : cours × nombre d'actions en circulation. Elle donne une idée de la taille de l'entreprise.",
    niveaux: [
      { label: '< 2 Md€', color: '#ff6b6b', desc: "Small cap : plus volatile, moins liquide, mais potentiel de croissance important. Risque plus élevé." },
      { label: '2–10 Md€', color: '#718095', desc: "Mid cap : bon équilibre entre croissance et stabilité." },
      { label: '> 10 Md€', color: '#18c37e', desc: "Large cap : plus stable, dividendes souvent versés, mais croissance plus lente." },
    ],
    exemple: "Apple dépasse 3 000 Md$ de capitalisation. TotalEnergies est autour de 140 Md€. Une startup cotée peut peser 200 M€.",
  },
  'beta': {
    def: "Le bêta mesure la sensibilité du titre aux mouvements du marché (indice de référence = 1). Un bêta de 1,5 signifie que si le marché monte de 10%, l'action tend à monter de 15% — et inversement.",
    niveaux: [
      { label: 'Bêta < 0,7', color: '#18c37e', desc: "Action défensive : peu corrélée au marché. Idéale en période de turbulences (ex : utilities, pharma)." },
      { label: 'Bêta ≈ 1', color: '#718095', desc: "Suit le marché de près. Ni particulièrement défensif, ni particulièrement agressif." },
      { label: 'Bêta > 1,5', color: '#ff6b6b', desc: "Action très volatile. Peut générer de forts gains ou de fortes pertes selon le contexte." },
    ],
    exemple: "Airbus a un bêta d'environ 1,1. Danone est à 0,5 (défensif). Une biotech early-stage peut afficher 2,5.",
  },
  'pe_trailing': {
    def: "Le P/E trailing (Price-to-Earnings) divise le cours actuel par les bénéfices réels des 12 derniers mois. Il indique combien d'euros vous payez pour 1 € de bénéfice passé. C'est le ratio de valorisation le plus utilisé en bourse.",
    niveaux: [
      { label: '< 12', color: '#18c37e', desc: "Potentiellement sous-évalué ou secteur à faible croissance (banques, industrie lourde)." },
      { label: '12–25', color: '#718095', desc: "Zone normale pour la majorité des entreprises matures." },
      { label: '> 35', color: '#ff6b6b', desc: "Valorisation élevée. Le marché anticipe une forte croissance future — déception possible." },
    ],
    exemple: "Apple trade à un P/E d'environ 28. Pour chaque euro de bénéfice généré, le marché paye 28 €, reflétant son pricing power et la fidélité de son écosystème.",
  },
  'pe_forward': {
    def: "Le P/E forward utilise les bénéfices prévisionnels (consensus analystes) des 12 prochains mois au lieu des bénéfices passés. Il reflète les attentes du marché sur la rentabilité future.",
    niveaux: [
      { label: 'Forward < Trailing', color: '#18c37e', desc: "Les bénéfices sont attendus en hausse. Signal positif si les prévisions sont réalistes." },
      { label: 'Forward ≈ Trailing', color: '#718095', desc: "Croissance stable anticipée, pas de changement majeur attendu." },
      { label: 'Forward > Trailing', color: '#ff6b6b', desc: "Bénéfices attendus en baisse. À surveiller — peut aussi refléter un one-off positif passé." },
    ],
    exemple: "Une entreprise avec P/E trailing 20 et P/E forward 14 signifie que les bénéfices doivent nettement progresser l'an prochain selon les analystes.",
  },
  'peg': {
    def: "Le ratio PEG (Price/Earnings-to-Growth) divise le P/E par le taux de croissance annuel des bénéfices. Il corrige le P/E en tenant compte de la croissance : une entreprise chère peut être justifiée si elle croît vite.",
    niveaux: [
      { label: '< 1', color: '#18c37e', desc: "Action potentiellement sous-évaluée par rapport à sa croissance. Signal d'achat selon Peter Lynch." },
      { label: '1–2', color: '#718095', desc: "Valorisation raisonnable compte tenu de la croissance attendue." },
      { label: '> 2', color: '#ff6b6b', desc: "Cherté élevée : la croissance ne justifie pas forcément le prix payé." },
    ],
    exemple: "Une entreprise avec P/E 30 et croissance bénéficiaire de 30%/an a un PEG de 1 — considéré « juste prix ». Même P/E avec 10%/an de croissance donne un PEG de 3, signe de cherté.",
  },
  'pb': {
    def: "Le ratio Price-to-Book divise le cours par la valeur comptable nette par action (actifs – dettes). Il indique si vous payez plus ou moins que ce que vaudrait l'entreprise si on la liquidait.",
    niveaux: [
      { label: '< 1', color: '#18c37e', desc: "L'action se négocie sous sa valeur nette. Opportunité possible, mais souvent signe de problèmes ou secteur capitalistique (banques)." },
      { label: '1–3', color: '#718095', desc: "Zone normale. La prime reflète les actifs intangibles et les perspectives." },
      { label: '> 5', color: '#ff6b6b', desc: "Très premium : actifs intangibles forts (marque, brevets) ou forte croissance attendue." },
    ],
    exemple: "LVMH a un P/B supérieur à 4 car ses marques de luxe (Louis Vuitton, Dior) ne sont pas comptabilisées à leur vraie valeur dans le bilan.",
  },
  'ps': {
    def: "Le ratio Price-to-Sales divise la capitalisation boursière par le chiffre d'affaires annuel. Particulièrement utile pour les entreprises non rentables (startups, hypercroissance) où le P/E n'a pas de sens.",
    niveaux: [
      { label: '< 1', color: '#18c37e', desc: "On paye moins d'un euro pour chaque euro de CA. Souvent dans des secteurs à faibles marges (distribution)." },
      { label: '1–5', color: '#718095', desc: "Zone courante pour la plupart des secteurs." },
      { label: '> 10', color: '#ff6b6b', desc: "Très élevé. Typique des SaaS et tech en forte croissance — risque en cas de déception sur le CA." },
    ],
    exemple: "Une startup SaaS avec 50 M€ de CA et 600 M€ de capitalisation a un P/S de 12. Microsoft affiche un P/S d'environ 13 pour ses activités cloud.",
  },
  'ev_ebitda': {
    def: "L'EV/EBITDA divise la valeur d'entreprise (capitalisation + dette nette) par l'EBITDA (résultat avant intérêts, impôts, dépréciation). Contrairement au P/E, il est neutre par rapport à la structure de financement et aux politiques comptables.",
    niveaux: [
      { label: '< 8', color: '#18c37e', desc: "Valorisation attractive. Fréquent dans les secteurs industriels, énergie ou lors de sell-offs." },
      { label: '8–15', color: '#718095', desc: "Zone normale pour la majorité des secteurs." },
      { label: '> 20', color: '#ff6b6b', desc: "Premium élevé — justifié par des marges fortes ou une croissance soutenue (tech, luxe)." },
    ],
    exemple: "Airbus trade généralement autour de 12–15x l'EBITDA. LVMH dépasse souvent 18x en raison de ses marges et de sa visibilité long terme.",
  },
  'marge_nette': {
    def: "La marge nette est le pourcentage du chiffre d'affaires qui se transforme en bénéfice net après toutes les charges (exploitation, intérêts, impôts). C'est l'indicateur ultime de rentabilité.",
    niveaux: [
      { label: '< 5%', color: '#ff6b6b', desc: "Marge faible. Distribution, industrie lourde. Peu de coussin en cas de choc." },
      { label: '5–15%', color: '#718095', desc: "Rentabilité correcte. Industrie, services, biens de conso." },
      { label: '> 20%', color: '#18c37e', desc: "Excellent pricing power. Typique du luxe, software, pharma." },
    ],
    exemple: "Apple génère ~25% de marge nette. Carrefour est autour de 1–2%. L'Oréal est à ~15%. Le chiffre a du sens seulement comparé au secteur.",
  },
  'marge_operationnelle': {
    def: "La marge opérationnelle mesure la rentabilité du cœur de métier avant intérêts et impôts. Elle exclut les effets de la dette et de la fiscalité, ce qui la rend idéale pour comparer deux entreprises d'un même secteur.",
    niveaux: [
      { label: '< 5%', color: '#ff6b6b', desc: "Business peu profitable à l'exploitation. Vulnérable aux hausses de coûts." },
      { label: '5–15%', color: '#718095', desc: "Correct pour la plupart des secteurs." },
      { label: '> 20%', color: '#18c37e', desc: "Excellente efficacité opérationnelle. Fort avantage compétitif." },
    ],
    exemple: "Microsoft dépasse 40% de marge opérationnelle grâce à son modèle cloud. Dans la distribution alimentaire, 3–5% est déjà excellent.",
  },
  'marge_brute': {
    def: "La marge brute est le CA moins les coûts directs de production (matières, fabrication), divisé par le CA. Elle révèle la capacité à vendre avec une prime — autrement appelée le \"pricing power\".",
    niveaux: [
      { label: '< 20%', color: '#ff6b6b', desc: "Secteurs à faibles marges : industrie lourde, distribution, commodités." },
      { label: '20–50%', color: '#718095', desc: "Correcte pour de nombreux secteurs manufacturiers et services." },
      { label: '> 60%', color: '#18c37e', desc: "Très élevée. Typique du software (pas de coût de reproduction), pharma, luxe." },
    ],
    exemple: "Hermès dépasse 70% de marge brute. Un éditeur de logiciels SaaS peut atteindre 80%. Une aciérie sera autour de 15–20%.",
  },
  'roe': {
    def: "Le ROE (Return on Equity) mesure ce que l'entreprise génère comme bénéfice pour chaque euro de capitaux propres investis par les actionnaires. C'est l'indicateur de rentabilité privilégié par Warren Buffett.",
    niveaux: [
      { label: '< 8%', color: '#ff6b6b', desc: "Rendement faible. L'entreprise crée peu de valeur pour ses actionnaires." },
      { label: '8–15%', color: '#718095', desc: "Correct. En ligne avec le coût moyen du capital." },
      { label: '> 20%', color: '#18c37e', desc: "Excellent. Signe d'un avantage compétitif durable (moat)." },
    ],
    exemple: "Apple affiche un ROE supérieur à 100% (grâce aux rachats d'actions qui réduisent les capitaux propres). LVMH est autour de 20%. Une banque est autour de 8–10%.",
  },
  'roa': {
    def: "Le ROA (Return on Assets) divise le bénéfice net par le total des actifs. Il mesure l'efficacité avec laquelle l'entreprise utilise l'ensemble de ses ressources, quelle que soit leur source de financement.",
    niveaux: [
      { label: '< 2%', color: '#ff6b6b', desc: "Rentabilité faible des actifs. Typique des banques ou des secteurs très capitalistiques." },
      { label: '2–8%', color: '#718095', desc: "Correct pour la majorité des industries." },
      { label: '> 10%', color: '#18c37e', desc: "Très efficace. L'entreprise génère beaucoup avec peu d'actifs." },
    ],
    exemple: "Une banque comme BNP Paribas a un ROA de 0,5% (actifs énormes). Apple dépasse 25%. Une entreprise industrielle sera autour de 5–7%.",
  },
  'dette_capitaux': {
    def: "Le ratio dette/capitaux propres (D/E) compare la dette nette aux fonds propres. Il mesure le levier financier : plus le ratio est élevé, plus l'entreprise est endettée et vulnérable aux hausses de taux.",
    niveaux: [
      { label: '< 0,5', color: '#18c37e', desc: "Très faible endettement. Bilan solide, résilience en cas de crise." },
      { label: '0,5–1,5', color: '#718095', desc: "Levier raisonnable. Courant dans l'industrie et les services." },
      { label: '> 2', color: '#ff6b6b', desc: "Endettement élevé. Peut amplifier les rendements mais aussi les pertes. Surveiller les charges d'intérêts." },
    ],
    exemple: "Air France-KLM a un D/E très élevé (>5) à cause de la flotte. LVMH est à environ 0,3. Les utilities peuvent être à 1,5–2 de manière structurelle.",
  },
  'current_ratio': {
    def: "Le current ratio divise les actifs courants (stocks, créances, trésorerie) par les passifs courants (dettes à court terme). Il mesure la capacité à honorer les obligations financières dans les 12 prochains mois.",
    niveaux: [
      { label: '< 1', color: '#ff6b6b', desc: "L'entreprise a plus de dettes à court terme que d'actifs liquides. Risque de liquidité si les conditions se dégradent." },
      { label: '1–2', color: '#18c37e', desc: "Zone saine. L'entreprise peut couvrir ses dettes court terme sans stress." },
      { label: '> 3', color: '#718095', desc: "Très liquide, mais peut signifier une mauvaise allocation du cash (actifs sous-utilisés)." },
    ],
    exemple: "Apple maintient un current ratio d'environ 1. Amazon est autour de 1,1. Une entreprise en difficulté peut tomber à 0,7, signalant un risque à surveiller.",
  },
  'croissance_ca': {
    def: "La croissance du chiffre d'affaires (YoY = Year on Year) compare le CA de l'exercice récent à celui de l'année précédente. C'est le premier indicateur de dynamisme commercial d'une entreprise.",
    niveaux: [
      { label: '< 0%', color: '#ff6b6b', desc: "Décroissance. L'entreprise perd des parts de marché ou subit un environnement dégradé." },
      { label: '0–10%', color: '#718095', desc: "Croissance modérée. Normale pour une grande entreprise mature." },
      { label: '> 15%', color: '#18c37e', desc: "Forte croissance. Signe d'expansion, de nouveaux marchés ou de produits porteurs." },
    ],
    exemple: "NVIDIA a affiché +100% de croissance CA en 2024 grâce à l'IA. LVMH croît généralement de 8–12%/an. Carrefour stagne autour de 2–4%.",
  },
  'croissance_benefices': {
    def: "La croissance des bénéfices net (YoY) compare le résultat net récent à celui de l'année précédente. Elle est encore plus parlante que la croissance du CA : une entreprise peut croître en CA tout en détruisant de la valeur.",
    niveaux: [
      { label: '< 0%', color: '#ff6b6b', desc: "Les bénéfices régressent. Pression sur les marges, charges en hausse ou revenus en baisse." },
      { label: '0–10%', color: '#718095', desc: "Progression stable. Cohérente avec une entreprise mature bien gérée." },
      { label: '> 15%', color: '#18c37e', desc: "Forte progression. L'entreprise améliore sa rentabilité, pas seulement son volume." },
    ],
    exemple: "Si une entreprise croît son CA de 10% mais ses bénéfices de 25%, ses marges s'améliorent — signal très positif sur l'efficacité opérationnelle.",
  },
  'rendement_div': {
    def: "Le rendement dividende est le ratio dividende annuel / cours de l'action, exprimé en %. C'est le \"loyer\" que vous touchez pour détenir l'action, indépendamment de la plus-value.",
    niveaux: [
      { label: '0–2%', color: '#718095', desc: "Faible rendement. L'entreprise préfère réinvestir (tech, croissance). Plus-value potentielle plus importante." },
      { label: '2–5%', color: '#18c37e', desc: "Rendement attractif et généralement soutenable. Idéal pour une stratégie revenus." },
      { label: '> 7%', color: '#ff6b6b', desc: "Méfiance : rendement très élevé souvent signe que le cours a chuté ou que le dividende est à risque." },
    ],
    exemple: "TotalEnergies verse environ 5% de rendement. LVMH est autour de 2%. Amazon et Tesla ne versent aucun dividende — ils réinvestissent tout.",
  },
  'dividende_action': {
    def: "Le dividende par action est le montant en cash versé annuellement pour chaque action détenue. Il peut être versé trimestriellement (entreprises US) ou annuellement (entreprises européennes).",
    niveaux: [],
    exemple: "Si vous détenez 100 actions TotalEnergies et que le dividende par action est 3,14 €, vous recevez 314 €/an. À un cours de 60 €, ça correspond à un rendement de 5,2%.",
  },
  'taux_distribution': {
    def: "Le taux de distribution (payout ratio) est la part des bénéfices nets reversée aux actionnaires sous forme de dividendes. Un taux bas signifie que l'entreprise conserve la majeure partie pour réinvestir.",
    niveaux: [
      { label: '< 40%', color: '#18c37e', desc: "Dividende très soutenable. L'entreprise conserve une grande partie pour sa croissance." },
      { label: '40–75%', color: '#718095', desc: "Équilibre sain entre rémunération des actionnaires et autofinancement." },
      { label: '> 100%', color: '#ff6b6b', desc: "L'entreprise distribue plus qu'elle ne gagne. Non soutenable — risque de coupe du dividende." },
    ],
    exemple: "L'Oréal distribue environ 60% de ses bénéfices. Une foncière (REIT) peut distribuer 90%+ car c'est leur obligation légale. Une telecom en difficulté à 120% est un signal d'alarme.",
  },
  'recommandation': {
    def: "La recommandation consensus est la synthèse des avis publiés par les analystes sell-side (brokers, banques) qui suivent le titre. Chaque analyste fixe un objectif de cours et une recommandation — la moyenne donne le consensus.",
    niveaux: [
      { label: 'Achat fort / Achat', color: '#18c37e', desc: "Majorité d'analystes pensent que le cours va monter significativement dans les 12 mois." },
      { label: 'Neutre', color: '#718095', desc: "Le titre est considéré correctement valorisé. Pas de catalyseur fort identifié." },
      { label: 'Vente / Vente forte', color: '#ff6b6b', desc: "Les analystes anticipent une baisse. Rare car les brokers évitent d'émettre des ventes." },
    ],
    exemple: "Apple a souvent 30+ analystes avec 80% d'opinions \"Achat fort\". Un consensus \"Neutre\" sur une valeur comme Danone reflète des perspectives de croissance limitées mais un bilan solide.",
  },
  'objectif_moyen': {
    def: "L'objectif de cours moyen est la moyenne pondérée des prix cibles fixés par les analystes pour les 12 prochains mois. Le potentiel affiché est simplement : (objectif – cours actuel) / cours actuel.",
    niveaux: [],
    exemple: "Si le cours est 100 € et l'objectif moyen est 125 €, le potentiel affiché est +25%. Les fourchettes bas/haut montrent le degré de divergence entre analystes : une fourchette large = grande incertitude.",
  },
}

// ── Persistance inter-navigation ───────────────────────────
const _store = { data: null, chatMessages: [], currentTicker: '' }

// ── Formatters ─────────────────────────────────────────────
const fmtEur = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const fmtPct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, style: 'percent' })
const fmtGrand = (v) => {
  if (v == null) return '—'
  if (v >= 1e12) return (v / 1e12).toFixed(1) + '\u00a0T'
  if (v >= 1e9) return (v / 1e9).toFixed(1) + '\u00a0Md'
  if (v >= 1e6) return (v / 1e6).toFixed(0) + '\u00a0M'
  return fmtEur.format(v)
}
function val(v, suffix = '') {
  if (v == null) return '—'
  return fmtEur.format(v) + suffix
}
function pct(v) {
  if (v == null) return '—'
  return fmtPct.format(v)
}
function signColor(v) {
  if (v == null) return 'var(--text)'
  return v >= 0 ? 'var(--green)' : 'var(--red)'
}

// PEG : afficher 2 décimales, pas de formatage monétaire
function valRatio(v) {
  if (v == null || v <= 0) return '—'
  return v.toFixed(2)
}

// ── Exemple dynamique depuis les données réelles ───────────
function buildLiveExample(metricKey, d) {
  if (!d) return null
  const nom = d.nom_court || d.ticker
  const devise = d.devise || '€'
  const n2 = (v) => v != null ? fmtEur.format(v) : null
  const p1 = (v) => v != null ? fmtPct.format(v) : null

  switch (metricKey) {
    case 'pe_trailing':
      if (d.pe_trailing == null) return null
      return `${nom} affiche un P/E trailing de ${n2(d.pe_trailing)}. Pour chaque ${devise} de bénéfice généré sur les 12 derniers mois, le marché paye ${n2(d.pe_trailing)} ${devise}.`
    case 'pe_forward':
      if (d.pe_forward == null) return null
      return `${nom} affiche un P/E forward de ${n2(d.pe_forward)}${d.pe_trailing != null ? `, contre un P/E trailing de ${n2(d.pe_trailing)}` : ''}. ${d.pe_forward != null && d.pe_trailing != null ? (d.pe_forward < d.pe_trailing ? 'Le forward inférieur au trailing suggère une hausse des bénéfices attendue.' : d.pe_forward > d.pe_trailing ? 'Le forward supérieur au trailing signale des bénéfices attendus en baisse.' : 'Les deux ratios sont proches : croissance stable anticipée.') : ''}`
    case 'peg':
      if (d.peg == null || d.peg <= 0) return null
      return `${nom} a un PEG de ${d.peg.toFixed(2)}. ${d.peg < 1 ? 'En dessous de 1 : la croissance bénéficiaire justifie la valorisation — signal potentiellement attractif.' : d.peg <= 2 ? 'Entre 1 et 2 : valorisation raisonnable au regard de la croissance attendue.' : 'Au-dessus de 2 : la valorisation est élevée par rapport à la croissance anticipée.'}`
    case 'pb':
      if (d.pb == null) return null
      return `${nom} se négocie à ${n2(d.pb)}x sa valeur comptable. ${d.pb < 1 ? "L'action est valorisée sous sa valeur nette d'actif." : d.pb < 3 ? 'La prime reflète les actifs intangibles et les perspectives.' : 'La prime élevée traduit un fort avantage compétitif ou des attentes de croissance importantes.'}`
    case 'ps':
      if (d.ps == null) return null
      return `${nom} affiche un P/S de ${n2(d.ps)}. ${d.ps < 1 ? "On paye moins d'un euro pour chaque euro de chiffre d'affaires." : d.ps < 5 ? "Valorisation courante pour ce type d'activité." : "Ratio élevé : le marché anticipe une forte croissance du CA ou des marges futures."}`
    case 'ev_ebitda':
      if (d.ev_ebitda == null) return null
      return `${nom} traite à ${n2(d.ev_ebitda)}x l'EBITDA. ${d.ev_ebitda < 8 ? 'Valorisation attractive sur ce critère.' : d.ev_ebitda < 15 ? 'Dans la moyenne pour la plupart des secteurs.' : 'Premium élevé — justifié par des marges fortes ou une croissance soutenue.'}`
    case 'marge_nette':
      if (d.marge_nette == null) return null
      return `${nom} transforme ${p1(d.marge_nette)} de son chiffre d'affaires en bénéfice net. ${d.marge_nette < 0.05 ? 'Marge faible : peu de coussin face aux chocs.' : d.marge_nette < 0.15 ? 'Rentabilité correcte.' : 'Excellent pricing power.'}`
    case 'marge_operationnelle':
      if (d.marge_operationnelle == null) return null
      return `La marge opérationnelle de ${nom} est de ${p1(d.marge_operationnelle)}, avant intérêts et impôts.`
    case 'marge_brute':
      if (d.marge_brute == null) return null
      return `${nom} conserve ${p1(d.marge_brute)} de son CA après les coûts directs de production. ${d.marge_brute > 0.6 ? 'Marge brute très élevée — fort pricing power.' : d.marge_brute > 0.3 ? 'Marge correcte.' : 'Secteur à faibles marges brutes.'}`
    case 'roe':
      if (d.roe == null) return null
      return `${nom} génère ${p1(d.roe)} de bénéfice pour chaque euro de capitaux propres. ${d.roe > 0.2 ? 'Excellent — signe probable d\'un avantage compétitif durable.' : d.roe > 0.08 ? 'Correct, en ligne avec le coût du capital.' : 'Rendement faible pour les actionnaires.'}`
    case 'roa':
      if (d.roa == null) return null
      return `${nom} génère ${p1(d.roa)} de bénéfice pour chaque euro d'actif total. ${d.roa > 0.1 ? 'Très efficace dans l\'utilisation de ses actifs.' : d.roa > 0.02 ? 'Dans la moyenne.' : 'Secteur capitalistique ou rentabilité des actifs faible.'}`
    case 'dette_capitaux':
      if (d.dette_capitaux == null) return null
      return `${nom} a un ratio dette/capitaux de ${n2(d.dette_capitaux)}. ${d.dette_capitaux < 0.5 ? 'Bilan très solide, faible endettement.' : d.dette_capitaux < 1.5 ? 'Levier raisonnable.' : 'Endettement élevé — surveiller les charges d\'intérêts.'}`
    case 'current_ratio':
      if (d.current_ratio == null) return null
      return `${nom} a un current ratio de ${n2(d.current_ratio)}. ${d.current_ratio >= 1 ? "L'entreprise peut couvrir ses obligations à court terme." : "Les passifs courants dépassent les actifs courants — risque de liquidité à surveiller."}`
    case 'croissance_ca':
      if (d.croissance_ca == null) return null
      return `${nom} a fait croître son chiffre d'affaires de ${p1(d.croissance_ca)} sur un an. ${d.croissance_ca < 0 ? 'Recul du CA — perte de parts de marché ou environnement dégradé.' : d.croissance_ca < 0.1 ? 'Croissance modérée, typique d\'une entreprise mature.' : 'Forte croissance commerciale.'}`
    case 'croissance_benefices':
      if (d.croissance_benefices == null) return null
      return `Les bénéfices de ${nom} ont évolué de ${p1(d.croissance_benefices)} sur un an.${d.croissance_ca != null ? ` La croissance du CA est de ${p1(d.croissance_ca)}${d.croissance_benefices > d.croissance_ca ? ' — les marges s\'améliorent.' : d.croissance_benefices < d.croissance_ca ? ' — les marges se compriment.' : '.'}` : ''}`
    case 'rendement_div':
      if (d.rendement_div == null || d.rendement_div === 0) return null
      return `${nom} verse un rendement de ${p1(d.rendement_div)}${d.dividende_par_action != null ? ` soit ${n2(d.dividende_par_action)} ${devise} par action` : ''}. ${d.rendement_div > 0.07 ? 'Rendement très élevé — vérifier la soutenabilité du dividende.' : d.rendement_div > 0.03 ? 'Rendement attractif.' : 'Rendement modéré, entreprise qui préfère réinvestir.'}`
    case 'dividende_action':
      if (d.dividende_par_action == null) return null
      return `${nom} verse ${n2(d.dividende_par_action)} ${devise} par action par an${d.cours != null ? ` (cours actuel : ${n2(d.cours)} ${devise}, soit un rendement de ${(d.dividende_par_action / d.cours * 100).toFixed(1)} %)` : ''}.`
    case 'taux_distribution':
      if (d.taux_distribution == null) return null
      return `${nom} redistribue ${p1(d.taux_distribution)} de ses bénéfices en dividendes. ${d.taux_distribution > 1 ? 'Supérieur à 100 % — non soutenable à terme, dividende potentiellement à risque.' : d.taux_distribution > 0.75 ? 'Taux élevé, peu de marge de manoeuvre pour réinvestir.' : d.taux_distribution > 0.4 ? 'Équilibre sain entre dividende et réinvestissement.' : 'Dividende prudent, l\'entreprise conserve l\'essentiel pour croître.'}`
    case 'beta':
      if (d.beta == null) return null
      return `${nom} a un bêta de ${n2(d.beta)}. ${d.beta > 1.5 ? 'Action très volatile : elle amplifie les mouvements du marché.' : d.beta > 0.9 ? 'Comportement proche du marché global.' : 'Action défensive : amortit les corrections du marché.'}`
    case 'capitalisation':
      if (d.capitalisation == null) return null
      return `${nom} pèse ${fmtGrand(d.capitalisation)} ${devise} en bourse. ${d.capitalisation > 1e11 ? 'Large cap : stabilité et liquidité élevées.' : d.capitalisation > 1e10 ? 'Mid-to-large cap.' : d.capitalisation > 2e9 ? 'Mid cap.' : 'Small cap : plus volatile, mais potentiel de croissance important.'}`
    case '52w':
      if (d.cours == null || d.cours_52w_bas == null || d.cours_52w_haut == null) return null
      { const pos = Math.round(((d.cours - d.cours_52w_bas) / (d.cours_52w_haut - d.cours_52w_bas)) * 100)
        return `${nom} cote ${n2(d.cours)} ${devise}, dans une fourchette 52 semaines de ${n2(d.cours_52w_bas)} à ${n2(d.cours_52w_haut)}. Le cours actuel se situe à ${pos} % du range — ${pos < 25 ? 'proche du bas de fourchette.' : pos > 75 ? 'proche du sommet annuel.' : 'en milieu de fourchette.'}` }
    case 'recommandation': {
      if (!d.recommandation) return null
      const labels = { strong_buy: 'Achat fort', buy: 'Achat', hold: 'Neutre', sell: 'Vente', strong_sell: 'Vente forte' }
      const c = d.consensus
      return `Le consensus sur ${nom} est "${labels[d.recommandation] || d.recommandation}"${d.nb_analystes ? ` (${d.nb_analystes} analystes)` : ''}. ${c && c.strong_buy > 0 ? `${c.strong_buy} Achat fort, ` : ''}${c && c.buy > 0 ? `${c.buy} Achat, ` : ''}${c && c.hold > 0 ? `${c.hold} Neutre` : ''}`.replace(/, $/, '') + '.'
    }
    case 'objectif_moyen':
      if (d.objectif_moyen == null || d.cours == null) return null
      { const potentiel = ((d.objectif_moyen / d.cours - 1) * 100).toFixed(1)
        return `L'objectif moyen des analystes sur ${nom} est ${n2(d.objectif_moyen)} ${devise}, soit un potentiel de ${potentiel > 0 ? '+' : ''}${potentiel} % par rapport au cours actuel de ${n2(d.cours)} ${devise}${d.objectif_bas != null && d.objectif_haut != null ? `. Fourchette : ${n2(d.objectif_bas)} – ${n2(d.objectif_haut)} ${devise}.` : '.'}` }
    default:
      return null
  }
}

// ── Composants ─────────────────────────────────────────────

function MetricModal({ label, info, metricKey, stockData, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 500,
          background: 'linear-gradient(180deg, rgba(24,28,34,0.98) 0%, rgba(16,19,24,0.98) 100%)',
          border: '1px solid var(--line-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* En-tete */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 16px',
          borderBottom: '1px solid var(--line)',
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: '.62rem',
            color: 'var(--green)', letterSpacing: '.16em', textTransform: 'uppercase',
          }}>
            {label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost"
            style={{ padding: '4px 10px', fontSize: '.75rem', borderRadius: 8 }}
          >
            Fermer
          </button>
        </div>

        <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Definition */}
          <div>
            <div className="card-label" style={{ marginBottom: 10 }}>Definition</div>
            <p style={{ margin: 0, fontSize: '.85rem', lineHeight: 1.75, color: 'var(--text-2)' }}>
              {info.def}
            </p>
          </div>

          {/* Niveaux */}
          {info.niveaux && info.niveaux.length > 0 && (
            <div>
              <div className="card-label" style={{ marginBottom: 12 }}>Comment l&apos;interpreter</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {info.niveaux.map((n) => (
                  <div key={n.label} style={{
                    display: 'flex', gap: 14, alignItems: 'baseline',
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.025)',
                    borderRadius: 12,
                    borderLeft: `2px solid ${n.color}`,
                  }}>
                    <span style={{
                      fontFamily: 'var(--mono)', fontSize: '.68rem', fontWeight: 700,
                      color: n.color, flexShrink: 0, minWidth: 56,
                    }}>
                      {n.label}
                    </span>
                    <span style={{ fontSize: '.82rem', lineHeight: 1.6, color: 'var(--text-2)' }}>
                      {n.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exemple — dynamique si data dispo, statique sinon */}
          {(() => {
            const live = buildLiveExample(metricKey, stockData)
            const text = live || info.exemple
            if (!text) return null
            return (
              <div style={{
                padding: '14px 16px',
                background: live ? 'var(--green-soft)' : 'rgba(255,255,255,0.03)',
                borderRadius: 12,
                border: live ? '1px solid rgba(24,195,126,0.18)' : '1px solid var(--line)',
              }}>
                <div className="card-label" style={{ marginBottom: 8, color: live ? 'var(--green)' : 'var(--text-3)' }}>
                  {live ? stockData?.nom_court || stockData?.ticker || 'Exemple' : 'Exemple illustratif'}
                </div>
                <p style={{ margin: 0, fontSize: '.82rem', lineHeight: 1.7, color: 'var(--text-2)' }}>
                  {text}
                </p>
              </div>
            )
          })()}
        </div>
      </div>
    </div>,
    document.body
  )
}

function Stat({ label, value, color, infoKey, stockData }) {
  const [modalOpen, setModalOpen] = useState(false)
  const info = infoKey ? METRIC_INFO[infoKey] : null
  return (
    <div className="stat">
      <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {info && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.25)',
              padding: '0 2px', fontSize: '.88rem', lineHeight: 1,
              transition: 'color .15s', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--green)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
          >
            &#9432;
          </button>
        )}
      </div>
      <div className="stat-value" style={{ color: color || 'var(--text)', fontSize: '1.1rem' }}>{value}</div>
      {modalOpen && info && (
        <MetricModal
          label={label}
          info={info}
          metricKey={infoKey}
          stockData={stockData}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

function RecoBar({ consensus }) {
  if (!consensus || !consensus.total) return null
  const { strong_buy, buy, hold, sell, strong_sell } = consensus
  const segments = [
    { count: strong_buy, color: '#16a34a', label: 'Achat fort' },
    { count: buy, color: '#18c37e', label: 'Achat' },
    { count: hold, color: '#718095', label: 'Neutre' },
    { count: sell, color: '#ff6b6b', label: 'Vente' },
    { count: strong_sell, color: '#dc2626', label: 'Vente forte' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', gap: 2, marginBottom: 8 }}>
        {segments.map((s) =>
          s.count > 0 ? (
            <div key={s.label} style={{ flex: s.count, background: s.color, minWidth: 4 }} title={`${s.label} : ${s.count}`} />
          ) : null
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {segments.map((s) =>
          s.count > 0 ? (
            <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.72rem', color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
              {s.label} ({s.count})
            </span>
          ) : null
        )}
      </div>
    </div>
  )
}

function TargetRange({ bas, moyen, haut, cours }) {
  if (!bas || !haut || !cours) return null
  const min = Math.min(bas, cours) * 0.97
  const max = Math.max(haut, cours) * 1.03
  const range = max - min
  const pos = (v) => ((v - min) / range) * 100
  return (
    <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 4, margin: '16px 0 8px' }}>
      <div style={{
        position: 'absolute', left: pos(bas) + '%', width: (pos(haut) - pos(bas)) + '%',
        height: '100%', background: 'rgba(74,222,128,0.25)', borderRadius: 4,
      }} />
      {moyen && (
        <div style={{ position: 'absolute', left: pos(moyen) + '%', top: -3, width: 2, height: 12, background: 'var(--green)', borderRadius: 1, transform: 'translateX(-50%)' }} title={'Objectif moyen : ' + moyen} />
      )}
      <div style={{ position: 'absolute', left: pos(cours) + '%', top: -4, width: 10, height: 14, background: 'var(--text)', borderRadius: 2, transform: 'translateX(-50%)', border: '1px solid rgba(255,255,255,0.3)' }} title={'Cours actuel : ' + cours} />
    </div>
  )
}

// ── Hook chat streamé ──────────────────────────────────────

function useStreamingChat() {
  const [messages, setMessages] = useState(() => _store.chatMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef(null)
  const bottomRef = useRef(null)
  const convIdRef = useRef(crypto.randomUUID())

  useEffect(() => {
    _store.chatMessages = messages
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(stockData) {
    const content = input.trim()
    if (!content || sending) return
    setError('')
    setInput('')
    setSending(true)

    const next = [...messages, { role: 'user', content }, { role: 'assistant', content: '' }]
    setMessages(next)

    try {
      abortRef.current = new AbortController()
      const res = await fetch(`${BASE}/stock/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({ messages: next.slice(0, -1), stock_data: stockData, conv_id: convIdRef.current }),
      })

      if (!res.ok || !res.body) {
        const txt = await res.text()
        let msg = 'Erreur du serveur'
        try { msg = JSON.parse(txt)?.erreur || msg } catch {}
        throw new Error(msg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() || ''

        for (const chunk of chunks) {
          for (const line of chunk.split('\n').map((l) => l.trim()).filter(Boolean)) {
            if (!line.startsWith('data:')) continue
            let data
            try { data = JSON.parse(line.replace(/^data:\s*/, '')) } catch { continue }
            if (data.done) { setSending(false); continue }
            if (typeof data.delta === 'string') {
              setMessages((prev) => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: updated[updated.length - 1].content + data.delta }
                return updated
              })
            }
          }
        }
        if (done) break
      }
    } catch (e) {
      if (e?.name !== 'AbortError') setError(e?.message || 'Erreur de connexion')
      setSending(false)
    }
  }

  return { messages, input, setInput, sending, send, error, bottomRef }
}

// ── Composant FloatingChat ─────────────────────────────────

function FloatingChat({ stockData, open, onToggle }) {
  const { messages, input, setInput, sending, send, error, bottomRef } = useStreamingChat()

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(stockData) }
  }

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={open ? 'btn btn-ghost' : 'btn btn-primary'}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 600,
          borderRadius: 24, padding: '10px 20px',
          fontWeight: 600, fontSize: '.85rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
          gap: 8,
        }}
      >
        {open ? (
          <>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1.5 2.5C1.5 1.95 1.95 1.5 2.5 1.5H12.5C13.05 1.5 13.5 1.95 13.5 2.5V9.5C13.5 10.05 13.05 10.5 12.5 10.5H5L2 13.5V10.5H2.5C1.95 10.5 1.5 10.05 1.5 9.5V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M4.5 5.5H10.5M4.5 7.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Fermer le chat
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M1.5 2.5C1.5 1.95 1.95 1.5 2.5 1.5H12.5C13.05 1.5 13.5 1.95 13.5 2.5V9.5C13.5 10.05 13.05 10.5 12.5 10.5H5L2 13.5V10.5H2.5C1.95 10.5 1.5 10.05 1.5 9.5V2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M4.5 5.5H10.5M4.5 7.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Demander à Tomino
          </>
        )}
      </button>

      <div style={{
        position: 'fixed', bottom: 76, right: 24, zIndex: 599,
        width: '40vw', height: '40vh',
        background: '#1a1d22',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16,
        boxShadow: '0 8px 48px rgba(0,0,0,0.65)',
        display: open ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '10px 16px', flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--text-3)',
        }}>
          Discussion avec Grok &mdash; {stockData?.nom_court || stockData?.ticker}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: '.8rem', fontFamily: 'var(--mono)', margin: 0 }}>
              Posez une question sur {stockData?.nom || stockData?.ticker}&hellip;
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8 }}>
              <div style={{
                maxWidth: '85%', padding: '8px 12px', fontSize: '.82rem', lineHeight: 1.55,
                borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                background: m.role === 'user' ? 'rgba(24,195,126,0.13)' : 'rgba(255,255,255,0.05)',
                border: '1px solid',
                borderColor: m.role === 'user' ? 'rgba(24,195,126,0.22)' : 'rgba(255,255,255,0.07)',
                color: 'var(--text)',
              }}>
                {m.role === 'assistant' ? (
                  <div className="prose-ai" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(m.content || (sending ? '…' : ''))) }} />
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div style={{ padding: '4px 14px', fontSize: '.74rem', color: 'var(--red)', fontFamily: 'var(--mono)', flexShrink: 0 }}>{error}</div>
        )}

        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          padding: '10px 12px', borderTop: '1px solid var(--line)',
          background: 'rgba(12,15,20,0.92)', backdropFilter: 'blur(10px)',
          flexShrink: 0,
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={sending}
            rows={1}
            placeholder="Votre question…"
            className="form-input"
            style={{ flex: 1, resize: 'none', overflow: 'hidden', minHeight: 42, maxHeight: 120 }}
          />
          <button
            type="button"
            onClick={() => send(stockData)}
            disabled={sending || !input.trim()}
            className="btn btn-primary"
            style={{ height: 42, minWidth: 88, alignSelf: 'flex-end', flexShrink: 0 }}
          >
            {sending ? '…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Page principale ────────────────────────────────────────

export default function StockAnalyse() {
  const [query, setQuery] = useState(() => {
    const d = _store.data
    return d ? `${d.nom_court || d.nom} (${d.ticker})` : ''
  })
  const [suggestions, setSuggestions] = useState([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [ticker, setTicker] = useState(() => _store.currentTicker)
  const [data, setData] = useState(() => _store.data)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDesc, setShowDesc] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const suggestRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    _store.data = data
  }, [data])

  useEffect(() => {
    function onDown(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target)) setSuggestions([])
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query || query.length < 2) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true)
      try {
        const res = await fetch(`${BASE}/stock/search?q=${encodeURIComponent(query)}`)
        const json = await res.json()
        setSuggestions(Array.isArray(json) ? json : [])
      } catch { setSuggestions([]) }
      finally { setLoadingSuggestions(false) }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  async function loadStock(t, force = false) {
    setSuggestions([])
    const isNewTicker = t !== _store.currentTicker
    if (isNewTicker) {
      _store.chatMessages = []
      _store.currentTicker = t
    }
    setTicker(t)
    setData(null)
    setError('')
    setShowDesc(false)
    if (isNewTicker) setChatOpen(false)
    setLoading(true)
    try {
      const url = force
        ? `${BASE}/stock/${encodeURIComponent(t)}?force=1`
        : `${BASE}/stock/${encodeURIComponent(t)}`
      const res = await fetch(url)
      const json = await res.json()
      if (!json.ok) throw new Error(json.erreur || 'Données introuvables')
      _store.data = json
      setData(json)
    } catch (e) {
      setError(e?.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  function selectSuggestion(s) {
    setQuery(s.nom ? `${s.nom} (${s.ticker})` : s.ticker)
    loadStock(s.ticker)
  }

  function onSearchKey(e) {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        selectSuggestion(suggestions[0])
      } else {
        const t = query.trim().split(' ')[0].toUpperCase()
        if (t) loadStock(t)
      }
    }
  }

  const d = data

  const pos52w = d?.cours && d?.cours_52w_bas && d?.cours_52w_haut
    ? Math.round(((d.cours - d.cours_52w_bas) / (d.cours_52w_haut - d.cours_52w_bas)) * 100)
    : null

  const recoLabel = {
    'strong_buy': 'Achat fort', 'buy': 'Achat', 'hold': 'Neutre',
    'sell': 'Vente', 'strong_sell': 'Vente forte',
  }

  return (
    <section>
      <section className="hero-strip fade-up">
        <div className="hero-copy">
          <div className="hero-kicker">Tomino Intelligence</div>
          <h1 className="hero-title" style={{ maxWidth: 'none' }}>Analyse d&apos;action.</h1>
          <p className="hero-subtitle">
            Données fondamentales, momentum et consensus analystes. Discutez ensuite avec Grok.
          </p>
        </div>
      </section>

      {/* Barre de recherche */}
      <div ref={suggestRef} className="fade-up" style={{ position: 'relative', zIndex: 100, maxWidth: 560, marginBottom: 32 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              className="form-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Rechercher une action — nom ou ticker (ex : LVMH, AAPL, MC.PA)"
              style={{ paddingRight: 48, fontSize: '.9rem', width: '100%' }}
              autoComplete="off"
            />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: '.75rem', fontFamily: 'var(--mono)' }}>
              {loadingSuggestions ? '...' : '⏎'}
            </span>
          </div>

          {ticker && (
            <button
              type="button"
              onClick={() => loadStock(ticker, true)}
              disabled={loading}
              title="Rafraîchir les données"
              style={{
                background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '0 10px', height: 42,
                color: 'var(--text-3)', cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'color .15s, border-color .15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.5 7A5.5 5.5 0 1 1 7 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M7 1.5L9.5 4L12 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
            background: '#1a1d22', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, zIndex: 1000, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden',
          }}>
            {suggestions.map((s) => (
              <button
                key={s.ticker}
                type="button"
                onClick={() => selectSuggestion(s)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '10px 14px', background: 'transparent',
                  border: 0, color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
                  fontSize: '.875rem', gap: 12,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span>
                  <span style={{ fontWeight: 600 }}>{s.ticker}</span>
                  {s.nom && s.nom !== s.ticker && (
                    <span style={{ color: 'var(--text-2)', marginLeft: 8, fontSize: '.8rem' }}>{s.nom}</span>
                  )}
                </span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: '.7rem', color: 'var(--text-3)', flexShrink: 0 }}>
                  {s.exchange}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && (
        <p style={{ color: 'var(--text-3)', fontSize: '.85rem', fontFamily: 'var(--mono)', padding: '12px 0' }}>
          Chargement des données...
        </p>
      )}

      {error && (
        <div style={{ color: 'var(--red)', fontSize: '.85rem', fontFamily: 'var(--mono)', marginBottom: 24 }}>
          {error}
        </div>
      )}

      {d && (
        <>
          {/* Identité */}
          <div className="card fade-up" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{d.nom}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                  {d.ticker} &middot; {d.exchange} &middot; {d.devise}
                  {d.secteur && <> &middot; {tr(SECTEUR_FR, d.secteur)}</>}
                  {d.industrie && <> &middot; {tr(INDUSTRIE_FR, d.industrie)}</>}
                  {d.pays && <> &middot; {tr(PAYS_FR, d.pays)}</>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' }}>
                  {val(d.cours)} <span style={{ fontSize: '.8rem', color: 'var(--text-3)' }}>{d.devise}</span>
                </div>
                <div style={{ fontSize: '.82rem', fontFamily: 'var(--mono)', color: signColor(d.variation_jour), marginTop: 2 }}>
                  {d.variation_jour != null ? (d.variation_jour >= 0 ? '+' : '') + pct(d.variation_jour) : ''}
                </div>
              </div>
            </div>

            {d.description && (
              <>
                <p style={{ fontSize: '.82rem', color: 'var(--text-2)', lineHeight: 1.65, margin: 0 }}>
                  {showDesc ? d.description : d.description.slice(0, 280) + (d.description.length > 280 ? '…' : '')}
                </p>
                {d.description.length > 280 && (
                  <button
                    type="button"
                    onClick={() => setShowDesc((v) => !v)}
                    style={{ background: 'none', border: 'none', color: 'var(--green)', fontSize: '.78rem', cursor: 'pointer', marginTop: 6, padding: 0, fontFamily: 'var(--mono)' }}
                  >
                    {showDesc ? 'Voir moins' : 'Voir plus'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Cours & Marché */}
          <div className="g3 fade-up" style={{ marginBottom: 20 }}>
            <Stat
              label="52 semaines"
              value={`${val(d.cours_52w_bas)} — ${val(d.cours_52w_haut)}`}
              infoKey="52w" stockData={d}
            />
            {!d.source_limitee && (
              <>
                <Stat label="Capitalisation" value={fmtGrand(d.capitalisation)} infoKey="capitalisation" stockData={d} />
                <Stat
                  label="Bêta"
                  value={val(d.beta)}
                  color={d.beta != null ? (d.beta > 1.5 ? 'var(--red)' : d.beta < 0.7 ? 'var(--green)' : 'var(--text)') : 'var(--text)'}
                  infoKey="beta" stockData={d}
                />
              </>
            )}
          </div>

          {d.source_limitee && (
            <div className="fade-up" style={{
              background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ color: '#eab308', fontSize: '1rem', flexShrink: 0 }}>&#9888;</span>
              <span style={{ fontSize: '.82rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                Données fondamentales indisponibles pour cette action.
                Cours et fourchette 52&nbsp;semaines disponibles. Le chat Grok peut compléter l&apos;analyse.
              </span>
            </div>
          )}

          {!d.source_limitee && (
            <>
              {/* Valorisation */}
              <div className="card fade-up" style={{ marginBottom: 20 }}>
                <div className="card-label" style={{ marginBottom: 16 }}>Valorisation</div>
                <div className="g3">
                  <Stat label="P/E (trailing)" value={val(d.pe_trailing)} infoKey="pe_trailing" stockData={d} />
                  <Stat label="P/E (forward)" value={val(d.pe_forward)} infoKey="pe_forward" stockData={d} />
                  <Stat label="PEG" value={valRatio(d.peg)} infoKey="peg" stockData={d} />
                  <Stat label="P/B" value={val(d.pb)} infoKey="pb" stockData={d} />
                  <Stat label="P/S" value={val(d.ps)} infoKey="ps" stockData={d} />
                  <Stat label="EV/EBITDA" value={val(d.ev_ebitda)} infoKey="ev_ebitda" stockData={d} />
                </div>
              </div>

              {/* Santé financière */}
              <div className="card fade-up" style={{ marginBottom: 20 }}>
                <div className="card-label" style={{ marginBottom: 16 }}>Santé financière</div>
                <div className="g3">
                  <Stat label="Marge nette" value={pct(d.marge_nette)} color={signColor(d.marge_nette)} infoKey="marge_nette" stockData={d} />
                  <Stat label="Marge opérationnelle" value={pct(d.marge_operationnelle)} color={signColor(d.marge_operationnelle)} infoKey="marge_operationnelle" stockData={d} />
                  <Stat label="Marge brute" value={pct(d.marge_brute)} color={signColor(d.marge_brute)} infoKey="marge_brute" stockData={d} />
                  <Stat label="ROE" value={pct(d.roe)} color={signColor(d.roe)} infoKey="roe" stockData={d} />
                  <Stat label="ROA" value={pct(d.roa)} color={signColor(d.roa)} infoKey="roa" stockData={d} />
                  <Stat label="Dette / Capitaux" value={val(d.dette_capitaux)} infoKey="dette_capitaux" stockData={d} />
                  <Stat label="Current ratio" value={val(d.current_ratio)} infoKey="current_ratio" stockData={d} />
                  <Stat label="Croissance CA" value={pct(d.croissance_ca)} color={signColor(d.croissance_ca)} infoKey="croissance_ca" stockData={d} />
                  <Stat label="Croissance bénéfices" value={pct(d.croissance_benefices)} color={signColor(d.croissance_benefices)} infoKey="croissance_benefices" stockData={d} />
                </div>
              </div>

              {/* Dividende */}
              {(d.rendement_div != null || d.dividende_par_action != null) && (
                <div className="g3 fade-up" style={{ marginBottom: 20 }}>
                  <Stat label="Rendement dividende" value={pct(d.rendement_div)} color={d.rendement_div > 0 ? 'var(--green)' : 'var(--text)'} infoKey="rendement_div" stockData={d} />
                  <Stat label="Dividende / action" value={val(d.dividende_par_action, ' ' + (d.devise || ''))} infoKey="dividende_action" stockData={d} />
                  <Stat label="Taux de distribution" value={pct(d.taux_distribution)} infoKey="taux_distribution" stockData={d} />
                </div>
              )}

              {/* Consensus analystes */}
              <div className="card fade-up" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                  <div className="card-label" style={{ marginBottom: 0 }}>Consensus analystes</div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '.72rem', color: 'var(--text-3)' }}>
                    {d.nb_analystes ? `${d.nb_analystes} analyste(s)` : ''}
                  </span>
                </div>

                <div className="g3" style={{ marginBottom: 20 }}>
                  <Stat
                    label="Recommandation"
                    value={recoLabel[d.recommandation] || d.recommandation || '—'}
                    color={
                      d.recommandation?.includes('buy') ? 'var(--green)' :
                      d.recommandation?.includes('sell') ? 'var(--red)' :
                      'var(--text)'
                    }
                    infoKey="recommandation" stockData={d}
                  />
                  <Stat label="Objectif moyen" value={val(d.objectif_moyen, ' ' + (d.devise || ''))} infoKey="objectif_moyen" stockData={d} />
                  <Stat
                    label="Potentiel"
                    value={d.cours && d.objectif_moyen ? ((d.objectif_moyen / d.cours - 1) >= 0 ? '+' : '') + ((d.objectif_moyen / d.cours - 1) * 100).toFixed(1) + '%' : '—'}
                    color={d.cours && d.objectif_moyen ? signColor(d.objectif_moyen - d.cours) : 'var(--text)'}
                  />
                </div>

                <TargetRange bas={d.objectif_bas} moyen={d.objectif_moyen} haut={d.objectif_haut} cours={d.cours} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', fontFamily: 'var(--mono)', color: 'var(--text-3)', marginBottom: 16 }}>
                  <span>Bas : {val(d.objectif_bas)}</span>
                  <span>Haut : {val(d.objectif_haut)}</span>
                </div>

                {d.consensus && <RecoBar consensus={d.consensus} />}
              </div>
            </>
          )}
        </>
      )}

      {d && <FloatingChat stockData={d} open={chatOpen} onToggle={() => setChatOpen(v => !v)} />}
    </section>
  )
}
