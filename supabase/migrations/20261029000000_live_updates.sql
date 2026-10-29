-- Cambios en directo: cuando algo cambia, la base de datos avisa por Supabase Realtime (broadcast) y la
-- pantalla vuelve a pedir sus datos. El aviso no lleva datos ('{}'): lo que cada uno ve lo sigue decidiendo RLS.
-- Canales privados: user:<id> (lo tuyo: listas, amigos, notificaciones, actividad de amigos) y
-- list:<id> (los juegos, el nombre y los miembros de una lista).

-- El id de un canal 'list:<uuid>', o null si el nombre no tiene esa forma (así nunca falla el cast).
create function private.topic_id(topic text, prefix text) returns uuid
language sql immutable set search_path = '' as $$
  select case when topic ~ ('^' || prefix || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
              then substr(topic, length(prefix) + 1)::uuid end
$$;

-- Quién puede escuchar cada canal: el suyo propio, y el de una lista si la política "ver listas" le deja verla
-- (la subconsulta se evalúa con los permisos de quien se suscribe).
create policy "escuchar mis canales" on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast' and (
    (select realtime.topic()) = 'user:' || (select auth.uid())::text
    or exists (
      select 1 from public.game_lists l where l.id = private.topic_id((select realtime.topic()), 'list:')
    )
  )
);

create function private.live(topic text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', topic, true);
end;
$$;

create function private.live_list_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.live('list:' || coalesce(new.list_id, old.list_id));
  return null;
end;
$$;

create function private.live_list() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  list public.game_lists := coalesce(new, old);
  member uuid;
begin
  perform private.live('list:' || list.id);
  perform private.live('user:' || list.owner_id);
  for member in select user_id from public.game_list_members where list_id = list.id loop
    perform private.live('user:' || member);
  end loop;
  return null;
end;
$$;

create function private.live_list_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.live('list:' || coalesce(new.list_id, old.list_id));
  perform private.live('user:' || coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

create function private.live_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.live('user:' || coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

create function private.live_friendship() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.live('user:' || coalesce(new.requester_id, old.requester_id));
  perform private.live('user:' || coalesce(new.addressee_id, old.addressee_id));
  return null;
end;
$$;

-- La actividad nueva avisa a quien la genera y a sus amigos (si pueden verla lo decide RLS al recargar).
create function private.live_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  author uuid := coalesce(new.user_id, old.user_id);
  friend uuid;
begin
  perform private.live('user:' || author);
  for friend in
    select case when requester_id = author then addressee_id else requester_id end
      from public.friendships
     where status = 'accepted' and author in (requester_id, addressee_id)
  loop
    perform private.live('user:' || friend);
  end loop;
  return null;
end;
$$;

revoke execute on function private.live(text), private.live_list_item(), private.live_list(), private.live_list_member(),
  private.live_notification(), private.live_friendship(), private.live_activity() from public, anon, authenticated;

create trigger live after insert or update or delete on public.game_list_items
  for each row execute function private.live_list_item();
create trigger live after insert or update or delete on public.game_lists
  for each row execute function private.live_list();
create trigger live after insert or update or delete on public.game_list_members
  for each row execute function private.live_list_member();
create trigger live after insert or update or delete on public.notifications
  for each row execute function private.live_notification();
create trigger live after insert or update or delete on public.friendships
  for each row execute function private.live_friendship();
create trigger live after insert or update or delete on public.activity_events
  for each row execute function private.live_activity();
