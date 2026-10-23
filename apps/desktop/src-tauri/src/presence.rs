//! Discord Rich Presence por la IPC local de Discord: sin servidor ni coste.
//! Si Discord no está abierto no pasa nada: se vuelve a intentar en la siguiente actualización.

use discord_rich_presence::activity::{Activity, ActivityType, Assets, Button, Timestamps};
use discord_rich_presence::{DiscordIpc, DiscordIpcClient};

use crate::playing::Playing;

/// Application ID de la aplicación "Pulso" en el Discord Developer Portal (no es secreto).
const DISCORD_APP_ID: &str = "1563105754452328469";

pub struct Presence {
    enabled: bool,
    client: Option<DiscordIpcClient>,
}

impl Presence {
    pub fn new() -> Self {
        Self {
            enabled: true,
            client: None,
        }
    }

    pub fn set_enabled(&mut self, enabled: bool, playing: Option<&Playing>) {
        self.enabled = enabled;
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

    /// Muestra el juego en curso, o nada si no hay juego o el usuario lo ha desactivado.
    pub fn update(&mut self, playing: Option<&Playing>) {
        let ok = match (self.enabled, playing) {
            (true, Some(game)) => {
                let cover = format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{}/library_600x900.jpg",
                    game.appid
                );
                let store = format!("https://store.steampowered.com/app/{}", game.appid);
                let activity = Activity::new()
                    .activity_type(ActivityType::Playing)
                    .details(game.name.as_str())
                    .state("Jugando desde Pulso")
                    .timestamps(Timestamps::new().start(game.started_at))
                    .assets(
                        Assets::new()
                            .large_image(cover.as_str())
                            .large_text(game.name.as_str()),
                    )
                    .buttons(vec![Button::new("Ver en Steam", store.as_str())]);
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
