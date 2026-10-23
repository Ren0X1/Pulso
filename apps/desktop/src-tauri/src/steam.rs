//! Juegos de Steam instalados en este PC, leídos de los archivos de Steam (sin API ni red).
//! `libraryfolders.vdf` dice dónde están las bibliotecas; cada `appmanifest_<appid>.acf`, qué juego hay.

use std::fs;
use std::path::{Path, PathBuf};

use keyvalues_parser::{Obj, Value};
use serde::Serialize;

/// Herramientas que Steam instala como si fueran juegos.
const NOT_GAMES: &[u32] = &[228980];
/// Bit de `StateFlags` que indica que el juego está completamente instalado.
const FULLY_INSTALLED: u32 = 4;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    pub appid: u32,
    pub name: String,
    pub install_dir: PathBuf,
    pub size_bytes: u64,
}

fn get_str<'a>(obj: &'a Obj<'_>, key: &str) -> Option<&'a str> {
    obj.0.get(key)?.first()?.get_str()
}

/// Carpetas de biblioteca (la principal de Steam y las de otros discos).
pub fn parse_library_folders(text: &str) -> Vec<PathBuf> {
    let Ok(vdf) = keyvalues_parser::parse(text) else {
        return Vec::new();
    };
    let Value::Obj(root) = vdf.value else {
        return Vec::new();
    };
    root.0
        .values()
        .flatten()
        .filter_map(|v| v.get_obj())
        .filter_map(|folder| get_str(folder, "path"))
        .map(PathBuf::from)
        .collect()
}

/// Un juego a partir de su manifiesto, o `None` si no está del todo instalado o no es un juego.
pub fn parse_manifest(text: &str, library: &Path) -> Option<InstalledGame> {
    let vdf = keyvalues_parser::parse(text).ok()?;
    let Value::Obj(app) = vdf.value else {
        return None;
    };
    let appid: u32 = get_str(&app, "appid")?.parse().ok()?;
    let flags: u32 = get_str(&app, "StateFlags")?.parse().ok()?;
    if NOT_GAMES.contains(&appid) || flags & FULLY_INSTALLED == 0 {
        return None;
    }
    Some(InstalledGame {
        appid,
        name: get_str(&app, "name")?.to_string(),
        install_dir: library
            .join("steamapps")
            .join("common")
            .join(get_str(&app, "installdir")?),
        size_bytes: get_str(&app, "SizeOnDisk")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0),
    })
}

/// Dónde está Steam en este sistema.
pub fn steam_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        let key = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Valve\\Steam")
            .ok()?;
        let path: String = key.get_value("SteamPath").ok()?;
        Some(PathBuf::from(path))
    }
    #[cfg(not(windows))]
    {
        let home = dirs::home_dir()?;
        [
            ".steam/steam",
            ".local/share/Steam",
            ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        ]
        .iter()
        .map(|p| home.join(p))
        .find(|p| p.join("steamapps").is_dir())
    }
}

pub fn installed_games() -> Vec<InstalledGame> {
    let Some(root) = steam_root() else {
        return Vec::new();
    };
    let text =
        fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")).unwrap_or_default();
    let mut libraries = parse_library_folders(&text);
    if libraries.is_empty() {
        libraries.push(root);
    }

    let mut games: Vec<InstalledGame> = libraries
        .iter()
        .filter_map(|library| {
            fs::read_dir(library.join("steamapps"))
                .ok()
                .map(|dir| (library, dir))
        })
        .flat_map(|(library, dir)| {
            dir.flatten()
                .filter(|e| {
                    let name = e.file_name();
                    let name = name.to_string_lossy();
                    name.starts_with("appmanifest_") && name.ends_with(".acf")
                })
                .filter_map(|e| fs::read_to_string(e.path()).ok())
                .filter_map(|text| parse_manifest(&text, library))
                .collect::<Vec<_>>()
        })
        .collect();
    games.sort_by_key(|g| g.appid);
    games.dedup_by_key(|g| g.appid);
    games
}

#[cfg(test)]
mod tests {
    use super::*;

    // Recortados de los archivos reales de Steam (las barras van escapadas en el VDF).
    const LIBRARY_FOLDERS: &str = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"apps"
		{
			"730"		"73918888730"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
		"label"		""
	}
}"#;

    fn manifest(appid: u32, name: &str, flags: u32) -> String {
        format!(
            r#""AppState"
{{
	"appid"		"{appid}"
	"name"		"{name}"
	"StateFlags"		"{flags}"
	"installdir"		"{name}"
	"SizeOnDisk"		"338920007"
}}"#
        )
    }

    #[test]
    fn lee_todas_las_bibliotecas_con_sus_rutas_desescapadas() {
        assert_eq!(
            parse_library_folders(LIBRARY_FOLDERS),
            vec![
                PathBuf::from(r"C:\Program Files (x86)\Steam"),
                PathBuf::from(r"D:\SteamLibrary")
            ]
        );
    }

    #[test]
    fn un_archivo_roto_no_da_bibliotecas() {
        assert!(parse_library_folders("esto no es vdf {").is_empty());
    }

    #[test]
    fn lee_un_juego_instalado() {
        let game = parse_manifest(
            &manifest(1245620, "ELDEN RING", 4),
            Path::new("D:/SteamLibrary"),
        )
        .unwrap();
        assert_eq!(game.appid, 1245620);
        assert_eq!(game.name, "ELDEN RING");
        assert_eq!(
            game.install_dir,
            Path::new("D:/SteamLibrary")
                .join("steamapps")
                .join("common")
                .join("ELDEN RING")
        );
        assert_eq!(game.size_bytes, 338_920_007);
    }

    #[test]
    fn ignora_juegos_a_medio_descargar() {
        // 1026 = actualización pendiente sin el bit de "instalado".
        assert!(parse_manifest(&manifest(10, "Counter-Strike", 1026), Path::new("C:/")).is_none());
    }

    #[test]
    fn acepta_otros_bits_si_esta_instalado() {
        // 6 = instalado + necesita actualización: se puede jugar igualmente.
        assert!(parse_manifest(&manifest(10, "Counter-Strike", 6), Path::new("C:/")).is_some());
    }

    #[test]
    fn ignora_los_redistribuibles_de_steamworks() {
        assert!(parse_manifest(
            &manifest(228980, "Steamworks Common Redistributables", 4),
            Path::new("C:/")
        )
        .is_none());
    }
}
