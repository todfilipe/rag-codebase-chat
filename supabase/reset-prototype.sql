-- RESET DESTRUTIVO. Correr UMA vez, à mão, no SQL editor do Supabase.
-- Isto NÃO é uma migration: não faz parte do histórico de schema.
--
-- Porquê existe: as tabelas `repos` e `code_chunks` foram criadas à mão
-- durante o protótipo (maio de 2026) e divergem de 0001_initial_schema.sql
-- (falta-lhes `user_id`, o índice HNSW e as policies de RLS). Como a 0001
-- usava `create table if not exists`, corrê-la por cima do schema antigo
-- passava sem erro e não corrigia nada: dava a ilusão de schema aplicado.
--
-- Decisão (18-08-2026): clean slate em vez de migration incremental de
-- ALTERs. Os chunks indexados são descartáveis, reindexáveis a partir do
-- GitHub em minutos, e não há utilizadores reais a proteger ainda.
--
-- A seguir a isto, correr supabase/migrations/0001_initial_schema.sql.

drop function if exists match_chunks;
drop table if exists code_chunks;
drop table if exists repos;
