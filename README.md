# 💓 Pulso

![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white) ![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black) ![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?style=flat-square&logo=tauri&logoColor=white) ![Rust](https://img.shields.io/badge/Rust-desktop%20core-000000?style=flat-square&logo=rust&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20db-3FCF8E?style=flat-square&logo=supabase&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-RLS-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![Cloudflare Pages](https://img.shields.io/badge/Cloudflare-Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white) ![Steam](https://img.shields.io/badge/Steam-Web%20API-000000?style=flat-square&logo=steam&logoColor=white) ![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?style=flat-square&logo=windows&logoColor=white) ![Linux](https://img.shields.io/badge/Linux-supported-FCC624?style=flat-square&logo=linux&logoColor=black)

> **Your whole gaming world, in one place.** A desktop launcher for Windows and Linux plus a social web app on the same account: your library, achievements, playtime, backlog lists and friends, synced from Steam. 🎮

Pulso does not replace Steam — it sits on top of it. The launcher finds your installed games, starts them through Steam, opens their folders and keeps your settings in the cloud; the web lets you show off your profile, compare achievements with friends and share backlog lists with a single code. Everything runs on free tiers. 💸

> 🚧 **Status: phases 1–3 of 6.** Sign in through Steam, import your Steam library with playtime and achievements, search the world catalog, manage your library, add friends and share lists with a code — on the web and in the desktop shell. Launching games and Discord Rich Presence come next (phase 4). See the [roadmap](#️-roadmap) and [`CHANGELOG.md`](CHANGELOG.md).

---

## 🧰 Tech stack

| Area | Technology |
|------|------------|
| Language | TypeScript everywhere · Rust for the desktop core |
| UI | React + Vite, one shared design system for web and desktop |
| Desktop | [Tauri 2](https://tauri.app/) — small installers, low RAM, native file and process access |
| Backend | [Supabase](https://supabase.com/) — Postgres, Auth, Storage, Edge Functions |
| Login | **Sign in through Steam** (OpenID 2.0, verified server-side) — no passwords, no emails |
| Privacy | Postgres Row Level Security: private data never leaves the database, whatever the frontend does |
| Game catalog | [IGDB](https://www.igdb.com/) — 300k+ games from the '70s to today, cached on demand |
| Artwork | IGDB CDN · [SteamGridDB](https://www.steamgriddb.com/) |
| Integrations | Steam OpenID + Steam Web API (games, playtime, achievements) |
| Web hosting | Cloudflare Pages |
| Monorepo | pnpm + Turborepo |
| CI/CD | GitHub Actions — versioning, releases and desktop installers |
| Updates | `tauri-plugin-updater` from GitHub Releases |
| Discord | Rich Presence over Discord's local IPC (Rust) |

---

## ✨ What it will do

### 🗂️ Library
- Every game you own on Steam plus any game from the world catalog, old or new.
- Status per game — *backlog, playing, completed, dropped* — favorites, tags, search and filters.
- Grid and list views that stay fast with thousands of games.
- Three separate facts per game: **you own it**, **it is installed**, **Pulso can launch it**.

### 🏆 Achievements and stats
- Real Steam achievements with global rarity, progress per game and recent unlocks.
- Playtime, completion rates and charts.
- If Steam does not share something (private profile, game without achievements), Pulso **says so** instead of showing made-up numbers.

### 👥 Social
- Gamer profile with avatar, banner, bio and favorites, with privacy per section: *public · friends · private*.
- Friend requests, friends' activity, games in common and side-by-side comparisons.
- 🔗 **Shareable lists**: share a backlog with a code like `PX7K-2M9Q-RT`; whoever loads it gets their own copy.

### 🖥️ Desktop launcher
- Detects installed Steam games on Windows and Linux.
- Launches them through Steam (`steam://rungameid/…`), so login, DRM and updates stay with Steam.
- Opens the install folder, shows the size on disk and keeps per-game launch options.
- 🎧 **Discord Rich Presence**: your Discord status shows the game you are playing, its cover art, session time and a link to your Pulso profile — even when you launched it from Steam.
- Settings synced to your account, tray icon, optional start with the system and auto-updates.

---

## 🗺️ How it fits together

```
 packages/ui + packages/core  (shared React + TypeScript)
        │                              │
  apps/web (Cloudflare Pages)    apps/desktop (Tauri 2 + Rust)
        │                              │
        └────────► Supabase ◄──────────┘
                   Postgres + RLS · Auth · Storage · Edge Functions
                          │
              Steam Web API · IGDB · SteamGridDB
```

API keys (Steam, IGDB) live only in Supabase Edge Functions — never in the apps.

---

## 🛣️ Roadmap

| Phase | Scope | State |
|-------|-------|-------|
| 1️⃣ Foundations | Monorepo, design system and logo, database and RLS, Steam login, navigation, basic profile, Tauri shell | 🟢 Done |
| 2️⃣ Product | Catalog, real library, public profiles, friends, shareable lists | 🟢 Done |
| 3️⃣ Steam | Game and playtime import, achievements | 🟢 Done |
| 4️⃣ Launcher | Detection, launching, folders, launch options, now-playing detection, Discord Rich Presence, cloud settings, installers | ⚪ Pending |
| 5️⃣ Social | Friends' activity, comparisons, notifications | ⚪ Pending |
| 6️⃣ Launch | Tests, security, performance, monitoring | ⚪ Pending |

The full design lives in [`docs/superpowers/specs/2026-10-22-pulso-design.md`](docs/superpowers/specs/2026-10-22-pulso-design.md).

---

## 📁 Repository layout

```
Pulso/
├── apps/
│   ├── web/              # web app (Vite + React)
│   └── desktop/          # launcher (Tauri 2, Rust in src-tauri/)
├── packages/
│   ├── ui/               # Pulso design system
│   └── core/             # types, validation, Supabase client, platform adapters
├── supabase/
│   ├── migrations/       # database schema and RLS policies
│   └── functions/        # Edge Functions (Steam, IGDB, list codes)
└── docs/                 # design and decisions
```

---

## 🚀 Run it yourself

Everything below is free. You need **Node 22+**, **pnpm 11** and, for the desktop app, **Rust** plus the **MSVC C++ Build Tools** on Windows (WebKitGTK on Linux).

### 1️⃣ Install

```bash
git clone https://github.com/Ren0X1/Pulso.git && cd Pulso
pnpm install
```

### 2️⃣ Create the backend (Supabase free plan)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push                                   # schema + Row Level Security
cp supabase/.env.example supabase/.env                 # add your free Steam Web API key
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy auth-steam
```

Get a Steam Web API key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey).

### 3️⃣ Start the web app

```bash
cp apps/web/.env.example apps/web/.env                 # your project URL + public anon key
pnpm dev                                               # http://localhost:5173
```

### 4️⃣ Start the desktop launcher

```bash
pnpm --filter desktop dev                              # hot reload
pnpm --filter desktop tauri build                      # installer: NSIS on Windows, deb/AppImage on Linux
```

### 🧪 Checks

```bash
pnpm test        # unit tests + RLS tests on an in-memory Postgres (PGlite, no Docker)
pnpm typecheck
pnpm build
```

---

> 🔒 Open source and zero budget: built only on free tiers. API keys and environment files (`.env`) are **not** part of this repository.
