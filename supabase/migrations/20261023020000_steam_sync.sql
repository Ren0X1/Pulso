-- Fase 3: sincronización con Steam.

-- Cuándo se revisaron por última vez los logros de cada juego (los escribe solo steam-sync).
alter table public.user_games add column achievements_synced_at timestamptz;

-- Progreso de logros por jugador y juego. security_invoker: se aplican las políticas de quien consulta,
-- así que la privacidad de logros de cada jugador se respeta también aquí.
create view public.achievement_progress with (security_invoker = on) as
select ua.user_id,
       a.game_id,
       count(*)::int as unlocked,
       (select count(*)::int from public.achievements t where t.game_id = a.game_id) as total,
       max(ua.unlocked_at) as last_unlocked_at
  from public.user_achievements ua
  join public.achievements a on a.id = ua.achievement_id
 group by ua.user_id, a.game_id;

create index if not exists achievements_game_idx on public.achievements (game_id);
create index if not exists user_achievements_user_unlocked_idx on public.user_achievements (user_id, unlocked_at desc);
