-- Run once in the Supabase SQL Editor.
-- Stores each generated publication when the website runs on Vercel (read-only file system).
-- RLS is on with no policies, so only the service role key (used server-side) can read or write it.

create table if not exists public.forme_sites (
  slug text primary key,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.forme_sites enable row level security;

notify pgrst, 'reload schema';
