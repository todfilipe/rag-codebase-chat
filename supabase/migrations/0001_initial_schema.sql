create extension if not exists vector;

create table repos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owner text not null,
  repo text not null,
  url text not null,
  index_stage text not null default 'done',
  files_found int,
  chunks_processed int,
  chunks_total int,
  index_error jsonb,
  indexed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner, repo, user_id),
  constraint repos_index_stage_check check (
    index_stage in (
      'listing_files', 'reading_files', 'embedding', 'saving', 'done', 'failed'
    )
  )
);

create table code_chunks (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null,
  content text not null,
  chunk_index int not null,
  start_offset int not null,
  end_offset int not null,
  start_line int,
  end_line int,
  embedding vector(768) not null,
  created_at timestamptz not null default now()
);

create index code_chunks_repo_id_idx on code_chunks (repo_id);
create index code_chunks_user_id_idx on code_chunks (user_id);

create index code_chunks_embedding_hnsw_idx
  on code_chunks using hnsw (embedding vector_cosine_ops);

create function match_chunks (
  query_embedding vector(768),
  match_repo_id uuid,
  match_user_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  file_path text,
  content text,
  start_offset int,
  end_offset int,
  start_line int,
  end_line int,
  similarity float
)
language sql stable
as $$
  select
    code_chunks.id,
    code_chunks.file_path,
    code_chunks.content,
    code_chunks.start_offset,
    code_chunks.end_offset,
    code_chunks.start_line,
    code_chunks.end_line,
    1 - (code_chunks.embedding <=> query_embedding) as similarity
  from code_chunks
  where code_chunks.repo_id = match_repo_id
    and code_chunks.user_id = match_user_id
  order by code_chunks.embedding <=> query_embedding
  limit match_count;
$$;

alter table repos enable row level security;
alter table code_chunks enable row level security;

create policy repos_select_own
  on repos for select
  using (auth.uid() = user_id);

create policy code_chunks_select_own
  on code_chunks for select
  using (auth.uid() = user_id);
