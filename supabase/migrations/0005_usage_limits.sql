create table usage_monthly (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  messages int not null default 0,
  chunks int not null default 0,
  primary key (user_id, month)
);

alter table usage_monthly enable row level security;

create policy usage_monthly_select_own
  on usage_monthly for select
  using (auth.uid() = user_id);

create function add_usage (
  usage_user_id uuid,
  extra_messages int default 0,
  extra_chunks int default 0
)
returns void
language sql
as $$
  insert into usage_monthly (user_id, month, messages, chunks)
  values (
    usage_user_id,
    date_trunc('month', now() at time zone 'utc')::date,
    extra_messages,
    extra_chunks
  )
  on conflict (user_id, month) do update
  set messages = usage_monthly.messages + excluded.messages,
      chunks = usage_monthly.chunks + excluded.chunks;
$$;
