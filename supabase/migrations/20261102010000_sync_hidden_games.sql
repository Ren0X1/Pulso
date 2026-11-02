-- Juegos cuyos logros sí se leyeron y los que Steam oculta (marcados como privados en la biblioteca o que ya
-- no son del usuario). Unos pocos ocultos se saltan; si Steam no deja ver ninguno, es la privacidad de la cuenta.
alter table public.sync_runs
  add column read_games integer not null default 0,
  add column hidden_games integer not null default 0;
