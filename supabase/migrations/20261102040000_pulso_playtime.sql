-- Horas jugadas desde Pulso (partidas que registra el launcher): dan el nivel de cada jugador.
-- security_invoker: cada uno ve lo que la política "ver actividad" le deja ver.
create view public.pulso_playtime with (security_invoker = on) as
select user_id, coalesce(sum((payload ->> 'minutes')::numeric), 0)::int as minutes
  from public.activity_events
 where kind = 'played'
 group by user_id;
