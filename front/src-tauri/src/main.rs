// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::thread;
use std::time::Duration;

fn start_flask_server() {
    thread::spawn(|| {
        // Cherche python dans le même dossier que l'exe (production)
        // ou dans le PATH (développement)
        let python = if cfg!(target_os = "windows") {
            "python"
        } else {
            "python3"
        };

        let _ = Command::new(python)
            .arg("app.py")
            .current_dir(get_app_dir())
            .spawn();

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

fn get_app_dir() -> std::path::PathBuf {
    // En production : dossier à côté de l'exe
    // En dev : dossier racine du projet
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let candidate = parent.join("../../../");
            if candidate.join("app.py").exists() {
                return candidate.canonicalize().unwrap_or(candidate);
            }
            // Production : app.py à côté de l'exe
            if parent.join("app.py").exists() {
                return parent.to_path_buf();
            }
        }
    }
    std::env::current_dir().unwrap_or_default()
}

fn main() {
    start_flask_server();

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tomino");
}
