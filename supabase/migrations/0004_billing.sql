create table plans (
  id text primary key,
  price_cents int not null,
  stripe_price_id text unique,
  max_repos int not null,
  max_chunks_per_repo int not null,
  max_messages_per_month int not null,
  max_chunks_per_month int not null
);

insert into plans (id, price_cents, max_repos, max_chunks_per_repo, max_messages_per_month, max_chunks_per_month)
values
  ('free', 0, 3, 1000, 100, 5000),
  ('pro', 900, 30, 10000, 1500, 70000),
  ('ultra', 2800, 70, 40000, 5000, 200000);

create table subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text unique,
  plan_id text not null default 'free' references plans (id),
  status text not null default 'active',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table plans enable row level security;
alter table subscriptions enable row level security;

create policy plans_select_all
  on plans for select
  using (true);

create policy subscriptions_select_own
  on subscriptions for select
  using (auth.uid() = user_id);
