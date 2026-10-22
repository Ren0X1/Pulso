# Pulso · Fase 1 (Fundamentos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un monorepo que arranca: la web y el launcher Tauri muestran la misma app de Pulso, se entra con Steam, existe el esquema de datos con RLS probada y el perfil básico se puede ver y editar.

**Architecture:** Un único frontend React (`apps/web`) que el launcher (`apps/desktop`, solo `src-tauri`) empaqueta tal cual; lo exclusivo del escritorio se detecta en tiempo de ejecución con `isTauri()`. Supabase en la nube con migraciones SQL versionadas; el login con Steam es una Edge Function (`auth-steam`) cuya lógica OpenID vive en un módulo puro probado con Vitest.

**Tech Stack:** pnpm 11 + Turborepo 2 · TypeScript 7 · React 19 + Vite 8 + React Router 8 · Vitest 5 · zod 4 · @supabase/supabase-js 2 · PGlite (Postgres en WASM para probar RLS sin Docker) · Tauri 2 (Rust) · Deno (Edge Functions).

**Spec:** `docs/superpowers/specs/2026-10-22-pulso-design.md`

## Global Constraints

- 0 €: solo planes gratuitos; nada que pida tarjeta.
- Login solo con Steam; email sintético `<steamid64>@steam.pulso.invalid`.
- Secretos (`STEAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) solo en Edge Functions; el cliente usa la clave anon/publishable.
- RLS activada en **todas** las tablas de `public`.
- Privacidad por apartado: `public` | `friends` | `private`.
- Username: 3–20 caracteres, `[a-z0-9_]`, único sin distinguir mayúsculas.
- Interfaz en español; README en inglés; commits `tipo(ámbito): texto en español`.
- Oscuro por defecto, un único color de acento, sin gradientes ni neón.
- No se presentan datos inventados como reales; los datos de demostración llevan la etiqueta "Demo".
- Versionado `MAJOR.FEATURE.MINOR.fFIX` con el workflow de releases de RGL-Discord-BOT.

## Review Focus

1. Respuesta OpenID falsificada (sin `check_authentication` válido, `op_endpoint` ajeno o `claimed_id` con formato raro): debe rechazarse sin crear sesión → tests en Task 4.
2. `state` que no coincide o falta al volver del login (CSRF o inyección de sesión): la app no debe guardar la sesión → tests en Task 6.
3. Un usuario lee o modifica datos de otro saltándose el frontend (consulta directa a la API): RLS debe devolver 0 filas o error → tests en Task 3.
4. Nombre de Steam con emojis, espacios, mayúsculas o de 1 carácter, o username ya ocupado: el username sugerido sigue siendo válido y único → tests en Task 2.
5. Redirección final del login hacia un dominio que no es de Pulso (open redirect): el destino sale solo de la configuración del servidor → test en Task 4.

---

## File structure

```
package.json · pnpm-workspace.yaml · turbo.json · tsconfig.base.json · VERSION · CHANGELOG.md
.github/workflows/ci.yml · .github/workflows/release.yml
packages/core/src/{username.ts, privacy.ts, env.ts, supabase.ts, platform.ts, index.ts}
packages/ui/src/{tokens.css, Logo.tsx, Button.tsx, Field.tsx, Avatar.tsx, index.ts}
supabase/config.toml · supabase/migrations/20261022000000_init.sql
supabase/tests/{harness.ts, rls.test.ts}
supabase/functions/_shared/{steam-openid.ts, steam-openid.test.ts, redirect.ts}
supabase/functions/auth-steam/index.ts
apps/web/src/{main.tsx, router.tsx, lib/auth.ts, lib/auth-callback.ts, layout/AppShell.tsx, pages/*.tsx}
apps/desktop/{package.json, src-tauri/...}
```

---

### Task 1: Monorepo, calidad y releases

**Files:** Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml` (copiado de `RGL-Discord-BOT`, adaptado a Pulso), `VERSION` (`0.1.0.f0`), `CHANGELOG.md`.

**Interfaces:** Produces: scripts raíz `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm dev`; workspaces `apps/*`, `packages/*`, `supabase`.

- [ ] Crear los ficheros; `ci.yml` ejecuta `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build` en push y PR.
- [ ] `pnpm install && pnpm turbo run typecheck` → termina sin errores (sin paquetes aún, 0 tareas).
- [ ] Commit `chore: monorepo con pnpm, Turborepo, CI y versionado`.

### Task 2: `packages/core`

**Interfaces — Produces:**
- `usernameSchema: z.ZodString` (3–20, `^[a-z0-9_]+$`)
- `suggestUsername(persona: string, steamId: string, isTaken: (u: string) => boolean): string`
- `privacyLevel = z.enum(['public','friends','private'])`; `type PrivacySection = 'library'|'achievements'|'activity'|'friends'`
- `createPulsoClient(url: string, anonKey: string): SupabaseClient`
- `interface PlatformAdapter { id: 'steam'; displayName: string; capabilities: { games: boolean; playtime: boolean; achievements: boolean } }`

- [ ] **Tests** (`username.test.ts`): `suggestUsername('Ren0X1 🔥','7656…',()=>false) === 'ren0x1'`; `'A'` → empieza por `'a'` y cumple el esquema (rellena con el final del SteamID); persona solo emojis → `'player_' + últimos 6 del SteamID`; con `isTaken` que devuelve true para `'ren0x1'` → `'ren0x1_2'`; persona de 40 caracteres → longitud ≤ 20; resultado siempre pasa `usernameSchema`.
- [ ] Ejecutar → fallan. Implementar (normalizar NFKD, minúsculas, `[^a-z0-9_]`→`_`, colapsar `_`, recortar). Ejecutar → pasan.
- [ ] Commit `feat(core): esquemas de usuario y privacidad y cliente de Supabase`.

### Task 3: Esquema de base de datos y RLS

**Files:** `supabase/migrations/20261022000000_init.sql`, `supabase/tests/harness.ts`, `supabase/tests/rls.test.ts`.

**Interfaces — Produces:** tablas del spec §8; función `public.can_view(owner uuid, section text) returns boolean` (`security definer`, `stable`): dueño → true; `public` → true; `friends` → true si hay `friendships` aceptada entre `auth.uid()` y `owner`; si no, false. `profiles` siempre legible (username, avatar, banner, bio); el resto de tablas de usuario con política `select using (can_view(user_id, '<apartado>'))` y escrituras `using/with check (user_id = auth.uid())`. `games`, `game_external_ids`, `achievements` legibles por todos y escritura solo `service_role`. `linked_accounts`, `user_settings`, `sync_runs`, `notifications`, `list_share_codes`: solo el dueño.

`harness.ts` arranca PGlite, crea lo mínimo de Supabase (`auth.users`, `auth.uid()` leyendo `request.jwt.claim.sub`, roles `anon`, `authenticated`, `service_role`), aplica la migración y expone `asUser(id, sql)`.

- [ ] **Tests**: B no ve la biblioteca de A con `library='private'`; la ve con `'public'`; con `'friends'` solo si la amistad está `accepted` (no con `pending`); B no puede `update` el perfil de A (0 filas); B no puede leer `linked_accounts` ni `user_settings` de A; `anon` no puede insertar en `games`; dos perfiles con `Ren0X1` y `ren0x1` → el segundo falla por unicidad.
- [ ] Ejecutar → fallan; escribir la migración; ejecutar → pasan.
- [ ] Commit `feat(db): esquema inicial con RLS y privacidad por apartado`.

### Task 4: Login con Steam (Edge Function)

**Interfaces — Produces** (`_shared/steam-openid.ts`, sin dependencias):
- `buildSteamLoginUrl(returnTo: string): string` (`openid.ns` 2.0, `mode=checkid_setup`, `identity` y `claimed_id` = identifier_select, `realm` = origen de `returnTo`)
- `verifySteamAssertion(params: URLSearchParams, expectedReturnTo: string, fetchFn: typeof fetch): Promise<string | null>` → SteamID64 o null
- `_shared/redirect.ts`: `finalRedirect(client: 'web'|'desktop', appUrl: string, tokens: {access_token: string; refresh_token: string}, state: string): string`

- [ ] **Tests**: URL de login contiene los parámetros exactos; aserción válida + respuesta `is_valid:true` → `'76561198000000000'`; `is_valid:false` → null; `op_endpoint` distinto de `https://steamcommunity.com/openid/login` → null sin llamar a fetch; `claimed_id` que no casa `^https://steamcommunity\.com/openid/id/(\d{17})$` → null; `return_to` distinto del esperado → null; `mode` ≠ `id_res` → null; `finalRedirect('web', …)` empieza por `appUrl + '/auth/callback#'`; `'desktop'` por `pulso://auth/callback#`.
- [ ] Ejecutar → fallan; implementar; ejecutar → pasan.
- [ ] `auth-steam/index.ts` (Deno): `?action=start&client&state` → 302 a Steam; `?action=callback` → verifica, busca `linked_accounts` (steam), si no existe `auth.admin.createUser` + perfil (`suggestUsername` con persona de `GetPlayerSummaries`) + `linked_accounts`; sesión con `auth.admin.generateLink({type:'magiclink'})` + `verifyOtp({token_hash})`; 302 a `finalRedirect`. `APP_URL` sale del entorno, nunca de la petición. Errores → 302 a `/login?error=<código>`.
- [ ] Commit `feat(auth): login con Steam por OpenID verificado en el servidor`.

### Task 5: Sistema de diseño `packages/ui`

**Interfaces — Produces:** `tokens.css` (variables `--pulso-*`: bg, surface-1/2/3, border, text, text-muted, accent, accent-contrast, danger, radius-sm 4px, radius-md 6px, space-1…8, font-sans, font-mono), `<Logo size?: number />`, `<Button variant: 'primary'|'ghost'|'danger' />`, `<Field label error />`, `<Avatar src name size />`.

- [ ] **Tests** (jsdom): `Button` renderiza `<button>` con `type="button"` por defecto; `Field` asocia el label con el input y anuncia el error con `aria-describedby`; `Avatar` sin `src` muestra la inicial y tiene `alt`/`aria-label` con el nombre.
- [ ] Implementar; tests pasan. Commit `feat(ui): tokens, logotipo y componentes base`.

### Task 6: App web: navegación, login y perfil

**Interfaces — Produces:** `parseAuthCallback(hash: string, expectedState: string | null): { ok: true; access_token: string; refresh_token: string } | { ok: false; error: 'state_mismatch'|'missing_tokens' }`; rutas `/login`, `/auth/callback`, `/` (Inicio), `/biblioteca`, `/actividad`, `/logros`, `/amigos`, `/u/:username`, `/ajustes`.

- [ ] **Tests**: `parseAuthCallback` con state correcto → ok; state distinto → `state_mismatch`; `expectedState` null → `state_mismatch`; sin `refresh_token` → `missing_tokens`.
- [ ] Implementar `AppShell` (rail lateral en escritorio, barra inferior en móvil), página de login, callback (guarda la sesión solo si `ok`), rutas protegidas, perfil (`/u/:username`) y edición en Ajustes (username con `usernameSchema`, bio ≤ 280). Las secciones aún vacías muestran un estado vacío honesto ("Llega en la Fase 2"), sin datos inventados.
- [ ] `pnpm --filter web build` correcto. Commit `feat(web): navegación, login con Steam y perfil básico`.

### Task 7: Launcher Tauri

**Files:** `apps/desktop/package.json`, `apps/desktop/src-tauri/{Cargo.toml, tauri.conf.json, build.rs, src/main.rs, src/lib.rs, capabilities/default.json, icons/}`.

- [ ] `tauri.conf.json`: `devUrl` = servidor de Vite de `apps/web`, `frontendDist` = `../../web/dist`, identificador `com.renox.pulso`, plugins `deep-link` (esquema `pulso`), `opener` y `single-instance` (para que el enlace `pulso://` llegue a la ventana abierta).
- [ ] En web: si `isTauri()`, el login abre el navegador del sistema con `openUrl` y escucha `onOpenUrl` para pasar el hash por `parseAuthCallback`.
- [ ] `pnpm --filter desktop tauri build --debug` termina y genera el ejecutable. Commit `feat(desktop): esqueleto del launcher con Tauri y deep link de login`.

### Task 8: Documentación

- [ ] `CLAUDE.md` del proyecto (en español: entorno, comandos, despliegue de Supabase, variables), README actualizado (estado y puesta en marcha), `.env.example`, CHANGELOG 0.1.0.
- [ ] Commit `docs: puesta en marcha de la Fase 1`.
