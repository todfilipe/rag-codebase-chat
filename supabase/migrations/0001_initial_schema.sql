-- Schema inicial do RAG Codebase Chat.
-- Traduz para SQL real o que estava descrito em prosa em decisions.md
-- ("Schema: tabela repos separada e ON DELETE CASCADE", "Metadata dos chunks",
-- "Função SQL match_chunks com filtragem por repo_id").
--
-- Corre isto no SQL editor do Supabase, ou via `supabase db push` depois de
-- ligar o CLI ao projeto. NÃO é idempotente por design: correr duas vezes
-- falha em voz alta em vez de passar em silêncio sobre um schema divergente.
-- Se a base de dados já tiver o schema antigo do protótipo, corre primeiro
-- supabase/reset-prototype.sql.

-- Extensão pgvector: guarda e pesquisa embeddings.
create extension if not exists vector;

-- Um repositório indexado. `owner` + `repo` identificam-no de forma única
-- (ex: owner="facebook", repo="react"). `user_id` fica nulo até à Fase 4
-- (autenticação) — antes disso, todos os repositórios são "públicos" no
-- sentido em que qualquer utilizador da app os pode consultar.
create table repos (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  repo text not null,
  url text not null,
  user_id uuid references auth.users (id) on delete cascade, -- null até à Fase 4
  indexed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Um repo é único por (owner, repo) enquanto `user_id` for nulo. Não pode
  -- incluir `user_id` já: em Postgres os NULL contam como distintos num
  -- unique, por isso `unique (owner, repo, user_id)` não impediria duplicados
  -- nenhum antes da Fase 4, e partiria o `onConflict: "owner,repo"` que o
  -- indexer usa. A Fase 4 troca esta constraint quando `user_id` passar a
  -- estar sempre preenchido.
  unique (owner, repo)
);

comment on column repos.user_id is
  'Nulo antes da Fase 4 (auth). Depois da Fase 4, cada repo pertence a um utilizador — ver docs/ROADMAP.md Fase 4.';

-- Um pedaço (chunk) de um ficheiro de código, com o respetivo embedding.
-- ON DELETE CASCADE: apagar um repo limpa automaticamente todos os seus chunks
-- (decisão já registada em decisions.md — "fica super fácil apagar um repositório").
create table code_chunks (
  id uuid primary key default gen_random_uuid(),
  repo_id uuid not null references repos (id) on delete cascade,
  file_path text not null,
  content text not null,
  chunk_index int not null,
  start_offset int not null,
  end_offset int not null,
  embedding vector(768) not null, -- gemini-embedding-2, 768 dimensões
  created_at timestamptz not null default now()
);

-- Índice para a query mais comum: "todos os chunks deste repo".
create index code_chunks_repo_id_idx on code_chunks (repo_id);

-- Índice HNSW para vector search rápido por cosine similarity.
-- HNSW em vez de IVFFlat: melhor recall/latência para o volume esperado
-- (milhares a dezenas de milhares de chunks por repo, não milhões).
create index code_chunks_embedding_hnsw_idx
  on code_chunks using hnsw (embedding vector_cosine_ops);

-- Função de retrieval: top-k chunks mais similares, filtrados por repo_id.
-- Sem threshold de similaridade — decisão já registada em decisions.md
-- ("Top-k = 5 sem threshold"): os 5 melhores são sempre devolvidos, e o LLM
-- decide o que é relevante para responder.
create or replace function match_chunks (
  query_embedding vector(768),
  match_repo_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  file_path text,
  content text,
  start_offset int,
  end_offset int,
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
    1 - (code_chunks.embedding <=> query_embedding) as similarity
  from code_chunks
  where code_chunks.repo_id = match_repo_id
  order by code_chunks.embedding <=> query_embedding
  limit match_count;
$$;

-- RLS ativo desde o início, mesmo sem policies completas ainda — decisão já
-- registada em decisions.md ("Supabase RLS ativado desde início"). As escritas
-- de indexação usam a service_role_key a partir do servidor e fazem bypass
-- ao RLS por design; isto protege contra leitura direta não autorizada a
-- partir do cliente.
alter table repos enable row level security;
alter table code_chunks enable row level security;

-- Policy mínima pré-Fase 4: leitura pública (qualquer repo é visível a
-- qualquer utilizador autenticado da app, não há isolamento por utilizador
-- ainda). Isto MUDA na Fase 4 — ver docs/ROADMAP.md — quando repos.user_id
-- deixa de ser nulo e as policies passam a filtrar por auth.uid().
create policy "repos são legíveis por todos (pré-Fase 4)"
  on repos for select
  using (true);

create policy "code_chunks são legíveis por todos (pré-Fase 4)"
  on code_chunks for select
  using (true);

-- Nenhuma policy de insert/update/delete para o cliente: essas operações só
-- acontecem no servidor via service_role_key, que ignora RLS por design.
