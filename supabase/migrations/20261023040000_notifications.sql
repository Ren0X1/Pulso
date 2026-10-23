-- Notificaciones: las crea la propia base de datos cuando pasa algo que te afecta, así no dependen de
-- qué app (web o launcher) haya hecho el cambio. El usuario solo puede marcarlas como leídas.

create function private.notify(target uuid, kind text, payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, kind, payload) values (target, kind, payload)
$$;

create function private.on_friendship_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform private.notify(new.addressee_id, 'friend_request', jsonb_build_object(
      'from', new.requester_id,
      'username', (select username from public.profiles where id = new.requester_id)));
  elsif tg_op = 'UPDATE' and old.status is distinct from 'accepted' and new.status = 'accepted' then
    perform private.notify(new.requester_id, 'friend_accepted', jsonb_build_object(
      'from', new.addressee_id,
      'username', (select username from public.profiles where id = new.addressee_id)));
  end if;
  return new;
end;
$$;

create function private.on_list_member_added() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  list public.game_lists;
begin
  select * into list from public.game_lists where id = new.list_id;
  perform private.notify(new.user_id, 'list_invite', jsonb_build_object(
    'from', list.owner_id,
    'username', (select username from public.profiles where id = list.owner_id),
    'list_id', list.id,
    'list_name', list.name,
    'role', new.role));
  return new;
end;
$$;

revoke execute on function private.notify(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.on_friendship_change() from public, anon, authenticated;
revoke execute on function private.on_list_member_added() from public, anon, authenticated;

create trigger friendships_notify after insert or update of status on public.friendships
  for each row execute function private.on_friendship_change();
create trigger game_list_members_notify after insert on public.game_list_members
  for each row execute function private.on_list_member_added();

-- Solo se puede marcar como leída.
revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
