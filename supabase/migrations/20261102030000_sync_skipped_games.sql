-- Juegos que Steam no dejó leer en esta sincronización (errores suyos): se saltan y se reintentan en la siguiente.
alter table public.sync_runs add column skipped_games integer not null default 0;
