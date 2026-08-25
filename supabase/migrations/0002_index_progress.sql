-- Progresso de indexação na própria tabela `repos`.
--
-- A partir da Fase 2, `POST /index` responde 202 de imediato e a indexação
-- continua em background no rag-service. Isso obriga o estado a viver algures
-- fora do pedido HTTP que o começou: um dicionário em memória no processo
-- Python perdia-se a cada deploy, e o utilizador que voltasse 10 minutos depois
-- não conseguia saber se o repo estava pronto. Estas colunas são também o que a
-- listagem de repositórios da Fase 5 vai ler.

alter table repos
  -- 'done' como default é o que descreve as linhas que já cá estavam: foram
  -- indexadas pelo pipeline síncrono antigo, logo estão completas.
  add column index_stage text not null default 'done',
  add column files_found int,
  add column chunks_processed int,
  add column chunks_total int,
  -- Mesmo shape {error, message} do resto da API (docs/API-CONTRACT.md), para o
  -- frontend não ter de aprender um segundo formato só para falhas de indexação.
  add column index_error jsonb;

alter table repos
  add constraint repos_index_stage_check check (
    index_stage in (
      'listing_files', 'reading_files', 'embedding', 'saving', 'done', 'failed'
    )
  );

comment on column repos.index_stage is
  'Etapa atual da indexação em background. Ver GET /index/{repo_id}/status em docs/API-CONTRACT.md.';
comment on column repos.index_error is
  'Preenchido apenas quando index_stage = ''failed''. Shape {"error": "...", "message": "..."}.';
