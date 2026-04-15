// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::api::process::Command;
use tauri::{CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem};

// ── Parametre global : minimiser vers le systray a la fermeture ─────────────
static MINIMIZE_TO_TRAY: AtomicBool = AtomicBool::new(false);

// ── Etat partagé du sidecar Flask ──────────────────────────────────────────
struct SidecarState(Arc<Mutex<Option<tauri::api::process::CommandChild>>>);

// ── Persistance des parametres dans AppData\Tomino\tomino_app_settings.json ─
fn settings_path() -> Option<PathBuf> {
    let app_data = std::env::var("APPDATA").ok()?;
    let dir = PathBuf::from(&app_data).join("Tomino");
    fs::create_dir_all(&dir).ok()?;
    Some(dir.join("tomino_app_settings.json"))
}

fn load_app_settings() {
    if let Some(path) = settings_path() {
        if let Ok(contents) = fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&contents) {
                let minimize = json
                    .get("minimize_to_tray")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);
                MINIMIZE_TO_TRAY.store(minimize, Ordering::Relaxed);
            }
        }
    }
}

fn save_app_settings() {
    if let Some(path) = settings_path() {
        let json = serde_json::json!({
            "minimize_to_tray": MINIMIZE_TO_TRAY.load(Ordering::Relaxed)
        });
        let _ = fs::write(&path, json.to_string());
    }
}

// ── Commandes Tauri appelables depuis le frontend ───────────────────────────
#[tauri::command]
fn set_minimize_to_tray(enabled: bool) {
    MINIMIZE_TO_TRAY.store(enabled, Ordering::Relaxed);
    save_app_settings();
}

#[tauri::command]
fn get_minimize_to_tray() -> bool {
    MINIMIZE_TO_TRAY.load(Ordering::Relaxed)
}

// ── Lancement du sidecar Flask en arrière-plan ──────────────────────────────
fn kill_existing_backends() {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "tomino-backend.exe"])
            .output();
        // Laisse le temps a l'OS de liberer le port
        thread::sleep(Duration::from_millis(300));
    }
}

/// Lance le sidecar Flask dans un thread de fond.
/// La fenetre Tauri n'attend pas — le frontend gère le "pas encore pret" avec un retry.
fn start_flask_server_async(state: Arc<Mutex<Option<tauri::api::process::CommandChild>>>) {
    thread::spawn(move || {
        kill_existing_backends();

        let child_handle = match Command::new_sidecar("tomino-backend") {
            Err(e) => {
                eprintln!("[TOMINO] Erreur init sidecar: {:?}", e);
                return;
            }
            Ok(command) => match command.spawn() {
                Err(e) => {
                    eprintln!("[TOMINO] Erreur spawn sidecar: {:?}", e);
                    return;
                }
                Ok((_rx, child)) => {
                    eprintln!("[TOMINO] Sidecar lance, attente Flask...");
                    child
                }
            },
        };

        // Stocker le handle immediatement pour qu'un kill() anticipé fonctionne
        if let Ok(mut guard) = state.lock() {
            *guard = Some(child_handle);
        }

        // Attendre que Flask soit pret (jusqu'a 30s)
        for i in 0..60 {
            thread::sleep(Duration::from_millis(500));
            eprintln!("[TOMINO] Tentative Flask {}/60...", i + 1);
            if reqwest::blocking::get("http://127.0.0.1:5000/api/status").is_ok() {
                eprintln!("[TOMINO] Flask pret !");
                return;
            }
        }
        eprintln!("[TOMINO] ERREUR: Flask n'a pas repondu apres 30 secondes");
    });
}

fn main() {
    // Charger les preferences avant de creer le systray
    load_app_settings();

    // ── Menu systray ────────────────────────────────────────────────────────
    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show", "Ouvrir Tomino"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "Quitter"));

    let tray = SystemTray::new().with_menu(tray_menu);

    // ── Demarrage du backend en arriere-plan (non bloquant) ─────────────────
    let sidecar_arc: Arc<Mutex<Option<tauri::api::process::CommandChild>>> =
        Arc::new(Mutex::new(None));
    start_flask_server_async(sidecar_arc.clone());
    let sidecar_state = SidecarState(sidecar_arc);

    tauri::Builder::default()
        .system_tray(tray)
        .manage(sidecar_state)
        .setup(|app| {
            // La fenetre s'affiche immediatement — le backend arrive dans les secondes qui suivent
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Ok(())
        })
        // ── Evenements systray ──────────────────────────────────────────────
        .on_system_tray_event(|app, event| match event {
            // Clic gauche sur l'icone : rouvrir la fenetre
            SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "show" => {
                    if let Some(window) = app.get_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    // Tuer le sidecar Flask puis quitter proprement
                    let state: tauri::State<SidecarState> = app.state();
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            eprintln!("[TOMINO] Quitter depuis le systray — arret du sidecar");
                            let _ = child.kill();
                        }
                    }
                    app.exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        // ── Evenements de fenetre ────────────────────────────────────────────
        .on_window_event(|event| match event.event() {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if MINIMIZE_TO_TRAY.load(Ordering::Relaxed) {
                    // Masquer au lieu de fermer — le sidecar reste actif
                    let _ = event.window().hide();
                    api.prevent_close();
                }
                // Sinon : fermeture normale, Destroyed va gerer le sidecar
            }
            tauri::WindowEvent::Destroyed => {
                // Tuer le sidecar quand la fenetre est vraiment detruite
                let app = event.window().app_handle();
                let state: tauri::State<SidecarState> = app.state();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        eprintln!("[TOMINO] Fermeture — arret du sidecar Flask");
                        let _ = child.kill();
                    }
                };
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![set_minimize_to_tray, get_minimize_to_tray])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tomino");
}
