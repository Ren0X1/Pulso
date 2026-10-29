# Pulso — contexto del proyecto

Ecosistema gaming: launcher de escritorio (Windows y Linux) + web social sobre la misma cuenta.
Biblioteca, logros, horas, amigos y listas compartibles, sincronizado desde Steam.

- **Repo**: https://github.com/Ren0X1/Pulso (rama `main`, público)
- **Autor**: Ren0X1 — responder siempre **en español**, directo.
- **Presupuesto: 0 €.** Solo planes gratuitos. Nunca proponer servicios de pago.
- **Diseño**: `docs/superpowers/specs/2026-10-22-pulso-design.md` · planes en `docs/superpowers/plans/`.

> Este fichero es el manual del proyecto. Si cambia la estructura, los comandos o el despliegue, se actualiza aquí.

---

## Estructura

| Carpeta | Qué es |
|---|---|
| `apps/web` | La app (React 19 + Vite 8 + React Router 8). La misma build sirve para la web y para el launcher |
| `apps/desktop` | El launcher: solo `src-tauri/` (Tauri 2, Rust). Carga `apps/web` |
| `packages/core` | Tipos, esquemas zod, cliente de Supabase, adaptadores de plataforma. Reexporta `supabase/functions/_shared/username.ts` (la regla de usernames vive allí para que la Edge Function se despliegue sola) |
| `packages/ui` | Sistema de diseño: `tokens.css` + componentes (`Button`, `Field`, `Avatar`, `Logo`) |
| `supabase/migrations` | Esquema SQL y políticas RLS |
| `supabase/functions` | Edge Functions (Deno). `_shared/` = lógica pura con tests en Vitest |
| `supabase/tests` | Tests de RLS sobre PGlite (Postgres en WASM, sin Docker) |

## Comandos

```bash
pnpm install
pnpm dev                       # web en http://localhost:5173
pnpm test                      # todos los tests (Turborepo)
pnpm typecheck
pnpm build
pnpm --filter desktop dev      # launcher en modo desarrollo (necesita Rust + MSVC Build Tools)
pnpm --filter desktop tauri build   # instalador NSIS (Windows) / deb + AppImage (Linux)
```

Versiones: Node ≥ 22, pnpm 11, TypeScript 7, Rust estable (rustup + VS Build Tools 2022 con C++; en Git Bash añadir `~/.cargo/bin` al PATH). Comprobar la documentación antes de usar
APIs de React Router 8, Vite 8, Vitest 5 o TS 7: son versiones nuevas.

## Supabase (gratis)

1. Crear proyecto en https://supabase.com (plan Free). Se pausa tras 7 días sin actividad.
2. `npx supabase login` → `npx supabase link --project-ref <ref>`
3. `npx supabase db push` (aplica `supabase/migrations`)
4. Secretos de las funciones: copiar `supabase/.env.example` → `supabase/.env` y
   `npx supabase secrets set --env-file supabase/.env`
5. `npx supabase functions deploy auth-steam` (sin JWT: lo fija `supabase/config.toml`)
6. Web: `apps/web/.env` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (públicas)

Clave de Steam Web API gratis: https://steamcommunity.com/dev/apikey

## Reglas que no se rompen

- **RLS en todas las tablas.** La privacidad se aplica en la base de datos; cada política nueva lleva su test en `supabase/tests/rls.test.ts`.
- Lo que viene de Steam (origen `steam`, horas, logros) **solo lo escribe el servidor**. El cliente no puede crearlo ni cambiarlo (permisos por columna).
- **Login solo con Steam** (OpenID verificado en `auth-steam`). Email sintético `<steamid64>@steam.pulso.invalid`.
- Secretos solo en Edge Functions. Nunca tokens ni datos personales en logs.
- **Nada de datos inventados**: si algo no existe aún, la pantalla lo dice (estado vacío honesto).
- Diseño *true-black flat*: suelo `#000`, elevación por luminosidad, sin bordes ni sombras en reposo. El lima `--accent` solo en datos, nunca en botones, pestañas ni nav. Botón principal = blanco invertido.
- Interfaz en español; README en inglés; commits `tipo(ámbito): texto en español`.

## Launcher (apps/desktop)

- `src-tauri/src/steam.rs` lee los juegos instalados (`libraryfolders.vdf` + `appmanifest_*.acf`); `playing.rs` detecta el juego abierto (variable `SteamAppId` del proceso o, si no, su carpeta); `presence.rs` es Discord Rich Presence (Application ID `1563105754452328469`); `launch.rs` lanza con parámetros (`steam -applaunch`, sin consola).
- Comandos: `installed_games`, `now_playing`, `launch_game { appid, args? }`, `install_game`, `open_game_folder`, `set_presence`, `set_presence_info { appid, state, badge, profileUrl }` (logros, horas y platinos para Discord; los calcula la web). Evento `now-playing`.
- Cerrar la ventana deja Pulso en la bandeja. Inicio con el sistema con `--minimized`.
- Ajustes del launcher en `user_settings.launcher`: `{ discordPresence, launchOptions: { "<appid>": "<parámetros>" } }`.
- **Probar sin molestar al usuario**: `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 pnpm --filter desktop dev` y manejar la ventana por CDP; minimizarla después. El usuario usa el PC mientras tanto.
- **Actualizaciones**: `tauri-plugin-updater` lee `latest.json` de la última GitHub Release. Las versiones se firman con `~/.tauri/pulso.key` (sin contraseña; nunca al repo). En CI va en el secreto `TAURI_SIGNING_PRIVATE_KEY`. Para compilar el instalador en local: `TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/pulso.key) pnpm --filter desktop tauri build --bundles nsis`.
- Versión del instalador: `MAJOR.FEATURE.MINOR.fFIX` → semver `MAJOR.FEATURE.(MINOR×100+FIX)`, la calcula `release.yml`.

