import React from 'react'

export default function SyncPage({ ctx }) {
  const {
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
  } = ctx

  const [isRenamingDevice, setIsRenamingDevice] = React.useState(false)
  const [newDeviceName, setNewDeviceName] = React.useState('')
  const [renameError, setRenameError] = React.useState('')

  const isTominoPlus = Boolean(syncSubscription?.tomino_plus || syncAuthUser?.tomino_plus || String(syncAuthUser?.tier || '').toLowerCase() === 'tomino_plus')
  const currentDevice = (syncDevices || []).find((d) => d.device_id === syncCurrentDeviceId) || null
  const otherDevices = (syncDevices || []).filter((d) => d.device_id && d.device_id !== syncCurrentDeviceId && !d.revoked_at)

  React.useEffect(() => {
    if (isRenamingDevice && currentDevice) {
      setNewDeviceName(currentDevice.device_label || 'Mon appareil')
    }
  }, [isRenamingDevice, currentDevice])

  const renameDevice = async () => {
    const trimmedName = String(newDeviceName || '').trim()
    if (!trimmedName || !currentDevice) return
    setRenameError('')
    try {
      const response = await fetch('/api/devices/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncAuthToken}` },
        body: JSON.stringify({ device_id: syncCurrentDeviceId || syncDeviceId, device_label: trimmedName }),
      })
      if (!response.ok) throw new Error('Impossible de renommer cet appareil.')
      setIsRenamingDevice(false)
      setNewDeviceName('')
      await ctx.loadSyncState?.()
    } catch (e) {
      setRenameError(e?.message || 'Impossible de renommer cet appareil.')
    }
  }

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
                    <div>Dernière activité: <span className="td-mono">{ctx.formatIsoDateTime(currentDevice?.last_seen_at)}</span></div>
                  </div>
                </div>
              </div>

              {!isRenamingDevice && (
                <div className="card fade-up" style={{ maxWidth: 980, marginBottom: 12, background: 'rgba(255,255,255,.01)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="card-label" style={{ marginBottom: 4 }}>Nommer cet appareil</div>
                      <div style={{ color: 'var(--text-2)', fontSize: '.84rem' }}>
                        {currentDevice?.device_label || 'Mon appareil'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setIsRenamingDevice(true)}
                      disabled={syncActionSaving}
                    >
                      Renommer
                    </button>
                  </div>
                </div>
              )}

              {isRenamingDevice && (
                <div className="card fade-up" style={{ maxWidth: 980, marginBottom: 12 }}>
                  <label className="form-label" style={{ marginBottom: 10 }}>Nouveau nom de l'appareil</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      placeholder="ex: PC principal, Laptop, MacBook..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') renameDevice()
                        if (e.key === 'Escape') setIsRenamingDevice(false)
                      }}
                      disabled={syncActionSaving}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setIsRenamingDevice(false)}
                        disabled={syncActionSaving}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={renameDevice}
                        disabled={syncActionSaving || !String(newDeviceName || '').trim()}
                      >
                        {syncActionSaving ? 'Enregistrement...' : 'Enregistrer'}
                      </button>
                    </div>
                  </div>
                  {renameError && (
                    <div style={{ marginTop: 10, fontSize: '.83rem', color: 'var(--red)', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                      {renameError}
                    </div>
                  )}
                </div>
              )}

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
                              <td className="td-mono">{ctx.formatIsoDateTime(d.last_seen_at)}</td>
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
