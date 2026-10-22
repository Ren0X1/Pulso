-- Rendimiento de RLS y lista de amigos visible para terceros.
-- (select auth.uid()) se evalúa una vez por consulta en vez de una vez por fila (aviso del asesor de Supabase).

-- Índices en las claves foráneas.
create index if not exists activity_events_game_idx on public.activity_events (game_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
create index if not exists game_list_items_game_idx on public.game_list_items (game_id);
create index if not exists game_lists_owner_idx on public.game_lists (owner_id);
create index if not exists list_share_codes_created_by_idx on public.list_share_codes (created_by);
create index if not exists list_share_codes_list_idx on public.list_share_codes (list_id);
create index if not exists user_achievements_achievement_idx on public.user_achievements (achievement_id);
create index if not exists user_games_game_idx on public.user_games (game_id);

-- Perfil
drop policy "editar mi perfil" on public.profiles;
create policy "editar mi perfil" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy "mi privacidad" on public.privacy_settings;
drop policy "editar mi privacidad" on public.privacy_settings;
create policy "mi privacidad" on public.privacy_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "editar mi privacidad" on public.privacy_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "mis ajustes" on public.user_settings;
drop policy "editar mis ajustes" on public.user_settings;
create policy "mis ajustes" on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "editar mis ajustes" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "mis cuentas vinculadas" on public.linked_accounts;
drop policy "desvincular mis cuentas" on public.linked_accounts;
create policy "mis cuentas vinculadas" on public.linked_accounts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "desvincular mis cuentas" on public.linked_accounts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Biblioteca
drop policy "añadir a mi biblioteca" on public.user_games;
drop policy "editar mi biblioteca" on public.user_games;
drop policy "quitar de mi biblioteca" on public.user_games;
create policy "añadir a mi biblioteca" on public.user_games for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'manual' and playtime_minutes is null and last_played_at is null);
create policy "editar mi biblioteca" on public.user_games for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "quitar de mi biblioteca" on public.user_games for delete to authenticated
  using (user_id = (select auth.uid()));

-- Listas
drop policy "ver listas" on public.game_lists;
drop policy "crear mis listas" on public.game_lists;
drop policy "editar mis listas" on public.game_lists;
drop policy "borrar mis listas" on public.game_lists;
create policy "ver listas" on public.game_lists for select using (
  owner_id = (select auth.uid())
  or visibility = 'public'
  or (visibility = 'friends' and (select auth.uid()) is not null and private.are_friends(owner_id, (select auth.uid())))
);
create policy "crear mis listas" on public.game_lists for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "editar mis listas" on public.game_lists for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "borrar mis listas" on public.game_lists for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Juegos de una lista: una sola política de lectura (la de la lista ya decide quién la ve).
drop policy "ver juegos de listas visibles" on public.game_list_items;
drop policy "gestionar juegos de mis listas" on public.game_list_items;
create policy "ver juegos de listas visibles" on public.game_list_items for select
  using (exists (select 1 from public.game_lists l where l.id = list_id));
create policy "añadir juegos a mis listas" on public.game_list_items for insert to authenticated
  with check (exists (select 1 from public.game_lists l where l.id = list_id and l.owner_id = (select auth.uid())));
create policy "ordenar juegos de mis listas" on public.game_list_items for update to authenticated
  using (exists (select 1 from public.game_lists l where l.id = list_id and l.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.game_lists l where l.id = list_id and l.owner_id = (select auth.uid())));
create policy "quitar juegos de mis listas" on public.game_list_items for delete to authenticated
  using (exists (select 1 from public.game_lists l where l.id = list_id and l.owner_id = (select auth.uid())));

drop policy "mis códigos" on public.list_share_codes;
drop policy "revocar mis códigos" on public.list_share_codes;
create policy "mis códigos" on public.list_share_codes for select to authenticated
  using (created_by = (select auth.uid()));
create policy "revocar mis códigos" on public.list_share_codes for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));

-- Amistades: cada parte ve las suyas (también pendientes); un tercero ve las aceptadas
-- si la lista de amigos de alguna de las dos partes es visible para él.
drop policy "mis amistades" on public.friendships;
drop policy "pedir amistad" on public.friendships;
drop policy "responder solicitud" on public.friendships;
drop policy "cancelar o eliminar amistad" on public.friendships;
create policy "ver amistades" on public.friendships for select using (
  (select auth.uid()) in (requester_id, addressee_id)
  or (status = 'accepted' and (private.can_view(requester_id, 'friends') or private.can_view(addressee_id, 'friends')))
);
create policy "pedir amistad" on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending');
create policy "responder solicitud" on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid())) with check (addressee_id = (select auth.uid()));
create policy "cancelar o eliminar amistad" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Actividad, sincronizaciones, notificaciones
drop policy "registrar mi actividad" on public.activity_events;
create policy "registrar mi actividad" on public.activity_events for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy "mis sincronizaciones" on public.sync_runs;
create policy "mis sincronizaciones" on public.sync_runs for select to authenticated
  using (user_id = (select auth.uid()));

drop policy "mis notificaciones" on public.notifications;
drop policy "marcar mis notificaciones" on public.notifications;
create policy "mis notificaciones" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "marcar mis notificaciones" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
