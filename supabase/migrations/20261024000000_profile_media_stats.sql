-- Perfil completo (avatar y banner propios, enlaces externos, favoritos) y estadísticas.

-- ───────── Enlaces, avatar, banner y favoritos: validados en la base de datos ─────────

create function private.valid_links(links jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(links) = 'array'
     and jsonb_array_length(links) <= 6
     and not exists (
       select 1 from jsonb_array_elements(links) e
        where jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'url', '') !~ '^https://[^[:space:]]{3,200}$'
           or char_length(coalesce(e ->> 'kind', '')) not between 1 and 20
     )
$$;

alter table public.profiles
  add constraint profiles_links_valid check (private.valid_links(links)),
  add constraint profiles_avatar_https check (avatar_url is null or avatar_url ~ '^https://'),
  add constraint profiles_banner_https check (banner_url is null or banner_url ~ '^https://'),
  add constraint profiles_favorites_max check (cardinality(favorite_game_ids) <= 6);

-- ───────── Imágenes del perfil: bucket público, cada uno escribe solo en su carpeta ─────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "imágenes de perfil visibles" on storage.objects for select
  using (bucket_id = 'profile-media');
create policy "subir a mi carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cambiar mis imágenes" on storage.objects for update to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "borrar mis imágenes" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────── Estadísticas: logros conseguidos por mes (respeta la privacidad de logros) ─────────

create view public.achievements_by_month with (security_invoker = on) as
select user_id,
       date_trunc('month', unlocked_at) as month,
       count(*)::int as unlocked
  from public.user_achievements
 where unlocked_at is not null
 group by user_id, date_trunc('month', unlocked_at);
