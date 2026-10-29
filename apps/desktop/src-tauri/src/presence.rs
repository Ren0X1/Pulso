//! Discord Rich Presence por la IPC local de Discord: sin servidor ni coste.
//! Si Discord no está abierto no pasa nada: se vuelve a intentar en la siguiente actualización.

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, StatusDisplayType, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};
use serde::Deserialize;

use crate::playing::Playing;

/// Application ID de la aplicación "Pulso" en el Discord Developer Portal (no es secreto).
const DISCORD_APP_ID: &str = "1563105754452328469";

/// Logo pequeño junto a la portada (Discord no acepta SVG: va en PNG en la web publicada).
const PULSO_ICON: &str = "https://pulsonetwork.eu/discord-icon.png";

/// Lo que sabe la interfaz y Rust no (horas y logros de la cuenta). Solo se usa si es del juego en curso.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceInfo {
    pub appid: u32,
    /// Línea bajo el juego, p. ej. "34/50 logros · 120 h de juego".
    pub state: Option<String>,
    /// Texto del logo pequeño, p. ej. "ren0x · 45 platinos".
    pub badge: Option<String>,
    pub profile_url: Option<String>,
}

pub struct Presence {
    enabled: bool,
    info: Option<PresenceInfo>,
    client: Option<DiscordIpcClient>,
}

impl Presence {
    pub fn new() -> Self {
        Self {
            enabled: true,
            info: None,
            client: None,
        }
    }

    pub fn set_enabled(&mut self, enabled: bool, playing: Option<&Playing>) {
        self.enabled = enabled;
        self.update(playing);
    }

    pub fn set_info(&mut self, info: PresenceInfo, playing: Option<&Playing>) {
        self.info = Some(info);
        self.update(playing);
    }

    fn connected(&mut self) -> Option<&mut DiscordIpcClient> {
        if self.client.is_none() {
            let mut client = DiscordIpcClient::new(DISCORD_APP_ID);
            if client.connect().is_ok() {
                self.client = Some(client);
            }
        }
        self.client.as_mut()
    }

    /// En la lista de miembros solo sale el juego ("Jugando a Half-Life"); en la tarjeta, Pulso,
    /// el juego, tus logros y horas, el tiempo de partida y los botones a Steam y a tu perfil.
    pub fn update(&mut self, playing: Option<&Playing>) {
        let ok = match (self.enabled, playing) {
            (true, Some(game)) => {
                let info = self.info.clone().filter(|i| i.appid == game.appid).unwrap_or_default();
                let cover = format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg",
                    game.appid
                );
                let store = format!("https://store.steampowered.com/app/{}", game.appid);
                let hover = format!("Jugando a {} usando Pulso", game.name);
                let state = info.state.as_deref().unwrap_or("Jugando con Pulso");
                let badge = info.badge.as_deref().unwrap_or("Pulso");

                let mut assets = Assets::new()
                    .large_image(cover.as_str())
                    .large_text(hover.as_str())
                    .large_url(store.as_str())
                    .small_image(PULSO_ICON)
                    .small_text(badge);
                let mut buttons = vec![Button::new("Ver en Steam", store.as_str())];
                if let Some(profile) = info.profile_url.as_deref() {
                    assets = assets.small_url(profile);
                    buttons.push(Button::new("Mi perfil en Pulso", profile));
                }

                let activity = Activity::new()
                    .activity_type(ActivityType::Playing)
                    .status_display_type(StatusDisplayType::Details)
                    .details(game.name.as_str())
                    .details_url(store.as_str())
                    .state(state)
                    .timestamps(Timestamps::new().start(game.started_at))
                    .assets(assets)
                    .buttons(buttons);
                self.connected().map(|c| c.set_activity(activity).is_ok())
            }
            _ => self.client.as_mut().map(|c| c.clear_activity().is_ok()),
        };
        // Discord se ha cerrado o reiniciado: se reconecta en la próxima actualización.
        if ok == Some(false) {
            if let Some(mut client) = self.client.take() {
                let _ = client.close();
            }
        }
    }
}