## Web publicada

- **https://pulsonetwork.eu** (y `www.`): dominio comprado en Hostinger con los nameservers en Cloudflare. Proyecto de Cloudflare Pages `pulso` (subida directa, no conectado a Git), también en `https://pulso-11e.pages.dev`. Los dominios personalizados se añaden desde el panel (*Custom domains*): así Cloudflare crea el CNAME; por la API no lo crea.
- `release.yml` → job `web`: compila `apps/web` y publica con wrangler si existe el secreto `CLOUDFLARE_API_TOKEN` (permiso *Cloudflare Pages: Edit*). A mano: `cd apps/web && npx wrangler pages deploy dist --project-name pulso --branch main`.
- `PULSO_WEB_URL` (`apps/web/src/lib/desktop.ts`) y `PULSO_ICON` (`presence.rs`) apuntan a la web publicada: botón de perfil y logo de Discord (`apps/web/public/discord-icon.png`).
- Supabase: `PULSO_APP_URL` y *Auth → Site URL* = la web publicada; `localhost:5173` en *Redirect URLs*.
- `release.yml` → job `linux`: instala el `.deb` y el AppImage de la release en Ubuntu con xvfb y comprueba que arrancan.

## Versionado

`VERSION` + `CHANGELOG.md` con `MAJOR.FEATURE.MINOR.fFIX`. `.github/workflows/release.yml` publica la
release en cada push a `main` (mismo workflow que RGL-Discord-BOT). `ci.yml` pasa tipos, tests y build en
cada push.

## Proyecto de Supabase

- Ref `jaxxqwqyhptgbymlmmwr` · URL `https://jaxxqwqyhptgbymlmmwr.supabase.co` · MCP configurado en `.mcp.json` (aplicar migraciones y desplegar funciones desde Claude Code).
- Migraciones aplicadas: `init`, `private_functions`, `rls_perf`, `share_codes`, `steam_sync`, `list_members`, `notifications`, `profile_media_stats`, `live_updates` (las mismas que `supabase/migrations`).
- Listas: el código crea una **copia**; además el dueño puede invitar a **amigos** como lector o editor (`game_list_members`). Los editores solo tocan los juegos; nombre, visibilidad, códigos y miembros son del dueño.
- Imágenes de perfil en el bucket público `profile-media` (WebP/JPEG/PNG, 2 MB), una carpeta por usuario (`<uid>/avatar-…`, `<uid>/banner-…`); solo el dueño sube o borra. Vista `achievements_by_month` (security_invoker) para Estadísticas.
- Botón de descarga del launcher (`apps/web/src/layout/DownloadLauncher.tsx`): lee la última release de la API de GitHub; solo en navegador de escritorio.
- **Cambios en directo** (`live_updates`): triggers que llaman a `realtime.send` (broadcast privado, evento `changed`, sin datos) en los canales `user:<id>` y `list:<id>`; la política de `realtime.messages` deja escuchar tu canal y el de las listas que la política "ver listas" te deja ver. En la web, `useLive([...canales], recargar)` (`apps/web/src/lib/live.ts`) vuelve a pedir los datos; también al volver a la pestaña o a la ventana del launcher. Si `realtime.messages` no tiene particiones (Realtime sin usar), `realtime.send` falla en silencio: las crea el servicio Realtime en cuanto alguien se conecta.
- Platino = todos los logros de Steam de un juego (`achievement_progress` con `unlocked = total`).
- Funciones auxiliares de RLS en el esquema `private` (la API no lo publica). En `public` solo `create_share_code` y `redeem_share_code`, expuestas a propósito y vetadas a `anon` (lo vigila un test).
- Edge Functions, todas con `verify_jwt = false` y el usuario comprobado en el código (con `verify_jwt` la pasarela rechaza el preflight CORS):
  - `auth-steam` — login con Steam.
  - `catalog` — búsqueda en IGDB con caché en `games`; completa los juegos importados de Steam en vez de duplicarlos.
  - `steam-sync` — importa biblioteca, horas y logros (25 juegos con logros por tanda, una vez cada 10 min).
- Secretos (*Edge Functions → Secrets* en el panel; guardarlos desde el MCP está desactivado por Supabase): `STEAM_API_KEY`, `PULSO_APP_URL`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`.
- Al desplegar una función por MCP hay que subir también sus ficheros de `_shared/` con nombre `../_shared/<fichero>`.
