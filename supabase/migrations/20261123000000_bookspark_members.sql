create table public.bookspark_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer text unique not null
);
create table public.bookspark_stripe_events (
  event_id text primary key,
  event_type text not null,
  recorded_at timestamptz not null default now()
);
alter table public.bookspark_customers enable row level security;
alter table public.bookspark_stripe_events enable row level security;
revoke all on public.bookspark_customers, public.bookspark_stripe_events from anon, authenticated;
insert into storage.buckets (id, name, public)
values ('bookspark-courses', 'bookspark-courses', false)
on conflict (id) do update set public = false;
