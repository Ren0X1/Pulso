-- Las funciones auxiliares salen de public: la API de Supabase publica todo lo que hay en public como
-- /rest/v1/rpc/<función>, y are_friends dejaría a cualquiera averiguar quién es amigo de quién.
-- El esquema private no lo expone la API; las políticas siguen funcionando porque apuntan a la función,
-- no a su nombre.

create schema if not exists private;
grant usage on schema private to anon, authenticated;

alter function public.are_friends(uuid, uuid) set schema private;
alter function public.can_view(uuid, text) set schema private;
alter function public.handle_new_profile() set schema private;
alter function public.touch_updated_at() set schema private;

-- can_view llamaba a are_friends por su nombre antiguo.
create or replace function private.can_view(owner uuid, section text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
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
           when 'friends' then auth.uid() is not null and private.are_friends(owner, auth.uid())
           else false
         end;
end;
$$;

alter function private.are_friends(uuid, uuid) set search_path = '';
alter function private.handle_new_profile() set search_path = '';
alter function private.touch_updated_at() set search_path = '';

-- Los triggers no necesitan que nadie pueda llamarlos.
revoke execute on function private.handle_new_profile() from public, anon, authenticated;
revoke execute on function private.touch_updated_at() from public, anon, authenticated;
