const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pkgPath = path.join(__dirname, 'front', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

let arg = process.argv[2] || 'patch';
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
  console.error("[ERREUR] Usage: node bump.js [patch|minor|major|<version>]");
  process.exit(1);
}

console.log(`[START] Mise a jour : v${currentVersion} -> v${newVersion}`);

// 1. package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log("[OK] package.json mis a jour");

// 2. tauri.conf.json
const tauriPath = path.join(__dirname, 'front', 'src-tauri', 'tauri.conf.json');
const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
tauri.package.version = newVersion;
fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + '\n');
console.log("[OK] tauri.conf.json mis a jour");

// 3. Cargo.toml
const cargoPath = path.join(__dirname, 'front', 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\s*=\s*".*?"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoPath, cargo);
console.log("[OK] Cargo.toml mis a jour");

// 4. Git automatique
try {
  console.log("\n[GIT] Creation du commit et du tag...");
  execSync('git add front/package.json front/src-tauri/tauri.conf.json front/src-tauri/Cargo.toml', {stdio: 'inherit'});
  execSync(`git commit -m "chore: release v${newVersion}"`, {stdio: 'inherit'});
  execSync(`git tag v${newVersion}`, {stdio: 'inherit'});
  
  console.log("\n[GIT] Envoi du code et du tag sur GitHub...");
  execSync('git push origin main', {stdio: 'inherit'});
  execSync(`git push origin v${newVersion}`, {stdio: 'inherit'});
  
  console.log(`\n[SUCCES] La version v${newVersion} a ete envoyee !`);
  console.log(`Les serveurs GitHub Actions compilent actuellement l'executable.`);
  console.log(`Une fois termine, la mise a jour sera automatiquement deployee aux utilisateurs !`);
} catch (e) {
  console.error("\n[ATTENTION] Erreur Git. Les fichiers sont modifies mais l'envoi a peut-etre echoue.");
}
