# Pulso · Fase 2 (Producto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La biblioteca deja de estar vacía: catálogo mundial (IGDB) buscable, biblioteca propia con estados, favoritos, etiquetas y filtros, amigos y listas que se comparten con un código.

**Architecture:** Igual que la Fase 1. El catálogo es una Edge Function (`catalog`) que consulta IGDB con credenciales de Twitch, guarda en caché lo que encuentra en `games` + `game_external_ids` (service role) y devuelve filas propias. Los códigos de lista son funciones SQL `security definer` expuestas a `authenticated` a propósito (crear y canjear), con tests de RLS. Todo lo demás es la API de Supabase con RLS.

**Tech Stack:** el de la Fase 1. Sin dependencias nuevas salvo lo imprescindible.

**Spec:** `docs/superpowers/specs/2026-10-22-pulso-design.md` (§2 objetivos, §8 modelo de datos, §10 fase 2)

## Global Constraints

- 0 €. IGDB gratis (uso no comercial), credenciales de Twitch como secretos `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`.
- Portadas desde la CDN de IGDB (`https://images.igdb.com/igdb/image/upload/t_cover_big/<image_id>.jpg`); no se almacenan.
- Lo que viene de Steam sigue siendo solo del servidor: la biblioteca manual usa `source = 'manual'`.
- Códigos de lista: 10 caracteres `[A-Z2-7]`, mostrados como `XXXX-XXXX-XX`; canjear crea una **copia** privada.
- Cada política o función nueva de la base de datos lleva su test en `supabase/tests/`.
- Diseño true-black flat; portadas con radio 6px; el lima solo en datos.
- Nada inventado: estados vacíos honestos; si IGDB no responde, se dice.

## Review Focus

1. Búsqueda con comillas, punto y coma o texto vacío (inyección en la consulta Apicalypse): se escapa o se rechaza → test en Task 3.
2. Canjear un código revocado, caducado, inexistente o el propio: error claro, nada copiado → tests en Task 5.
3. Ver la lista de amigos o la biblioteca de alguien con privacidad `private`/`friends` desde fuera → tests en Task 1 y 2.
4. Solicitud de amistad a uno mismo o duplicada, o aceptar algo que no te enviaron → tests (Fase 1) + UI que no ofrece la acción.
5. Biblioteca de cientos de juegos: paginada (60 por página), sin cargar todo → Task 4.

---

### Task 1: Rendimiento y visibilidad de amistades

**Files:** `supabase/migrations/20261023000000_rls_perf.sql`, `supabase/tests/rls.test.ts`

- [ ] Test: con `friends = 'public'` de A, B ve las amistades aceptadas de A; con `'friends'` solo si B es amigo; con `'private'` no; nunca ve solicitudes pendientes de otros.
- [ ] Migración: reescribir todas las políticas con `(select auth.uid())`; índices en las claves foráneas que señala el asesor; una sola política de lectura en `game_list_items`; política de lectura de `friendships` para terceros según `private.can_view(.., 'friends')` solo con `status = 'accepted'`.
- [ ] Tests pasan; aplicar con MCP; asesores sin avisos de seguridad. Commit `perf(db): ...`.

### Task 2: Amigos

**Interfaces — Produces:** `friendshipWith(me: string, other: string, rows: FriendshipRow[]): 'none'|'outgoing'|'incoming'|'friends'` en `apps/web/src/lib/friends.ts`.

- [ ] Tests de `friendshipWith` (sin fila, enviada por mí, recibida, aceptada en cualquier dirección, rechazada → `none`).
- [ ] Página Amigos: buscador de jugadores (por username, mínimo 2 caracteres, 10 resultados), solicitudes recibidas (aceptar/rechazar), enviadas (cancelar), lista de amigos (eliminar). Contador de solicitudes recibidas en la navegación ("Amigos 2").
- [ ] Botón de amistad en el perfil público según `friendshipWith`.
- [ ] Commit `feat(amigos): ...`.

### Task 3: Catálogo IGDB

**Interfaces — Produces** (`supabase/functions/_shared/igdb.ts`, sin dependencias):
- `buildSearchQuery(term: string, limit = 20): string` — `search "<term>"; fields name,slug,summary,first_release_date,cover.image_id,genres.name,platforms.abbreviation,external_games.uid,external_games.external_game_source; where game_type = (0,8,9,10,11); limit N;` con `"` y `\` escapados.
- `mapIgdbGame(raw): { game: GameRow; steamAppIds: string[] }`, `coverUrl(imageId): string`.
- Edge Function `catalog` (con JWT): `GET ?q=` → token de Twitch en memoria hasta caducar → IGDB → upsert en `games` (por `igdb_id`) y `game_external_ids` → devuelve las filas de `games`.

- [ ] Tests: escapado de comillas y barras; término vacío o de 1 carácter → error; mapeo con y sin portada, fecha Unix → `YYYY-MM-DD`, Steam detectado por `external_game_source = 1`.
- [ ] Desplegar; probar con un término real cuando existan los secretos. Commit `feat(catalogo): ...`.

### Task 4: Biblioteca

- [ ] `apps/web/src/lib/library.ts`: `parseLibraryParams(search: URLSearchParams)` → `{ status?, favorite, tag?, q, sort: 'added'|'name'|'playtime', view: 'grid'|'list', page }` con valores por defecto y saneado. Tests.
- [ ] Página Biblioteca: barra con búsqueda, filtros de estado (pestañas subrayadas), favoritos, etiqueta, orden y vista; cuadrícula de portadas o tabla; 60 por página con "Cargar más"; total.
- [ ] Añadir juego: diálogo de búsqueda en el catálogo → "Añadir a mi biblioteca" (estado inicial *Pendiente*).
- [ ] Detalle en la propia tarjeta/fila: cambiar estado, favorito, etiquetas, quitar.
- [ ] Commit `feat(biblioteca): ...`.

### Task 5: Listas y códigos

**Files:** `supabase/migrations/20261023010000_share_codes.sql`, tests RLS, `apps/web/src/pages/Lists.tsx`

- [ ] SQL: `public.create_share_code(list uuid) returns text` (solo el dueño; código aleatorio base32 con `gen_random_bytes`), `public.redeem_share_code(code text) returns uuid` (no revocado, no caducado, no propio → copia la lista y sus juegos como privada del que canjea). `revoke execute ... from anon`.
- [ ] Tests: crear solo el dueño; canjear copia nombre y juegos; revocado/caducado/inexistente/propio → error; la copia es independiente.
- [ ] UI: página Listas (crear, renombrar, visibilidad, añadir juegos desde la biblioteca o el catálogo, quitar), "Compartir" muestra el código `XXXX-XXXX-XX` y permite revocarlo, "Cargar código".
- [ ] Commit `feat(listas): ...`.

### Task 6: Perfil público e Inicio

- [ ] Perfil: favoritos y biblioteca (primeros 12) si la privacidad lo permite; si no, "Biblioteca privada" / "Solo para amigos". Listas públicas.
- [ ] Inicio: añadidos recientemente y solicitudes de amistad pendientes.
- [ ] README/CHANGELOG/CLAUDE.md. Commit `docs: ...`.
