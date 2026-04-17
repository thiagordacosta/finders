create extension if not exists pgcrypto;

create table if not exists public.finders (
  id text primary key,
  name text not null,
  sent_minute boolean not null default false,
  signed_at text not null default '',
  first_referral boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  finder_id text not null references public.finders(id) on delete cascade,
  company text not null,
  cnpj text not null,
  fob_value text not null,
  date text not null,
  created_at timestamptz not null default now()
);

alter table public.finders enable row level security;
alter table public.leads enable row level security;

drop policy if exists "Public full access to finders" on public.finders;
create policy "Public full access to finders"
on public.finders
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Public full access to leads" on public.leads;
create policy "Public full access to leads"
on public.leads
for all
to anon, authenticated
using (true)
with check (true);
