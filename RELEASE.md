# Tomino — Procédure de release

## Prérequis (une seule fois)

### 1. Ajouter les secrets GitHub
Dans github.com/TON_USERNAME/tomino/settings/secrets/actions :
- TAURI_PRIVATE_KEY : contenu de ~/.tauri/tomino.key
- TAURI_KEY_PASSWORD : mot de passe de la clé (vide si aucun)

### 2. Mettre à jour la version
Dans ces deux fichiers :
- front/src-tauri/tauri.conf.json → "version": "0.4.0"
- front/src-tauri/Cargo.toml → version = "0.4.0"

## Créer une release
```bash
git add .
git commit -m "chore: release v0.4.0"
git tag v0.4.0
git push origin main --tags
```

GitHub Actions compile automatiquement (~15 min).
La release est créée en mode "Draft" — tu peux relire
les notes avant de la publier.

## Ce qui est généré automatiquement
- TominoSetup_0.4.0_x64-setup.exe
- TominoSetup_0.4.0_x64-setup.exe.sig
- latest.json (pour l'auto-updater)

## Publier la release
1. Aller sur github.com/TON_USERNAME/tomino/releases
2. Cliquer "Edit" sur le Draft
3. Vérifier les fichiers uploadés
4. Cliquer "Publish release"
5. Les utilisateurs voient la bannière de mise à jour
   au prochain démarrage de Tomino
