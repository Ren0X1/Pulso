-- Pulso · esquema inicial
-- Datos globales (catálogo) separados de los datos de cada usuario.
-- RLS en todas las tablas: la privacidad se aplica aquí, no en el frontend.

create type public.privacy_level as enum ('public', 'friends', 'private');
create type public.game_status as enum ('backlog', 'playing', 'completed', 'dropped');
create type public.friendship_status as enum ('pending', 'accepted', 'declined');

-- ───────────────────────── Catálogo (global) ─────────────────────────

create table public.games (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  summary text,
  release_date date,
  cover_url text,
  genres text[] not null default '{}',
  platforms text[] not null default '{}',
  igdb_id bigint unique,
  updated_at timestamptz not null default now()
);
create index games_name_idx on public.games (lower(name));

-- Un juego puede venir de varias fuentes; esto evita duplicarlo al importar.
create table public.game_external_ids (
  game_id bigint not null references public.games (id) on delete cascade,
  source text not null check (source in ('steam', 'igdb')),
  external_id text not null,
  primary key (source, external_id)
);
create index game_external_ids_game_idx on public.game_external_ids (game_id);

create table public.achievements (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games (id) on delete cascade,
  source text not null check (source in ('steam')),
  api_name text not null,
  name text not null,
  description text,
  icon_url text,
  icon_locked_url text,
  hidden boolean not null default false,
  global_percent numeric(5, 2),
  unique (game_id, source, api_name)
);

-- ───────────────────────── Usuarios ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  avatar_url text,
  banner_url text,
  bio text not null default '' check (char_length(bio) <= 280),
  links jsonb not null default '[]',
  favorite_game_ids bigint[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

create table public.privacy_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  library public.privacy_level not null default 'public',
  achievements public.privacy_level not null default 'public',
  activity public.privacy_level not null default 'friends',
  friends public.privacy_level not null default 'friends'
);

create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  launcher jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.linked_accounts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('steam')),
  external_user_id text not null,
  display_name text,
  avatar_url text,
  profile_visibility text check (profile_visibility in ('public', 'private')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, platform),
  unique (platform, external_user_id)
);

create table public.user_games (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  status public.game_status not null default 'backlog',
  favorite boolean not null default false,
  tags text[] not null default '{}',
  playtime_minutes integer check (playtime_minutes >= 0),
  last_played_at timestamptz,
  source text not null check (source in ('manual', 'steam')),
  added_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id bigint not null references public.achievements (id) on delete cascade,
  unlocked_at timestamptz,
  primary key (user_id, achievement_id)
);

create table public.game_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  visibility public.privacy_level not null default 'private',
  created_at timestamptz not null default now()
);

