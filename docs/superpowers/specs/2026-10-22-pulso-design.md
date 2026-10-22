# Pulso — Documento de diseño

> Fecha: 2026-10-22 · Estado: **borrador pendiente de aprobación** · Autor: Ren0X1

---

## 1. Qué es y por qué

Pulso reúne en un solo sitio la vida gaming de un jugador: su biblioteca, sus logros, su tiempo de juego, sus listas de pendientes y sus amigos. Tiene dos caras sobre la misma cuenta y el mismo backend:

- **Launcher de escritorio** (Windows y Linux): detecta los juegos instalados, los lanza, deja ver dónde están en disco y sincroniza logros con la web.
- **Web social** (escritorio y móvil, responsive): perfil gamer, biblioteca, logros, amigos y listas compartibles.

Filosofía: *todo tu mundo gaming, en un solo lugar*. No sustituye a Steam: es una capa encima que respeta su instalación, su login y su forma de ejecutar juegos.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos del MVP**
- Cuenta Pulso con perfil personalizable (avatar, banner, bio, favoritos, privacidad por apartado).
- Catálogo mundial de juegos, de los más antiguos a los más nuevos, buscable desde la app.
- Biblioteca propia con estados (pendiente, jugando, completado, abandonado), favoritos, etiquetas, búsqueda, filtros y vistas de cuadrícula y lista.
- Vinculación de Steam: importación de juegos, horas y logros reales.
- Amigos: buscar, solicitar, aceptar, rechazar, ver su actividad y los juegos en común.
- **Listas compartibles por código**: una lista (por ejemplo, de pendientes) se comparte con un código; quien lo carga recibe una copia de esa lista en su cuenta.
- Launcher: detecta juegos de Steam instalados, los lanza, abre su carpeta, guarda opciones de lanzamiento por juego y sincroniza la configuración del usuario con la nube.

**No-objetivos (por ahora)**
- Integraciones distintas de Steam (Epic, GOG, Xbox, PSN). La arquitectura de adaptadores queda preparada, pero no se implementan.
- App móvil nativa, grupos, publicaciones y comentarios.
- Instalar o actualizar juegos: eso lo sigue haciendo Steam.

**Anti-objetivos (lo que sería un fracaso aunque funcione)**
- Mostrar datos inventados como reales. Si Steam no da algo (perfil privado, juego sin logros), la interfaz lo dice.
- Gastar dinero. Todo debe caber en planes gratuitos.
- Una estética de plantilla, panel de administración o neón.
- Exponer datos privados por la API aunque el frontend los oculte.

## 3. Restricciones

