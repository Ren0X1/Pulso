-- Listas compartidas entre usuarios: el dueño invita a amigos como lectores (ven la lista aunque sea
-- privada) o editores (además añaden y quitan juegos). Nombre, visibilidad, códigos y miembros: solo el dueño.

create type public.list_role as enum ('viewer', 'editor');

create table public.game_list_members (
  list_id uuid not null references public.game_lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.list_role not null default 'viewer',
  added_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index game_list_members_user_idx on public.game_list_members (user_id);
alter table public.game_list_members enable row level security;

-- security definer: las políticas de listas y de miembros se consultan entre sí; así no hay recursión.
create function private.list_owner(list uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select owner_id from public.game_lists where id = list
$$;

create function private.list_role(list uuid, uid uuid) returns public.list_role
language sql stable security definer set search_path = '' as $$
  select role from public.game_list_members where list_id = list and user_id = uid
$$;

create function private.can_edit_list(list uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.list_owner(list) = auth.uid() or private.list_role(list, auth.uid()) = 'editor'
$$;

create function private.reject_owner_as_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id = private.list_owner(new.list_id) then
    raise exception 'owner_is_member' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.reject_owner_as_member() from public, anon, authenticated;

create trigger game_list_members_not_owner before insert on public.game_list_members
  for each row execute function private.reject_owner_as_member();

create policy "ver miembros de mis listas" on public.game_list_members for select to authenticated using (
  user_id = (select auth.uid())
  or private.list_owner(list_id) = (select auth.uid())
  or private.list_role(list_id, (select auth.uid())) is not null
);
create policy "invitar amigos" on public.game_list_members for insert to authenticated with check (
  private.list_owner(list_id) = (select auth.uid()) and private.are_friends((select auth.uid()), user_id)
);
create policy "cambiar roles" on public.game_list_members for update to authenticated
  using (private.list_owner(list_id) = (select auth.uid()))
  with check (private.list_owner(list_id) = (select auth.uid()));
create policy "expulsar o salir" on public.game_list_members for delete to authenticated using (
  user_id = (select auth.uid()) or private.list_owner(list_id) = (select auth.uid())
);
revoke update on public.game_list_members from anon, authenticated;
grant update (role) on public.game_list_members to authenticated;

-- Los miembros ven la lista aunque sea privada.
drop policy "ver listas" on public.game_lists;
create policy "ver listas" on public.game_lists for select using (
  owner_id = (select auth.uid())
  or visibility = 'public'
  or (visibility = 'friends' and (select auth.uid()) is not null and private.are_friends(owner_id, (select auth.uid())))
  or private.list_role(id, (select auth.uid())) is not null
);

-- Los editores modifican los juegos de la lista.
drop policy "añadir juegos a mis listas" on public.game_list_items;
drop policy "ordenar juegos de mis listas" on public.game_list_items;
drop policy "quitar juegos de mis listas" on public.game_list_items;
create policy "añadir juegos a listas que edito" on public.game_list_items for insert to authenticated
  with check (private.can_edit_list(list_id));
create policy "ordenar juegos de listas que edito" on public.game_list_items for update to authenticated
  using (private.can_edit_list(list_id)) with check (private.can_edit_list(list_id));
create policy "quitar juegos de listas que edito" on public.game_list_items for delete to authenticated
  using (private.can_edit_list(list_id));
