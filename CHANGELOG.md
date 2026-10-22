# 📓 Changelog

Todas las novedades destacables de **Pulso**.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/).

> ℹ️ **Versionado propio**: `MAJOR.FEATURE.MINOR.fFIX` (ej. `0.1.0.f0`).
> El workflow de releases calcula la versión en cada push a `main` según las líneas cambiadas
> (`major:`/BREAKING fuerza **MAJOR**). Al subir una parte, las de su derecha se reinician.

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
