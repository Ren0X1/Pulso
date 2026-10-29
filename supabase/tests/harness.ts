import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

// Lo mínimo de Supabase para que las migraciones y las políticas se comporten como en producción.
const SUPABASE_BOOTSTRAP = `
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  -- Lo que usan las políticas de Storage: buckets, objetos (con RLS) y storage.foldername().
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text not null, owner uuid default auth.uid()
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

  -- Realtime: realtime.send() deja el mensaje en realtime.messages y realtime.topic() es el canal al que
  -- se intenta suscribir el usuario (Supabase lo fija igual, con una variable de la sesión).
  create schema realtime;
  create table realtime.messages (
    id bigserial primary key, topic text not null, extension text not null default 'broadcast',
    event text, payload jsonb, private boolean
  );
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as
    $$ select nullif(current_setting('realtime.topic', true), '') $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
    language sql as $$ insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private) $$;
  grant usage on schema realtime to anon, authenticated, service_role;
  grant select on realtime.messages to authenticated;
`

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'migrations')

export type Role = { user: string } | 'anon' | 'service_role'

export async function createTestDb() {
  const db = new PGlite()
  await db.exec(SUPABASE_BOOTSTRAP)
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  }

  /** Ejecuta una consulta como lo haría la API de Supabase con ese rol. */
  async function as<T = Record<string, unknown>>(role: Role, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      if (role === 'anon' || role === 'service_role') {
        await tx.exec(`set local role ${role}`)
      } else {
        await tx.exec('set local role authenticated')
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [role.user])
      }
      return (await tx.query<T>(sql, params)).rows
    })
  }

  /** Crea un usuario con su perfil, como hace la Edge Function de login. */
  async function createUser(id: string, username: string) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@steam.pulso.invalid`])
    await db.query('insert into public.profiles (id, username) values ($1, $2)', [id, username])
  }

  return { db, as, createUser }
}
