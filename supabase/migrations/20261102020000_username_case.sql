-- El username admite mayúsculas (Ren0X1). Sigue siendo único sin distinguirlas: el índice
-- profiles_username_key es sobre lower(username), así que 'Ren0X1' y 'ren0x1' no pueden convivir.
alter table public.profiles drop constraint profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (username ~ '^[A-Za-z0-9_]{3,20}$');
