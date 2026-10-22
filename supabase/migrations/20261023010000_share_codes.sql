-- Listas compartibles por código.
-- Estas dos funciones están en public a propósito: la app las llama por /rpc. Son security definer
-- porque canjear un código tiene que leer una lista que el que canjea no puede ver; por eso cada una
-- comprueba quién llama y solo las pueden ejecutar usuarios con sesión.

create function public.create_share_code(list uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  bytes bytea;
  new_code text;
begin
  if not exists (select 1 from public.game_lists l where l.id = list and l.owner_id = auth.uid()) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  loop
    -- 16 bytes aleatorios de un UUID v4; 256 es múltiplo de 32, así que cada letra es equiprobable.
    bytes := uuid_send(gen_random_uuid());
    new_code := '';
    for i in 0..9 loop
      new_code := new_code || substr(alphabet, get_byte(bytes, i) % 32 + 1, 1);
    end loop;
    begin
      insert into public.list_share_codes (code, list_id, created_by) values (new_code, list, auth.uid());
      return new_code;
    exception when unique_violation then
      -- Casi imposible (32^10 combinaciones), pero si pasa se genera otro.
    end;
  end loop;
end;
$$;

create function public.redeem_share_code(code text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  clean text := upper(regexp_replace(code, '[^A-Za-z2-7]', '', 'g'));
  source public.game_lists;
  copy_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select l.* into source
    from public.list_share_codes c
    join public.game_lists l on l.id = c.list_id
   where c.code = clean
     and not c.revoked
     and (c.expires_at is null or c.expires_at > now());
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;
  if source.owner_id = auth.uid() then
    raise exception 'own_list' using errcode = 'P0001';
  end if;

  insert into public.game_lists (owner_id, name, description, visibility)
  values (auth.uid(), source.name, source.description, 'private')
  returning id into copy_id;

  insert into public.game_list_items (list_id, game_id, position)
  select copy_id, i.game_id, i.position from public.game_list_items i where i.list_id = source.id;

  return copy_id;
end;
$$;

revoke execute on function public.create_share_code(uuid) from public, anon;
revoke execute on function public.redeem_share_code(text) from public, anon;
grant execute on function public.create_share_code(uuid) to authenticated;
grant execute on function public.redeem_share_code(text) to authenticated;