- **Presupuesto: 0 €.** Solo planes gratuitos, sin tarjeta cuando sea posible.
- **Steam es la única integración** en esta etapa.
- El repositorio es público ([Ren0X1/Pulso](https://github.com/Ren0X1/Pulso)), así que no se suben secretos.
- Escritorio en Windows y Linux.
- TypeScript en todo lo que no sea código nativo del launcher.

## 4. Enfoques considerados

| Decisión | Opciones | Elegida | Por qué |
|---|---|---|---|
| Escritorio | **Tauri 2** · Electron | Tauri 2 | Instaladores de ~5–10 MB frente a más de 100 MB y mucho menos consumo de RAM, que importa en una app que se queda abierta mientras juegas. Rust da acceso nativo a archivos, procesos y registro. El frontend React se reutiliza tal cual. Electron solo gana en homogeneidad del renderizado en Linux (WebKitGTK), y no compensa. |
| Backend | **Supabase** · backend propio (Node + Postgres) · Firebase | Supabase | Postgres, autenticación, almacenamiento y Edge Functions en un plan gratuito. **RLS** aplica la privacidad en la base de datos, así que un dato privado no sale ni aunque el frontend falle. Firebase no es relacional, y un backend propio exige hosting que no es gratis de forma fiable. |
| Hosting web | **Cloudflare Pages** · Vercel · GitHub Pages | Cloudflare Pages | Gratis y sin limitar el uso comercial (Vercel Hobby sí lo limita). Ya lo usas en `personal-website`. |
| Catálogo | **IGDB** · RAWG · copia completa | IGDB con caché bajo demanda | IGDB cubre más de 300 mil juegos de todas las épocas. Una copia completa no cabe en los 500 MB gratuitos, así que un juego se guarda en nuestra base de datos cuando alguien lo busca, lo importa o lo añade. Las imágenes se sirven desde la CDN de IGDB, no desde nuestro almacenamiento. |
| Monorepo | **pnpm + Turborepo** · Nx · repos separados | pnpm + Turborepo | Es ligero, comparte UI y tipos entre la web y el escritorio, y la caché de compilación no requiere configuración. |

## 5. Arquitectura

```
          ┌──────────────── packages/ui · packages/core (React + TS) ───────────────┐
          │                                                                         │
   apps/web (Vite) ── Cloudflare Pages                  apps/desktop (Tauri 2)
          │                                                │   └ Rust: detección de Steam,
          │                                                │     lanzamiento, rutas, opciones
          └──────────────► Supabase ◄──────────────────────┘
                           ├ Postgres + RLS  (datos y privacidad)
                           ├ Auth            (Discord / Google / GitHub OAuth)
                           ├ Storage         (avatares y banners)
                           └ Edge Functions  (Steam OpenID, Steam Web API, IGDB, códigos de lista)
                                  │
                         Steam Web API · IGDB (Twitch) · SteamGridDB
```

- **`packages/core`**: tipos, esquemas `zod`, cliente de Supabase y la interfaz `PlatformAdapter`. Steam es el primer adaptador.
- **`packages/ui`**: el sistema de diseño de Pulso (tokens, componentes y tarjeta de juego).
- **`apps/web`** y **`apps/desktop`** montan las mismas pantallas. El escritorio añade lo que solo puede hacer él a través de comandos Tauri.
- **Secretos** (clave de Steam Web API, credenciales de Twitch/IGDB): solo en las Edge Functions, nunca en el cliente.
- **Procesos en segundo plano**: la sincronización con Steam la lanza el usuario o el launcher al abrirse, con un mínimo de minutos entre una y otra. Sin colas ni crons hasta que haga falta.
- **Observabilidad**: Sentry con el plan gratuito, limpiando los tokens y datos personales de los informes.

## 6. Steam: qué se puede y qué no

| Dato | Endpoint oficial | Condición |
|---|---|---|
| Vincular la cuenta | Steam OpenID 2.0 | Gratis y sin contraseña: Steam devuelve el SteamID64 |
| Perfil público | `ISteamUser/GetPlayerSummaries` | — |
| Juegos y horas | `IPlayerService/GetOwnedGames` | El perfil y los "detalles de juego" deben ser públicos |
| Jugados recientemente | `IPlayerService/GetRecentlyPlayedGames` | Igual que el anterior |
| Logros del jugador | `ISteamUserStats/GetPlayerAchievements` | Igual que el anterior |
| Nombres e iconos de logros | `ISteamUserStats/GetSchemaForGame` | — |
| % global de cada logro | `ISteamUserStats/GetGlobalAchievementPercentagesForApp` | — |

- **Steam no es el método de login de Pulso.** Supabase Auth no lo admite, así que se entra con Discord, Google o GitHub y Steam se *vincula* después mediante OpenID, verificado en una Edge Function.
- Si un perfil es privado, la interfaz muestra "Tu perfil de Steam es privado" con los pasos para cambiarlo. No se muestra una biblioteca vacía como si lo fuera.
- Límite de la API: 100.000 llamadas al día por clave. Se cachean los esquemas de logros por juego y se limita la frecuencia de sincronización por usuario.
- Los logros internos de Pulso, si llegan a existir, se mostrarán siempre separados de los de Steam y marcados como tales.

## 7. Launcher (lo que solo hace el escritorio)

- **Detección**: lee `libraryfolders.vdf` y los `appmanifest_*.acf` de cada biblioteca de Steam. En Windows, la ruta de Steam sale del registro (`HKCU\Software\Valve\Steam`). En Linux se buscan `~/.steam/steam` y `~/.local/share/Steam`.
- **Lanzamiento**: `steam://rungameid/<appid>`, de modo que Steam gestiona el login, el DRM y las actualizaciones. Las opciones de lanzamiento propias de Pulso (argumentos, ejecutar como administrador o ejecutable alternativo) solo se aplican a los juegos que Pulso puede ejecutar directamente, y se marcan así.
- **Tres estados distintos** para cada juego: *lo tienes* (Steam lo dice), *está instalado* (detectado en el disco) y *Pulso puede lanzarlo*.
- **Archivos**: abrir la carpeta de instalación y ver su tamaño en disco.
- **Configuración en la nube**: las preferencias del launcher y las opciones por juego se guardan en Supabase (tabla `user_settings`), así que se recuperan en otro PC.
- **Extras**: inicio automático opcional, bandeja del sistema y actualizaciones con `tauri-plugin-updater` desde GitHub Releases.

## 8. Modelo de datos inicial

**Datos globales (de todos):**
- `games` (id, slug, nombre, resumen, fecha de salida, portada, géneros, plataformas, `igdb_id`, actualizado_en)
- `game_external_ids` (game_id, fuente `steam`|`igdb`, external_id), única por fuente y external_id. Sirve para no duplicar juegos al importar.
- `achievements` (game_id, fuente, api_name, nombre, descripción, icono, % global)

**Datos de cada usuario:**
- `profiles` (id = auth.uid, username único, avatar, banner, bio, enlaces)
- `privacy_settings` (visibilidad por apartado: biblioteca, logros, actividad, amigos → `public`|`friends`|`private`)
- `user_settings` (configuración del launcher en JSON)
- `linked_accounts` (user_id, plataforma, external_user_id, display_name, estado, última sincronización)
- `user_games` (user_id, game_id, estado, favorito, etiquetas, minutos jugados, último juego, origen `manual`|`steam`)
- `user_achievements` (user_id, achievement_id, desbloqueado_en)
- `game_lists` + `game_list_items` (listas propias, por ejemplo de pendientes, con visibilidad)
- `list_share_codes` (code, list_id, creado_por, caduca_en, revocado)
- `friendships` (solicitante, destinatario, estado `pending`|`accepted`|`declined`)
- `activity_events` (user_id, tipo, game_id, payload, fecha)
- `sync_runs` (user_id, plataforma, inicio, fin, resultado, error)
- `notifications` (user_id, tipo, payload, leída)

**Seguridad**: RLS en todas las tablas. Lo que ve otro usuario se decide con una función SQL `can_view(owner, apartado)` que tiene en cuenta la privacidad y la amistad.

**Códigos de lista**: los códigos son aleatorios, de 10 caracteres en base32 (por ejemplo, `PX7K-2M9Q-RT`). No se pueden adivinar, el dueño puede revocarlos y pueden caducar. Al cargar uno, una Edge Function **copia** la lista a la cuenta de quien lo carga, que puede editar su copia sin afectar al original. No hace falta cifrado: la seguridad está en que el código es aleatorio y revocable.

## 9. Diseño visual (dirección)

Oscuro por defecto, con fondos grafito y negro y superficies diferenciadas por tonos cercanos. Un único color de acento, las portadas como protagonistas, tipografía con personalidad y una fuente monoespaciada para cifras y horas. Bordes de 1 px con intención y esquinas rectas o poco redondeadas. Animaciones cortas. El logotipo es un pulso o latido simplificado, legible a 16 px. La paleta exacta, la tipografía y el logotipo se deciden en la fase 1 con maquetas antes de construir componentes.

## 10. Fases

1. **Fundamentos**: monorepo, sistema de diseño y logotipo, Supabase (esquema y RLS), login con OAuth, navegación, perfil básico y **esqueleto de Tauri ya desde aquí** (comparte frontend y así salen pronto los problemas de empaquetado). Workflow de releases como en tus otros repos.
2. **Producto**: catálogo IGDB con caché, biblioteca real con estados, filtros y etiquetas, perfiles públicos con privacidad, amigos y listas con códigos.
3. **Steam**: vinculación por OpenID, importación de juegos y horas, logros y sincronizaciones con su historial y sus errores.
4. **Launcher**: detección, lanzamiento, carpetas, opciones por juego, configuración en la nube, bandeja, inicio automático, instaladores y actualizaciones.
5. **Social**: actividad de amigos, comparativas y notificaciones.
6. **Estabilización**: pruebas, seguridad, rendimiento, documentación y monitorización.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| Perfiles de Steam privados | Mensaje claro con instrucciones y nada de datos inventados |
| IGDB es gratis solo para uso **no comercial** | Mientras Pulso no se monetice no hay problema. Si se monetiza, hay que pedir un acuerdo a Twitch o cambiar a otra fuente |
| Límite de 500 MB de Supabase | Caché bajo demanda del catálogo, imágenes en CDN externas y vigilancia del tamaño |
| Supabase pausa los proyectos con 7 días sin actividad | Aceptable durante el desarrollo; con usuarios reales no ocurre |
| SmartScreen avisa porque el instalador no está firmado | SignPath ofrece firma gratuita a proyectos open source; mientras tanto, se documenta el aviso |
| Emails de Supabase limitados a unos pocos por hora | Login solo con OAuth en el MVP |
| WebKitGTK en Linux renderiza distinto | Probar en Linux desde la fase 1, gracias al esqueleto temprano |

## 12. Decisiones tomadas por mí (revísalas)

- Login con Discord, Google y GitHub; Steam solo como cuenta vinculada.
- Pulso se trata como **no comercial** mientras no digas lo contrario, por la licencia de IGDB.
- Un código de lista crea una **copia**, no una lista compartida que se edite entre varios.
- La sincronización con Steam es manual o al abrir el launcher, no periódica en el servidor.
- Dominio inicial `pulso.pages.dev` (o el que esté libre).

## 13. Lo que queda a criterio del implementador

Librerías concretas de UI (enrutado, estado, tablas virtualizadas, gráficos), nombres de componentes, estructura interna de carpetas de cada app y estrategia de pruebas por paquete, siempre comprobando versiones y documentación antes de usarlas.