create table public.game_list_items (
  list_id uuid not null references public.game_lists (id) on delete cascade,
  game_id bigint not null references public.games (id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key (list_id, game_id)
);

-- Códigos aleatorios en base32 (A-Z, 2-7): no adivinables, revocables y con caducidad opcional.
create table public.list_share_codes (
  code text primary key check (code ~ '^[A-Z2-7]{10}$'),
  list_id uuid not null references public.game_lists (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- Una sola relación por pareja, la pida quien la pida.
create unique index friendships_pair_key on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);

create table public.activity_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  game_id bigint references public.games (id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activity_events_user_idx on public.activity_events (user_id, created_at desc);

create table public.sync_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('steam')),
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index sync_runs_user_idx on public.sync_runs (user_id, started_at desc);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ───────────────────────── Funciones ─────────────────────────

create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  )
$$;

-- ¿Puede quien hace la consulta ver ese apartado del perfil de owner?
create function public.can_view(owner uuid, section text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  level public.privacy_level;
begin
  if owner = auth.uid() then
    return true;
  end if;
  select case section
           when 'library' then p.library
           when 'achievements' then p.achievements
           when 'activity' then p.activity
           when 'friends' then p.friends
         end
    into level
    from public.privacy_settings p
   where p.user_id = owner;
  return case level
           when 'public' then true
           when 'friends' then auth.uid() is not null and public.are_friends(owner, auth.uid())
           else false
         end;
end;
$$;

create function public.handle_new_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.privacy_settings (user_id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ───────────────────────── RLS ─────────────────────────
-- Sin política de escritura = solo el servidor (service_role) puede escribir.

alter table public.games enable row level security;
alter table public.game_external_ids enable row level security;
alter table public.achievements enable row level security;
alter table public.profiles enable row level security;
alter table public.privacy_settings enable row level security;
alter table public.user_settings enable row level security;
alter table public.linked_accounts enable row level security;
alter table public.user_games enable row level security;
alter table public.user_achievements enable row level security;
alter table public.game_lists enable row level security;
alter table public.game_list_items enable row level security;
alter table public.list_share_codes enable row level security;
alter table public.friendships enable row level security;
alter table public.activity_events enable row level security;
alter table public.sync_runs enable row level security;
alter table public.notifications enable row level security;

-- Catálogo: lectura pública.
create policy "catálogo legible" on public.games for select using (true);
create policy "ids externos legibles" on public.game_external_ids for select using (true);
create policy "logros legibles" on public.achievements for select using (true);

-- Perfil: la cabecera es pública; cada uno edita el suyo.
create policy "perfiles legibles" on public.profiles for select using (true);
create policy "editar mi perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "mi privacidad" on public.privacy_settings for select to authenticated
  using (user_id = auth.uid());
create policy "editar mi privacidad" on public.privacy_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "mis ajustes" on public.user_settings for select to authenticated
  using (user_id = auth.uid());
create policy "editar mis ajustes" on public.user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "mis cuentas vinculadas" on public.linked_accounts for select to authenticated
  using (user_id = auth.uid());
create policy "desvincular mis cuentas" on public.linked_accounts for delete to authenticated
  using (user_id = auth.uid());

-- Biblioteca: se ve según la privacidad; solo el dueño la cambia.
create policy "ver bibliotecas" on public.user_games for select
  using (public.can_view(user_id, 'library'));
-- Lo que viene de Steam (origen, horas) solo lo escribe el servidor.
create policy "añadir a mi biblioteca" on public.user_games for insert to authenticated
  with check (user_id = auth.uid() and source = 'manual' and playtime_minutes is null and last_played_at is null);
create policy "editar mi biblioteca" on public.user_games for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "quitar de mi biblioteca" on public.user_games for delete to authenticated
  using (user_id = auth.uid());

-- Logros: vienen verificados de Steam, así que solo los escribe el servidor.
create policy "ver logros" on public.user_achievements for select
  using (public.can_view(user_id, 'achievements'));

-- Listas.
create policy "ver listas" on public.game_lists for select using (
  owner_id = auth.uid()
  or visibility = 'public'
  or (visibility = 'friends' and auth.uid() is not null and public.are_friends(owner_id, auth.uid()))
);
create policy "crear mis listas" on public.game_lists for insert to authenticated
  with check (owner_id = auth.uid());
create policy "editar mis listas" on public.game_lists for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "borrar mis listas" on public.game_lists for delete to authenticated
  using (owner_id = auth.uid());

create policy "ver juegos de listas visibles" on public.game_list_items for select
  using (exists (select 1 from public.game_lists l where l.id = list_id));
create policy "gestionar juegos de mis listas" on public.game_list_items for all to authenticated
  using (exists (select 1 from public.game_lists l where l.id = list_id and l.owner_id = auth.uid()))
  with check (exists (select 1 from public.game_lists l where l.id = list_id and l.owner_id = auth.uid()));

create policy "mis códigos" on public.list_share_codes for select to authenticated
  using (created_by = auth.uid());
create policy "revocar mis códigos" on public.list_share_codes for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Amistades: las ven sus dos partes; se piden en nombre propio y solo las responde el destinatario.
create policy "mis amistades" on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "pedir amistad" on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy "responder solicitud" on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy "cancelar o eliminar amistad" on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Actividad: se ve según la privacidad; el launcher registra la del propio usuario.
create policy "ver actividad" on public.activity_events for select
  using (public.can_view(user_id, 'activity'));
create policy "registrar mi actividad" on public.activity_events for insert to authenticated
  with check (user_id = auth.uid());

-- Columnas que el usuario puede cambiar en filas que ya existen.
revoke update on public.user_games from anon, authenticated;
grant update (status, favorite, tags) on public.user_games to authenticated;
revoke update on public.friendships from anon, authenticated;
grant update (status, responded_at) on public.friendships to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (username, avatar_url, banner_url, bio, links, favorite_game_ids) on public.profiles to authenticated;
revoke update on public.privacy_settings from anon, authenticated;
grant update (library, achievements, activity, friends) on public.privacy_settings to authenticated;

create policy "mis sincronizaciones" on public.sync_runs for select to authenticated
  using (user_id = auth.uid());

create policy "mis notificaciones" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "marcar mis notificaciones" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
