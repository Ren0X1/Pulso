//! Qué juego está abierto ahora mismo. Funciona igual si el juego se lanzó desde Pulso que desde Steam.
//!
//! 1. Steam pone `SteamAppId=<appid>` en el entorno de cada juego que lanza: si está, manda.
//! 2. Si no, el ejecutable dentro de la carpeta de un juego instalado. Ojo: varios juegos pueden compartir
//!    carpeta (Half-Life y Counter-Strike 1.6 usan `common/Half-Life` y el mismo `hl.exe`).

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::steam::InstalledGame;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Playing {
    pub appid: u32,
    pub name: String,
    /// Milisegundos Unix en que Pulso vio el juego abierto por primera vez.
    pub started_at: i64,
}

/// Un proceso en marcha: su ejecutable y, si Steam lo lanzó, el AppID de su entorno.
#[derive(Debug, Clone)]
pub struct RunningProcess {
    pub exe: PathBuf,
    pub steam_app_id: Option<u32>,
}

/// En Windows las rutas no distinguen mayúsculas; se comparan en minúsculas y con la misma barra.
fn normalized(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        text.to_lowercase()
    } else {
        text
    }
}

pub fn is_inside(exe: &Path, dir: &Path) -> bool {
    let dir = normalized(dir);
    let exe = normalized(exe);
    exe.len() > dir.len()
        && exe.starts_with(&dir)
        && exe.as_bytes()[dir.trim_end_matches('/').len()] == b'/'
}

/// `SteamAppId=70` entre las variables de entorno de un proceso.
pub fn steam_app_id<S: AsRef<str>>(environ: &[S]) -> Option<u32> {
    environ
        .iter()
        .find_map(|var| var.as_ref().strip_prefix("SteamAppId="))
        .and_then(|v| v.parse().ok())
        .filter(|&id| id != 0)
}

/// El juego instalado que está en marcha, si lo hay.
pub fn detect_running<'a>(
    processes: &[RunningProcess],
    games: &'a [InstalledGame],
) -> Option<&'a InstalledGame> {
    let in_game_dir = |p: &RunningProcess, g: &InstalledGame| is_inside(&p.exe, &g.install_dir);
    // Primero, el AppID que puso Steam, si es de un juego instalado cuyo directorio contiene el proceso.
    let by_env = processes.iter().find_map(|p| {
        let id = p.steam_app_id?;
        games.iter().find(|g| g.appid == id && in_game_dir(p, g))
    });
    by_env.or_else(|| {
        games
            .iter()
            .find(|g| processes.iter().any(|p| in_game_dir(p, g)))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game(appid: u32, dir: &str) -> InstalledGame {
        InstalledGame {
            appid,
            name: format!("Juego {appid}"),
            install_dir: PathBuf::from(dir),
            size_bytes: 0,
        }
    }

    fn process(exe: &str, steam_app_id: Option<u32>) -> RunningProcess {
        RunningProcess {
            exe: PathBuf::from(exe),
            steam_app_id,
        }
    }

    #[test]
    fn encuentra_el_juego_por_la_carpeta_de_su_ejecutable() {
        let games = [
            game(
                730,
                "C:/Steam/steamapps/common/Counter-Strike Global Offensive",
            ),
            game(1245620, "D:/SteamLibrary/steamapps/common/ELDEN RING"),
        ];
        let procs = [
            process("C:/Windows/explorer.exe", None),
            process(
                "D:/SteamLibrary/steamapps/common/ELDEN RING/Game/eldenring.exe",
                None,
            ),
        ];
        assert_eq!(
            detect_running(&procs, &games).map(|g| g.appid),
            Some(1245620)
        );
    }

    #[test]
    fn juegos_que_comparten_carpeta_se_distinguen_por_el_appid_de_steam() {
        // Counter-Strike (10) y Half-Life (70) comparten carpeta y ejecutable.
        let games = [
            game(10, "D:/Lib/steamapps/common/Half-Life"),
            game(70, "D:/Lib/steamapps/common/Half-Life"),
        ];
        let procs = [process(
            "D:/Lib/steamapps/common/Half-Life/hl.exe",
            Some(70),
        )];
        assert_eq!(detect_running(&procs, &games).map(|g| g.appid), Some(70));
    }

    #[test]
    fn un_appid_de_otro_juego_no_engana_a_la_carpeta() {
        // Un proceso cualquiera con SteamAppId heredado no es "el juego" si no está en su carpeta.
        let games = [game(70, "D:/Lib/steamapps/common/Half-Life")];
        let procs = [process("C:/Program Files/Discord/Discord.exe", Some(70))];
        assert_eq!(detect_running(&procs, &games), None);
    }

    #[test]
    fn sin_juego_abierto_no_hay_nada() {
        let games = [game(
            730,
            "C:/Steam/steamapps/common/Counter-Strike Global Offensive",
        )];
        assert_eq!(
            detect_running(
                &[process("C:/Program Files/Discord/Discord.exe", None)],
                &games
            ),
            None
        );
    }

    #[test]
    fn una_carpeta_con_nombre_parecido_no_cuenta() {
        // "Portal" no es "Portal 2".
        let games = [game(400, "C:/Steam/steamapps/common/Portal")];
        let procs = [process(
            "C:/Steam/steamapps/common/Portal 2/portal2.exe",
            None,
        )];
        assert_eq!(detect_running(&procs, &games), None);
    }

    #[test]
    fn lee_el_appid_del_entorno() {
        assert_eq!(
            steam_app_id(&["PATH=C:/x", "SteamAppId=70", "SteamGameId=70"]),
            Some(70)
        );
        assert_eq!(steam_app_id(&["PATH=C:/x"]), None);
        assert_eq!(steam_app_id(&["SteamAppId=0"]), None);
    }

    #[cfg(windows)]
    #[test]
    fn en_windows_da_igual_mayusculas_y_barras() {
        let games = [game(
            1245620,
            r"D:\SteamLibrary\steamapps\common\ELDEN RING",
        )];
        let procs = [process(
            "d:/steamlibrary/STEAMAPPS/common/elden ring/Game/eldenring.exe",
            None,
        )];
        assert_eq!(
            detect_running(&procs, &games).map(|g| g.appid),
            Some(1245620)
        );
    }
}
