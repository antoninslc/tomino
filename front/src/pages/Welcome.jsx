import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Welcome() {
  const navigate = useNavigate()
  const [loadingDemo, setLoadingDemo] = useState(false)

  const handleStartDemo = async () => {
    try {
      setLoadingDemo(true)
      await api.post('/demo/inject')
      window.location.href = '/' // hard reload
    } catch (err) {
      console.error(err)
      setLoadingDemo(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg text-text p-8 flex flex-col items-center justify-center">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">Bienvenue sur Tomino</h1>
          <p className="text-text2 text-xl max-w-2xl mx-auto">
            Votre superviseur de patrimoine garantissant 100% de souveraineté sur vos données financières.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Option 1: Nouveau profil */}
          <div 
            className="card p-8 flex flex-col h-full cursor-pointer hover:-translate-y-1 transition-transform hover:shadow-lg border border-transparent hover:border-gold"
            onClick={() => navigate('/onboarding')}
          >
            <h2 className="text-2xl font-bold mb-4">Créer mon espace</h2>
            <p className="text-text2 mb-8 flex-grow leading-relaxed">
              Démarrez de zéro en configurant votre profil d'investisseur unique au travers d'un court questionnaire.
            </p>
            <div className="text-base font-semibold text-gold mt-auto flex items-center justify-between">
              <span>Démarrer</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Option 2: Démo */}
          <div 
            className="card p-8 flex flex-col h-full cursor-pointer hover:-translate-y-1 transition-transform hover:shadow-lg border border-transparent hover:border-text relative overflow-hidden"
            onClick={loadingDemo ? undefined : handleStartDemo}
            style={{ opacity: loadingDemo ? 0.7 : 1 }}
          >
            <div className="absolute top-0 right-0 bg-bg2 text-xs px-3 py-1 rounded-bl-lg font-mono text-text2 uppercase tracking-wider font-bold">
              Découverte
            </div>
            <h2 className="text-2xl font-bold mb-4">Visite libre</h2>
            <p className="text-text2 mb-8 flex-grow leading-relaxed">
              Explorez Tomino avec un portefeuille et un historique factices pour découvrir toutes les fonctionnalités instantanément.
            </p>
            <div className="text-base font-semibold text-text mt-auto flex items-center justify-between">
              <span>{loadingDemo ? 'Génération...' : 'Lancer le mode démo'}</span>
              <span>&rarr;</span>
            </div>
          </div>

          {/* Option 3: Connexion Tomino+ */}
          <div 
            className="card p-8 flex flex-col h-full cursor-pointer hover:-translate-y-1 transition-transform hover:shadow-lg border border-transparent hover:border-green"
            onClick={() => navigate('/settings/sync?login=1')}
          >
            <h2 className="text-2xl font-bold mb-4">J'ai un compte</h2>
            <p className="text-text2 mb-8 flex-grow leading-relaxed">
              Connectez-vous à votre compte Tomino + pour synchroniser vos données et retrouver votre patrimoine.
            </p>
            <div className="text-base font-semibold text-green mt-auto flex items-center justify-between">
              <span>Se connecter</span>
              <span>&rarr;</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
