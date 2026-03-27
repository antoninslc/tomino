const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, 'front', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

let arg = process.argv[2] || 'patch';
let customMessage = process.argv[3] || null;
let newVersion = arg;

if (['patch', 'minor', 'major'].includes(arg)) {
  const parts = currentVersion.split('.').map(Number);
  if (arg === 'major') {
    parts[0]++; parts[1] = 0; parts[2] = 0;
  } else if (arg === 'minor') {
    parts[1]++; parts[2] = 0;
  } else {
    parts[2]++;
  }
  newVersion = parts.join('.');
} else if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(arg)) {
  console.error("[ERREUR] Usage: node bump.js [patch|minor|major|<version>] [\"message optionnel\"]");
  console.error("  Exemples :");
  console.error("    node bump.js patch");
  console.error("    node bump.js minor \"feat: onboarding données exemple\"");
  console.error("    node bump.js 1.0.0 \"feat: première version publique\"");
  process.exit(1);
}

const commitMessage = customMessage
  ? `${customMessage} — v${newVersion}`
  : `chore: release v${newVersion}`;

console.log(`\n[START] Mise a jour : v${currentVersion} -> v${newVersion}`);
if (customMessage) {
  console.log(`[INFO]  Message : ${commitMessage}`);
}
console.log('');

// 1. package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log("[OK] front/package.json");

// 2. tauri.conf.json
const tauriPath = path.join(__dirname, 'front', 'src-tauri', 'tauri.conf.json');
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauri.package.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log("[OK] front/src-tauri/tauri.conf.json");

// 3. Cargo.toml
const cargoPath = path.join(__dirname, 'front', 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\s*=\s*".*?"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoPath, cargo);
console.log("[OK] front/src-tauri/Cargo.toml");

// 4. Git
try {
  console.log("\n[GIT] Commit et tag...");
  execSync('git add front/package.json front/src-tauri/tauri.conf.json front/src-tauri/Cargo.toml', { stdio: 'inherit' });
  execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

  console.log("\n[GIT] Push vers GitHub...");
  execSync('git push origin main', { stdio: 'inherit' });
  execSync(`git push origin v${newVersion}`, { stdio: 'inherit' });

  console.log(`\n[SUCCES] v${newVersion} envoyee sur GitHub !`);
  console.log(`GitHub Actions compile l'installeur en arriere-plan (~15 min).`);
  console.log(`La mise a jour sera automatiquement deployee aux utilisateurs.`);
  console.log(`\nSuivi : https://github.com/antoninslc/tomino/actions`);
} catch (e) {
  console.error("\n[ATTENTION] Erreur Git. Les fichiers sont modifies localement mais le push a echoue.");
  console.error(e.message);
}