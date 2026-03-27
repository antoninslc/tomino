import { useState } from 'react'
import { api } from '../api'

export default function DemoBanner({ isDemo }) {
  const [loading, setLoading] = useState(false)

  if (!isDemo) return null

  const handleReset = async () => {
    try {
      setLoading(true)
      await api.post('/demo/reset')
      window.location.href = '/'
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  return (
    <div className="bg-red text-bg py-2 px-4 flex items-center justify-between z-[9999] fixed bottom-0 left-0 right-0 shadow-[0_-4px_10px_rgba(0,0,0,0.2)]">
      <div className="font-semibold text-sm">
        Mode Découverte actif. Vous visualisez des données factices conçues pour tester l'interface.
      </div>
      <button 
        onClick={handleReset}
        disabled={loading}
        className="btn bg-bg text-text hover:bg-bg1 border-none text-sm py-1 min-h-0 h-8 font-medium"
      >
        {loading ? 'Purge en cours...' : 'Quitter la démo et commencer'}
      </button>
    </div>
  )
}
