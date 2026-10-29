# 📓 Changelog

Todas las novedades destacables de **Pulso**.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/).

> ℹ️ **Versionado propio**: `MAJOR.FEATURE.MINOR.fFIX` (ej. `0.1.0.f0`).
> El workflow de releases calcula la versión en cada push a `main` según las líneas cambiadas
> (`major:`/BREAKING fuerza **MAJOR**). Al subir una parte, las de su derecha se reinician.

---

## [4.0.1.f0] - 2026-10-29 · 🌍 Pulso, en abierto
### ✨ Añadido
- 🌍 **La web ya está publicada** en [pulso.dpdns.org](https://pulso.dpdns.org) (Cloudflare Pages, gratis) y se vuelve a publicar sola con cada versión.
- 🎧 **Discord renovado**: en la lista de miembros sale solo el juego (*Jugando a Half-Life*); en tu tarjeta, la portada ("Jugando a Half-Life usando Pulso"), tus logros y horas en ese juego o 🏆 *Platino*, tus platinos totales, el tiempo de partida y botones a Steam y a tu perfil de Pulso.

### 🧪 Calidad
- 🐧 Cada release instala el `.deb` y el AppImage en un Ubuntu limpio y comprueba que Pulso arranca.
- ⬆️ Probada la actualización automática de punta a punta en Windows (4.0.0 → 4.0.100).

## [1.1.0.f0] - 2026-10-23 · 🎮 tu biblioteca de verdad
### ✨ Añadido
- 🔄 **Sincronizar con Steam**: importa tus juegos, horas y última partida, y los logros (25 juegos por tanda, empezando por lo que juegas ahora). Si tu perfil o tus detalles de juego son privados, Pulso te dice qué cambiar en Steam en vez de enseñar una biblioteca vacía.
- 🏆 **Logros**: totales, progreso por juego con barra, recientes con su rareza global y la lista completa en el detalle de cada juego (los ocultos no revelan su nombre hasta que los consigues).
- 🌍 **Catálogo mundial (IGDB)**: busca cualquier juego, de los clásicos a los estrenos. Lo encontrado se guarda en caché y completa los juegos importados de Steam en vez de duplicarlos.
- 📚 **Biblioteca**: cuadrícula de portadas o lista, estados (*Pendiente, Jugando, Completado, Abandonado*), favoritos, etiquetas, búsqueda, orden y filtros que se guardan en la URL; de 60 en 60.
- 👥 **Amigos**: buscar jugadores, solicitudes, lista de amigos y botón de amistad en los perfiles.
- 🔗 **Listas compartibles**: genera un código `XXXX-XXXX-XX`; quien lo carga recibe una copia privada. Revocables.
- 👤 Perfil con biblioteca y listas según la privacidad de cada uno; Inicio con tus últimos juegos y solicitudes pendientes.
- 🏆 **Platinos**: los juegos con todos sus logros de Steam llevan insignia en la portada, en la lista y en el detalle, y el perfil muestra cuántos tienes junto a tu nombre y una vitrina con todos.
- 🤝 **Listas compartidas**: invita a tus amigos a una lista como lectores o editores; los editores añaden y quitan juegos de la misma lista. Aparecen en *Compartidas contigo* y cualquiera puede salirse.

### 👤 Perfil y estadísticas
- 🖼️ **Avatar y banner propios**: se recortan y se guardan en WebP (máx. 2 MB); el avatar puede volver al de Steam cuando quieras.
- 🔗 **Enlaces** en el perfil (Twitch, YouTube, X, Kick, Instagram, TikTok, Steam o tu web), hasta 6 y solo `https`.
- ⭐ **Juegos favoritos**: elige hasta 6 de tu biblioteca y salen los primeros en tu perfil.
- 📊 **Estadísticas**: horas jugadas, juegos sin estrenar, los 10 más jugados, tu biblioteca por estado y logros por mes de los últimos dos años.
- ⬇️ La web ofrece **descargar el launcher** para Windows o Linux, solo desde un ordenador (ni en el móvil ni dentro del propio launcher).

### 👥 Social
- 🔔 **Notificaciones**: solicitudes de amistad, quién las acepta e invitaciones a listas, con contador en la barra superior. Las crea la propia base de datos.
- 📰 **Actividad de amigos** en Inicio: a qué juegan y sus platinos nuevos, según la privacidad de cada uno.
- ⚖️ **Comparar** con cualquier jugador: juegos en común, horas y logros de cada uno, y platinos.

### 🖥️ Launcher
- 💾 Detecta tus juegos de Steam instalados en todos los discos, con su tamaño, y el filtro **Instalados** en la biblioteca.
- ▶️ **Jugar** a través de Steam, con **parámetros de lanzamiento** propios por juego (se guardan en tu cuenta), **Abrir carpeta** e **Instalar en Steam**.
- 🎮 Sabe a qué estás jugando aunque lo abras desde Steam ("● Jugando a … · 12 min") y cada partida queda en **Actividad** con su duración.
- 🎧 **Discord Rich Presence**: tu estado muestra el juego, su portada, el tiempo y un botón a su página de Steam. Se puede desactivar.
- 🧷 Se queda en la bandeja al cerrar la ventana y puede **iniciarse con Windows**, minimizado.
- ⬆️ **Se actualiza solo** desde las releases de GitHub (versiones firmadas). Instalador NSIS de 2 MB.

### ⚡ Rendimiento y estabilidad
- Cada pantalla se descarga al visitarla: al abrir Pulso se cargan 164 KB comprimidos en vez de 204 KB.
- Si una pantalla falla, sale un mensaje con "Recargar" y "Volver al inicio" en vez de una página en blanco.
- Instaladores de Windows (`.exe`) y Linux (`.deb`, `.AppImage`) firmados en cada release.

### 🔒 Seguridad
- Las funciones auxiliares de privacidad salen de la API pública (`are_friends` dejaba averiguar amistades ajenas).
- Políticas RLS optimizadas y amistades visibles según la privacidad de la lista de amigos.

---

## [0.1.0.f0] - sin publicar · 🌱 fundamentos
### ✨ Añadido
- 🧱 Monorepo con pnpm y Turborepo, CI en GitHub Actions y releases automáticas.
- 🔐 **Login con Steam** por OpenID, verificado en el servidor (Edge Function `auth-steam`): sin contraseñas ni correos. La cuenta de Pulso se crea al entrar por primera vez, con Steam ya vinculado.
- 🗄️ Esquema de base de datos completo (catálogo, bibliotecas, logros, listas, amistades, actividad) con **RLS en todas las tablas** y privacidad por apartado (*público · amigos · privado*). Lo que viene de Steam solo lo escribe el servidor.
- 🎨 Sistema de diseño *true-black flat* y logotipo del latido.
- 🧭 Web con navegación (barra lateral en escritorio, barra inferior en móvil), perfil público en `/u/<usuario>` y ajustes de perfil y privacidad.
- 🖥️ Esqueleto del launcher con Tauri 2: la misma app y vuelta del login por el enlace `pulso://`.

### 🧪 Pruebas
- 18 tests de RLS sobre Postgres en memoria (PGlite), 18 del login con Steam, 10 de usernames, 11 de componentes y 7 del callback.
