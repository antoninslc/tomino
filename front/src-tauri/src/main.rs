// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::api::process::Command;

/// Tue tous les processus tomino-backend.exe existants avant d'en lancer un nouveau.
/// Évite les doublons si l'app s'est fermée sans nettoyer.
fn kill_existing_backends() {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "tomino-backend.exe"])
            .output();
        // Laisse le temps à l'OS de libérer le port
        thread::sleep(Duration::from_millis(300));
    }
}

fn start_flask_server() -> Option<tauri::api::process::CommandChild> {
    kill_existing_backends();

    let child_handle = match Command::new_sidecar("tomino-backend") {
        Err(e) => {
            eprintln!("[TOMINO] Erreur init sidecar: {:?}", e);
            return None;
        }
        Ok(command) => match command.spawn() {
            Err(e) => {
                eprintln!("[TOMINO] Erreur spawn sidecar: {:?}", e);
                return None;
            }
            Ok((_rx, child)) => {
                eprintln!("[TOMINO] Sidecar lance, attente Flask...");
                child
            }
        },
    };

    let mut flask_ready = false;
    for i in 0..30 {
        thread::sleep(Duration::from_millis(500));
        eprintln!("[TOMINO] Tentative Flask {}/30...", i + 1);
        if reqwest::blocking::get("http://127.0.0.1:5000/api/status").is_ok() {
            eprintln!("[TOMINO] Flask pret !");
            flask_ready = true;
            break;
        }
    }

    if !flask_ready {
        eprintln!("[TOMINO] ERREUR: Flask n'a pas repondu apres 15 secondes");
    }

    Some(child_handle)
}

fn main() {
    let sidecar = Arc::new(Mutex::new(start_flask_server()));
    let sidecar_for_event = Arc::clone(&sidecar);

    tauri::Builder::default()
        .on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event.event() {
                if let Ok(mut guard) = sidecar_for_event.lock() {
                    if let Some(child) = guard.take() {
                        eprintln!("[TOMINO] Fermeture — arrêt du sidecar Flask");
                        let _ = child.kill();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tomino");
}
