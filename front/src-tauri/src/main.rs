// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use std::time::Duration;
use tauri::api::process::Command;

fn start_flask_server() {
    thread::spawn(|| {
        let _ = Command::new_sidecar("binaries/tomino-backend")
            .expect("Échec de l'initialisation du sidecar")
            .spawn()
            .expect("Échec du lancement du sidecar tomino-backend");

        // Attendre que Flask soit prêt
        for _ in 0..30 {
            thread::sleep(Duration::from_millis(500));
            if reqwest::blocking::get("http://127.0.0.1:5000/api/status")
                .is_ok()
            {
                break;
            }
        }
    });
}

fn main() {
    start_flask_server();

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tomino");
}
