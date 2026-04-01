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

  const isTominoPlus = Boolean(syncSubscription?.tomino_plus || syncAuthUser?.tomino_plus || ['tier1', 'tomino_plus', 'tier2'].includes(String(syncAuthUser?.tier || '').toLowerCase()))
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
    try {
      const response = await fetch('/api/devices/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncAuthToken}` },
        body: JSON.stringify({ device_id: syncCurrentDeviceId || syncDeviceId, device_label: trimmedName }),
      })
      if (!response.ok) throw new Error("Impossible de renommer l'appareil")
      setIsRenamingDevice(false)
      setNewDeviceName('')
      await ctx.loadSyncState?.()
    } catch (e) {
      alert(e?.message || 'Erreur lors du renommage')
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
        <Section label="Synchronisation cloud">
          <Row
            title="Activez la synchronisation cloud"
            body="Créez un compte (ou connectez-vous) pour synchroniser votre patrimoine entre plusieurs appareils. Sans compte, Tomino reste entièrement utilisable en local sur desktop."
          />
          <div style={{ padding: '14px 18px', display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => { setSyncAuthMode('login'); setSyncAuthModalOpen(true) }}
            >
              Se connecter
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { setSyncAuthMode('register'); setSyncAuthTier('free'); setSyncAuthModalOpen(true) }}
            >
              Créer un compte cloud
            </button>
          </div>
        </Section>
      )}

      {syncAuthToken && (
        <>
          {syncLoading ? (
            <p style={{ color: 'var(--text-2)', fontSize: '.88rem' }}>Chargement de l'état cloud...</p>
          ) : (
            <>
              <Section label="Abonnement">
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>
                      {syncSubscription?.label || syncAuthUser?.tier_label || 'Gratuit'}
                    </div>
                    <div style={{ fontSize: '.83rem', color: 'var(--text-2)' }}>
                      {isTominoPlus ? 'Tomino+ actif — sync cloud activée' : 'Mode local — sync cloud désactivée'}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => navigate('/settings/pricing')}>
                    Gérer l'offre
                  </button>
                </div>
                {!isTominoPlus && (
                  <div style={{ padding: '14px 18px', background: 'rgba(201,168,76,.08)', borderLeft: '3px solid rgba(201,168,76,.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#f5dd9d', marginBottom: 4 }}>Fonctionnalités cloud verrouillées</div>
                      <div style={{ fontSize: '.83rem', color: '#e6d6a4', lineHeight: 1.65 }}>
                        En Gratuit, votre application reste 100% locale. Passez à Tomino+ pour activer la synchronisation.
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/settings/pricing')}>
                      Voir les tarifs
                    </button>
                  </div>
                )}
              </Section>

              <Section label="Compte cloud">
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>Email</div>
                  <div style={{ fontSize: '.83rem', color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>{syncAuthUser?.email || '-'}</div>
                </div>
                <div style={{ padding: '14px 18px' }}>
                  <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>Appareil courant</div>
                  <div style={{ fontSize: '.83rem', color: 'var(--text-2)', fontFamily: 'var(--mono)' }}>{syncCurrentDeviceId || syncDeviceId || '-'}</div>
                </div>
              </Section>

              {isTominoPlus && (
                <>
                  <Section label="Synchronisation">
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>
                          Statut : <span style={{ fontFamily: 'var(--mono)', fontWeight: 400 }}>{currentDevice?.sync_paused ? 'En pause' : 'Active'}</span>
                        </div>
                        <div style={{ fontSize: '.83rem', color: 'var(--text-2)' }}>
                          Curseur : <span style={{ fontFamily: 'var(--mono)' }}>{currentDevice?.last_sync_cursor ?? 0}</span>
                          {' · '}
                          Dernière activité : <span style={{ fontFamily: 'var(--mono)' }}>{ctx.formatIsoDateTime(currentDevice?.last_seen_at)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => pauseResumeSync(!(currentDevice?.sync_paused))}
                        disabled={syncActionSaving || !syncCurrentDeviceId}
                      >
                        {syncActionSaving ? 'Mise à jour...' : currentDevice?.sync_paused ? 'Reprendre' : 'Mettre en pause'}
                      </button>
                    </div>

                    {!isRenamingDevice ? (
                      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>Nom de cet appareil</div>
                          <div style={{ fontSize: '.83rem', color: 'var(--text-2)' }}>{currentDevice?.device_label || 'Mon appareil'}</div>
                        </div>
                        <button type="button" className="btn btn-ghost" onClick={() => setIsRenamingDevice(true)} disabled={syncActionSaving}>
                          Renommer
                        </button>
                      </div>
                    ) : (
                      <div style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 10 }}>Nouveau nom de l'appareil</div>
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
                            <button type="button" className="btn btn-ghost" onClick={() => setIsRenamingDevice(false)} disabled={syncActionSaving}>
                              Annuler
                            </button>
                            <button type="button" className="btn btn-primary" onClick={renameDevice} disabled={syncActionSaving || !String(newDeviceName || '').trim()}>
                              {syncActionSaving ? 'Enregistrement...' : 'Enregistrer'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Section>

                  <Section label="Appareils connectés">
                    {!syncDevices.length ? (
                      <div style={{ padding: '14px 18px', fontSize: '.84rem', color: 'var(--text-2)' }}>Aucun appareil connecté pour le moment.</div>
                    ) : (
                      <>
                        <div className="tbl-wrap" style={{ margin: 0, borderRadius: 0 }}>
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
                                    <td>{isRevoked ? 'Révoqué' : d.sync_paused ? 'En pause' : 'Actif'}</td>
                                    <td className="td-mono">{ctx.formatIsoDateTime(d.last_seen_at)}</td>
                                    <td>
                                      {!isCurrent && !isRevoked && (
                                        <button type="button" className="btn btn-danger btn-sm" onClick={() => revokeDevice(d.device_id)} disabled={syncActionSaving}>
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
                        {!!otherDevices.length && (
                          <div style={{ padding: '10px 18px', fontSize: '.75rem', color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                            La révocation d'un appareil invalide ses sessions cloud actives.
                          </div>
                        )}
                      </>
                    )}
                  </Section>
                </>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={loadSyncState} disabled={syncLoading || syncActionSaving}>
                  {syncLoading ? 'Actualisation...' : 'Actualiser'}
                </button>
                {String(syncSubscription?.provider || '').toLowerCase() === 'stripe' && isTominoPlus && (
                  <button type="button" className="btn btn-ghost" onClick={openBillingPortal} disabled={syncActionSaving}>
                    Gérer l'abonnement
                  </button>
                )}
                <button type="button" className="btn btn-danger" onClick={syncLogout} disabled={syncActionSaving}>
                  {syncActionSaving ? 'Déconnexion...' : 'Se déconnecter du cloud'}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="settings-group-label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ title, body }) {
  return (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
      <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: '.83rem', color: 'var(--text-2)', lineHeight: 1.65 }}>{body}</div>
    </div>
  )
}
