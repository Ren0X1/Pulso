//! Lanzar juegos de Steam con parámetros propios (`-novid -console`, `-windowed -w 800`…).
//! Se pasa por `steam -applaunch <appid> <parámetros>`: Steam sigue gestionando login, DRM y actualizaciones,
//! y los parámetros van como argumentos sueltos, nunca a través de una consola, así que no se puede inyectar nada.

use std::path::PathBuf;
use std::process::Command;

/// Máximo razonable para unos parámetros de lanzamiento.
pub const MAX_ARGS_LEN: usize = 512;

/// Trocea los parámetros como haría una consola: por espacios, respetando lo que va entre comillas.
pub fn split_args(text: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut has_token = false;
    for c in text.chars() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
                has_token = true;
            }
            c if c.is_whitespace() && !in_quotes => {
                if has_token {
                    args.push(std::mem::take(&mut current));
                    has_token = false;
                }
            }
            c => {
                current.push(c);
                has_token = true;
            }
        }
    }
    if has_token {
        args.push(current);
    }
    args
}

fn steam_program() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        crate::steam::steam_root()
            .map(|root| root.join("steam.exe"))
            .filter(|p| p.is_file())
    }
    #[cfg(not(windows))]
    {
        Some(PathBuf::from("steam"))
    }
}

/// Lanza el juego con parámetros a través de Steam.
pub fn launch_with_args(appid: u32, args: &str) -> Result<(), String> {
    if args.len() > MAX_ARGS_LEN {
        return Err("Parámetros demasiado largos".into());
    }
    let program = steam_program().ok_or("No se encontró Steam en este PC")?;
    Command::new(program)
        .arg("-applaunch")
        .arg(appid.to_string())
        .args(split_args(args))
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn separa_por_espacios() {
        assert_eq!(
            split_args("-novid  -console -w 800"),
            ["-novid", "-console", "-w", "800"]
        );
    }

    #[test]
    fn respeta_lo_que_va_entre_comillas() {
        assert_eq!(
            split_args(r#"-config "mi config.cfg" +map c1a0"#),
            ["-config", "mi config.cfg", "+map", "c1a0"]
        );
    }

    #[test]
    fn unas_comillas_vacias_son_un_argumento_vacio() {
        assert_eq!(split_args(r#"-name """#), ["-name", ""]);
    }

    #[test]
    fn nada_o_solo_espacios_no_da_argumentos() {
        assert!(split_args("").is_empty());
        assert!(split_args("   \t ").is_empty());
    }

    #[test]
    fn los_caracteres_de_consola_no_tienen_efecto_especial() {
        // Van tal cual al juego como texto; no hay consola que los interprete.
        assert_eq!(
            split_args("-a & del x | y"),
            ["-a", "&", "del", "x", "|", "y"]
        );
    }
}
