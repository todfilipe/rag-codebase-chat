create table indexed_files (
  repo_id uuid not null references repos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null,
  sha text not null,
  primary key (repo_id, file_path)
);

alter table indexed_files enable row level security;
