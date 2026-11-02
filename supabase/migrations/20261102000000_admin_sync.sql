-- Panel de administración y sincronización que sigue sola en el servidor.

-- ───────────────────────── Administradores ─────────────────────────
-- Quién puede entrar al panel. Solo lo cambia la Edge Function `admin` (que comprueba que quien lo pide es
-- administrador): desde la API nadie puede insertar ni borrar.
create table public.app_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

create function private.is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = uid)
$$;
revoke execute on function private.is_admin(uuid) from public, anon;
grant execute on function private.is_admin(uuid) to authenticated;

-- Cada uno puede saber si él es administrador; los administradores ven la lista entera.
create policy "ver administradores" on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin((select auth.uid())));

-- El primer administrador: la cuenta de Steam de Ren0X1 (si ya existe; en otra base de datos no hace nada).
insert into public.app_admins (user_id)
select user_id from public.linked_accounts where platform = 'steam' and external_user_id = '76561198167569103'
on conflict do nothing;

-- ───────────────────────── Progreso de la sincronización ─────────────────────────
-- La sincronización avanza en el servidor, tanda a tanda, aunque se cierre la web: el progreso queda aquí.
alter table public.sync_runs
  add column games integer,
  add column added integer not null default 0,
  add column total integer,
  add column checked integer not null default 0,
  add column unlocked integer not null default 0,
  -- Cada tanda sube `step`: así dos llamadas a la vez nunca procesan la misma tanda.
  add column step integer not null default 0,
  add column updated_at timestamptz not null default now(),
  add column forced_by uuid references public.profiles (id) on delete set null;

create function private.live_sync_run() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.live('user:' || coalesce(new.user_id, old.user_id));
  return null;
end;
$$;
revoke execute on function private.live_sync_run() from public, anon, authenticated;
create trigger live after insert or update on public.sync_runs
  for each row execute function private.live_sync_run();

-- ───────────────────────── Datos del panel ─────────────────────────
-- Un resumen por usuario. Solo lo lee el servidor (service_role): ni visitantes ni usuarios.
create view public.admin_user_stats with (security_invoker = true) as
select
  p.id,
  p.username,
  p.avatar_url,
  p.created_at,
  la.external_user_id as steam_id,
  la.display_name as steam_name,
  la.profile_visibility,
  la.last_synced_at,
  (select count(*) from public.user_games ug where ug.user_id = p.id)::integer as games,
  (select count(*) from public.user_achievements ua where ua.user_id = p.id)::integer as achievements,
  exists (select 1 from public.app_admins a where a.user_id = p.id) as is_admin
from public.profiles p
left join public.linked_accounts la on la.user_id = p.id and la.platform = 'steam';

revoke all on public.admin_user_stats from public, anon, authenticated;
grant select on public.admin_user_stats to service_role;
