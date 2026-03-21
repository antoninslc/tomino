
# Prérequis Windows (build desktop)

Pour compiler ou packager Tomino Desktop (Tauri), il faut les outils C++ MSVC (link.exe) :

1. Ouvre PowerShell en mode administrateur
2. Exécute :
  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--quiet --wait --norestart --nocache --installPath C:\BuildTools --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
3. Ferme/réouvre le terminal avant de relancer le build

# Tomino — Installation et mise à jour

## Première installation
1. Télécharger TominoSetup.exe
2. Double-cliquer et suivre l'assistant
3. Tomino s'ouvre automatiquement

## Mise à jour
1. Télécharger la nouvelle version de TominoSetup.exe
2. Lancer l'installeur — il détecte la version existante
3. Vos données (patrimoine.db) sont conservées automatiquement
   Elles se trouvent dans : %APPDATA%\Tomino\

## En cas de problème
- Paramètres → Diagnostic pour un rapport d'état complet
- Vos données sont sauvegardées automatiquement dans :
  %APPDATA%\Tomino\.tomino-backups\

## Désinstallation
Panneau de configuration → Programmes → Tomino → Désinstaller
Vos données ne sont PAS supprimées automatiquement.
Pour supprimer complètement : supprimer %APPDATA%\Tomino\

## Processus de mise à jour (pour le développeur)

### Avant chaque release
1. Définir la variable d'environnement :
   `set TAURI_PRIVATE_KEY=<contenu de ~/.tauri/tomino.key>`

2. Mettre à jour la version dans :
   - `front/src-tauri/tauri.conf.json` → `"version"`
   - `front/src-tauri/Cargo.toml` → `version`

3. Lancer : `release.bat`

### Créer la release GitHub
1. Aller sur `github.com/TON_USERNAME/tomino/releases/new`
2. Tag : `v0.4.0` (par exemple)
3. Uploader :
   - `TominoSetup_0.4.0_x64-setup.exe`
   - `TominoSetup_0.4.0_x64-setup.exe.sig`
4. Copier le contenu du `.sig` dans `latest.json.template`
5. Remplir les autres champs et uploader `latest.json`
6. Publier la release

### Ce que voit l'utilisateur
Au prochain démarrage de Tomino, une bannière dorée apparaît en haut de l'écran avec le bouton "Installer maintenant". Un clic télécharge, installe et relance automatiquement.
