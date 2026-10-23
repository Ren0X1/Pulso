mod launch;
mod playing;
mod presence;
mod steam;

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_opener::OpenerExt;

use playing::Playing;
use presence::Presence;
use steam::InstalledGame;

/// Cada cuánto se mira qué procesos hay abiertos y cada cuánto se relee la lista de instalados.
const WATCH_EVERY: Duration = Duration::from_secs(5);
const RESCAN_EVERY: Duration = Duration::from_secs(60);

#[derive(Default)]
struct AppState {
    games: Mutex<Vec<InstalledGame>>,
    playing: Mutex<Option<Playing>>,
    presence: Mutex<Option<Presence>>,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
fn installed_games(state: State<'_, AppState>) -> Vec<InstalledGame> {
    let games = steam::installed_games();
    *state.games.lock().unwrap() = games.clone();
    games
}

#[tauri::command]
fn now_playing(state: State<'_, AppState>) -> Option<Playing> {
    state.playing.lock().unwrap().clone()
}

/// Lanza el juego a través de Steam: el login, el DRM y las actualizaciones siguen siendo de Steam.
/// Con parámetros propios se usa `steam -applaunch`; sin ellos, el enlace steam:// de siempre.
#[tauri::command]
fn launch_game(app: AppHandle, appid: u32, args: Option<String>) -> Result<(), String> {
    match args.as_deref().map(str::trim).filter(|a| !a.is_empty()) {
        Some(args) => launch::launch_with_args(appid, args),
        None => app
            .opener()
            .open_url(format!("steam://rungameid/{appid}"), None::<&str>)
            .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
fn install_game(app: AppHandle, appid: u32) -> Result<(), String> {
    app.opener()
        .open_url(format!("steam://install/{appid}"), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Solo abre carpetas de juegos detectados: la ruta nunca llega desde la interfaz.
#[tauri::command]
fn open_game_folder(app: AppHandle, state: State<'_, AppState>, appid: u32) -> Result<(), String> {
    let dir = state
        .games
        .lock()
        .unwrap()
        .iter()
        .find(|g| g.appid == appid)
        .map(|g| g.install_dir.to_string_lossy().into_owned())
        .ok_or("El juego no está instalado")?;
    app.opener()
        .open_path(dir, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_presence(state: State<'_, AppState>, enabled: bool) {
    let playing = state.playing.lock().unwrap().clone();
    if let Some(presence) = state.presence.lock().unwrap().as_mut() {
        presence.set_enabled(enabled, playing.as_ref());
    }
}

/// Hilo que vigila qué juego está abierto y avisa a la interfaz y a Discord cuando cambia.
fn watch_games(app: AppHandle) {
    thread::spawn(move || {
        let mut system = System::new();
        let mut last_scan: Option<Instant> = None;
        loop {
            let state = app.state::<AppState>();
            if last_scan.is_none_or(|t| t.elapsed() >= RESCAN_EVERY) {
                *state.games.lock().unwrap() = steam::installed_games();
                last_scan = Some(Instant::now());
            }

            system.refresh_processes_specifics(
                ProcessesToUpdate::All,
                true,
                ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
            );
            let found = {
                let games = state.games.lock().unwrap();
                // Solo los procesos dentro de la carpeta de un juego: a esos se les lee el entorno (SteamAppId).
                let candidates: Vec<_> = system
                    .processes()
                    .values()
                    .filter(|p| {
                        p.exe().is_some_and(|exe| {
                            games
                                .iter()
                                .any(|g| playing::is_inside(exe, &g.install_dir))
                        })
                    })
                    .map(|p| p.pid())
                    .collect();
                if !candidates.is_empty() {
                    system.refresh_processes_specifics(
                        ProcessesToUpdate::Some(&candidates),
                        false,
                        ProcessRefreshKind::nothing().with_environ(UpdateKind::OnlyIfNotSet),
                    );
                }
                let running: Vec<_> = candidates
                    .iter()
                    .filter_map(|pid| system.process(*pid))
                    .filter_map(|p| {
                        let environ: Vec<String> = p
                            .environ()
                            .iter()
                            .map(|v| v.to_string_lossy().into_owned())
                            .collect();
                        Some(playing::RunningProcess {
                            exe: p.exe()?.to_path_buf(),
                            steam_app_id: playing::steam_app_id(&environ),
                        })
                    })
                    .collect();
                playing::detect_running(&running, &games).map(|g| (g.appid, g.name.clone()))
            };

            let mut playing = state.playing.lock().unwrap();
            let changed =
                playing.as_ref().map(|p| p.appid) != found.as_ref().map(|(appid, _)| *appid);
            if changed {
                *playing = found.map(|(appid, name)| Playing {
                    appid,
                    name,
                    started_at: now_ms(),
                });
                let _ = app.emit("now-playing", playing.clone());
                if let Some(presence) = state.presence.lock().unwrap().as_mut() {
                    presence.update(playing.as_ref());
                }
            }
            drop(playing);
            thread::sleep(WATCH_EVERY);
        }
    });
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir Pulso", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .tooltip("Pulso")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Va primero: si Pulso ya está abierto, el enlace pulso:// del login llega a esa ventana
    // en vez de abrir otra instancia.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main(app)
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .manage(AppState {
            presence: Mutex::new(Some(Presence::new())),
            ..Default::default()
        })
        .invoke_handler(tauri::generate_handler![
            installed_games,
            now_playing,
            launch_game,
            install_game,
            open_game_folder,
            set_presence
        ])
        .on_window_event(|window, event| {
            // Cerrar la ventana deja Pulso en la bandeja: así sigue detectando juegos para Discord.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            // En desarrollo no hay instalador que registre el esquema pulso://, así que se registra aquí.
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
            build_tray(app.handle())?;
            // Arrancado con el sistema: directo a la bandeja.
            if std::env::args().any(|a| a == "--minimized") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            watch_games(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("no se pudo arrancar Pulso");
}
