// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::thread;
use std::time::Duration;
use tauri::api::process::Command;

fn start_flask_server() -> Option<tauri::api::process::CommandChild> {
    let sidecar_result = Command::new_sidecar("tomino-backend");
    
    let child_handle = match sidecar_result {
        Err(e) => {
            eprintln!("[TOMINO] Erreur init sidecar: {:?}", e);
            None
        }
        Ok(command) => {
            match command.spawn() {
                Err(e) => {
                    eprintln!("[TOMINO] Erreur spawn sidecar: {:?}", e);
                    None
                }
                Ok((_rx, child)) => {
                    eprintln!("[TOMINO] Sidecar lance, attente Flask...");
                    Some(child)
                }
            }
        }
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

    child_handle
}

fn main() {
    let _sidecar = start_flask_server();

    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de Tomino");
}
