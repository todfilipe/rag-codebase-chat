# Lógica do Projeto — RAG Codebase Chat

> Este documento explica **como o sistema pensa**: o percurso completo de um pedido, o porquê de cada decisão estrutural, e o que já está implementado vs. o que ainda é intenção. Não substitui o `decisions.md` (registo cronológico de decisões técnicas pontuais), o `ROADMAP.md` (plano de execução por fases), o `API-CONTRACT.md` (shapes concretos de request/response) nem o `ENV.md` (variáveis de ambiente) — este documento é a fotografia da arquitetura como um todo, num único sítio, para não teres de reconstruir o modelo mental a ler quinze ficheiros.

## O problema que o sistema resolve

Ler um codebase desconhecido obriga a saltar entre ficheiros e adivinhar por onde começar. O sistema indexa um repositório uma vez e depois permite interrogá-lo em linguagem natural, com respostas fundamentadas no código real e citação das fontes — para reduzir alucinação e permitir verificar a resposta.

## Visão geral do fluxo (estado alvo, pós-migração)

```
[Browser]
   │  1. cola URL do GitHub
   ▼
[apps/web — Next.js]
   │  2. valida URL, chama rag-service (POST /index) com token interno
   ▼
[apps/rag-service — FastAPI]
   │  3. lê ficheiros via GitHub API (github_client)
   │  4. divide em chunks (chunker)
   │  5. gera embeddings (embeddings, Gemini)
   │  6. grava em Supabase (indexer): tabela repos + code_chunks
   ▼
[Supabase / Postgres + pgvector]

... utilizador faz uma pergunta ...

[Browser]
   │  7. envia pergunta + repoId
   ▼
[apps/web]
   │  8. faz proxy do pedido para o rag-service (com token interno)
   ▼
[apps/rag-service]
   │  9. converte a pergunta em embedding
   │ 10. vector search filtrado por repo_id (retriever → match_chunks)
   │ 11. monta prompt com os top-5 chunks + system instruction
   │ 12. chama Gemini em modo streaming (generator)
   ▼
[apps/web]
   │ 13. faz proxy do stream SSE de volta ao browser, sem bufferizar tudo
   ▼
[Browser] — mostra a resposta token a token, com citações de ficheiro
```

**Estado atual (antes da migração):** os passos 2–12 acontecem todos dentro do `apps/web` em TypeScript, sem separação de serviços e sem streaming (a resposta é devolvida de uma vez, não token a token). É esse o protótipo já validado que vai ser portado.

---

## Porque separar em dois serviços (Python + TypeScript)

O roadmap original tinha tudo em Next.js/TypeScript. A decisão de 25-07-2026 separa o pipeline RAG (Python/FastAPI) da camada de produto (Next.js/TypeScript), por duas razões:

1. **Ecossistema:** o ecossistema de ML/dados em Python é mais maduro e é o que se espera ver dominado numa entrevista para trabalho com IA/RAG — bibliotecas de embeddings, vetores, e a generalidade de exemplos e literatura de RAG estão em Python.
2. **Sinal de arquitetura:** uma arquitetura poliglota bem justificada (cada linguagem na camada onde é mais forte) é, por si, um ponto a favor numa entrevista técnica — desde que o candidato consiga explicar o contrato entre os serviços e os trade-offs, não só "porque sim".

O trade-off aceite: mais complexidade operacional (dois serviços para correr, deployar e manter em vez de um), e uma fronteira de rede nova entre `web` e `rag-service` que introduz uma nova classe de falhas (timeout, serviço em baixo, token errado) que não existia quando tudo corria no mesmo processo.

### Onde fica a fronteira

- **`apps/rag-service` (Python/FastAPI):** tudo o que é pipeline RAG — indexação, chunking, embeddings, retrieval, geração, streaming. Nunca é exposto publicamente; só o `apps/web` lhe fala, autenticado por um token interno partilhado (`RAG_SERVICE_INTERNAL_TOKEN`).
- **`apps/web` (Next.js/TypeScript):** autenticação de utilizador (Clerk), OAuth do GitHub, billing (Stripe), dashboard, e o proxy entre o browser e o `rag-service` (incluindo o proxy do streaming SSE).

A regra prática para decidir onde uma peça de lógica nova deve viver: **se manipula texto de código, embeddings, vetores ou chama o LLM para gerar/recuperar, vai para o `rag-service`. Se é sobre identidade, pagamento ou apresentação, vai para o `web`.**

---

## O pipeline RAG, peça a peça

### 1. Ingestão (GitHub client)

Lê o repositório via GitHub REST API, sem clonar. Descobre automaticamente o branch principal (`main` ou `master`), percorre a árvore completa, e filtra por: extensão de ficheiro (só código), tamanho (máx. 100 KB por ficheiro — ficheiros maiores são provavelmente gerados/dados, não código para ler) e diretórios ignorados (`node_modules`, `dist`, `.git`, etc.).

**Porquê API e não clone:** mais simples de fazer funcionar em ambientes serverless (Vercel/Railway) sem disco persistente, e dá controlo fino sobre que ficheiros pedir sem transferir o repositório inteiro.

### 2. Chunking

Fixed-size com overlap: 2000 caracteres por chunk, 200 de overlap. Medido em caracteres, não linhas nem tokens — linhas variam demasiado em tamanho para serem uma unidade fiável, e tokens exigiriam um tokenizer extra sem benefício claro nesta fase (usa-se um fator de conversão aproximado de 4 chars/token só como sanity check do limite da API, não como unidade real).

**Porquê fixed-size e não por fronteira semântica (funções/classes):** o trade-off complexidade/performance favorece fixed-size — é simples de implementar, eficaz para a maioria dos casos, e evita o custo de parsing por linguagem que a separação por fronteira de função exigiria (seria necessário um parser diferente por linguagem de programação suportada).

### 3. Embeddings

Modelo `gemini-embedding-2` do Google, vetores de 768 dimensões, com verificação explícita da dimensão devolvida (falha cedo e alto se a API alguma vez devolver algo inesperado, em vez de gravar dados corrompidos silenciosamente).

**Porquê Gemini e não OpenAI/outros:** é grátis (dentro de limites) e o autor já tinha familiaridade com a API. Trade-off aceite: limites de rate mais apertados por não ter chave paga.

**Porquê chamada direta via `fetch`/`httpx` e não o SDK oficial:** o objetivo do projeto é entender o protocolo a fundo, não só ter algo a funcionar — decisão deliberada, sem dependências extra.

### 4. Indexação

Orquestra os passos acima: para cada repositório, faz upsert na tabela `repos`, apaga todos os chunks antigos desse repo (**clean-slate**, sem diff incremental) e volta a indexar do zero, com um pool de concorrência de 5 chamadas paralelas (ao GitHub e ao Gemini) para não rebentar rate limits nem ser lento demais a correr tudo em sequência.

**Porquê clean-slate:** muito mais simples de implementar e garante que o estado da base de dados fica sempre consistente. O custo é reindexar tudo mesmo que só um ficheiro tenha mudado — aceitável nesta fase, fica em aberto para versão futura (diff incremental).

**O que acontece se falhar a meio:** simplesmente propaga o erro e deixa o estado parcial. Não há rollback automático nem retry — se falhar, o utilizador tenta de novo, e o próximo clean-slate limpa o que ficou incompleto. Isto é uma decisão consciente de simplicidade, não uma omissão.

### 5. Retrieval (vector search)

Uma função SQL no Postgres/Supabase, `match_chunks(query_embedding, match_repo_id, match_count)`, faz a procura por cosine similarity diretamente na base de dados (usando `pgvector`), filtrando sempre por `repo_id`. Top-k fixo em 5, **sem threshold de similaridade** — os scores observados para queries relevantes (0.65–0.7) e irrelevantes (0.4–0.5) não têm uma fronteira suficientemente estável para cortar com segurança, por isso os 5 melhores são sempre devolvidos e é o LLM, com a informação toda à frente, que decide o que é útil.

**Isolamento entre repositórios (e, após a Fase 4, entre utilizadores):** o mecanismo de isolamento é a cláusula `WHERE repo_id = match_repo_id` dentro da própria função SQL — não é uma tabela ou schema separado por repositório (isso seria uma gestão inviável a escala). Depois da Fase 4 (autenticação), este filtro estende-se a `user_id`, e o RLS do Supabase passa a ser a segunda camada de defesa (mesmo que o filtro aplicacional falhe, a policy do Postgres não deixa ler linhas de outro utilizador).

**Porquê cosine similarity e não distância euclidiana:** cosine mede o ângulo entre vetores (a direção do significado), ignorando magnitude — dois vetores podem ter tamanhos diferentes mas apontar para o mesmo "sentido" semântico. Para embeddings de texto, é a magnitude que tende a ser ruído, não o ângulo.

### 6. Geração

O LLM (`gemini-3.1-flash-lite-preview` — escolhido pelo trade-off custo/latência, adequado para RAG onde o contexto já vem "mastigado" pelo retrieval) recebe uma system instruction com 5 regras explícitas: grounding (responder só com base nos chunks fornecidos), anti-alucinação (admitir quando não há informação suficiente), citação (referenciar o `file_path` de origem), idioma, e concisão. O prompt do utilizador formata os chunks separados por `---`, cada um encabeçado por `## Ficheiro: [path]`, para o modelo distinguir claramente onde acaba um ficheiro e começa outro.

**Streaming (novo na migração):** o protótipo TS original devolve a resposta completa de uma vez. O `rag-service` em Python expõe geração via SSE, e o `apps/web` faz proxy desse stream para o browser sem bufferizar — o utilizador vê a resposta a aparecer progressivamente, como num chat de LLM normal.

---

## Modelo de dados (Supabase / Postgres)

- **`repos`** — `id` (UUID, PK), `owner`, `repo`, `url`, unicidade em `(owner, repo)`. Depois da Fase 4, ganha `user_id`.
- **`code_chunks`** — `repo_id` (FK para `repos.id`, `ON DELETE CASCADE`), `file_path`, `content`, `start_offset`, `end_offset`, `chunk_index`, `embedding` (`vector(768)`).
- **`match_chunks(query_embedding, match_repo_id, match_count)`** — função SQL, devolve os chunks mais similares de um repo, ordenados por cosine similarity.

**Porquê `ON DELETE CASCADE`:** apagar um repositório é uma operação, não milhares — apaga-se a linha em `repos` e o Postgres trata de limpar todos os chunks associados automaticamente.

**Porquê `start_offset`/`end_offset` em vez de números de linha:** offsets de caracteres são exatos e fáceis de manipular em strings; permitem no futuro mapear a resposta de volta ao documento original com precisão (ex: para highlight de código na UI — ver `interface-prompts/INTERFACE.md`).

**Segurança de escrita:** RLS está ativado em todas as tabelas desde o início (mesmo antes de existirem policies), como defesa em profundidade. As escritas (feitas durante a indexação) usam a `service_role_key` do Supabase a partir do servidor, que faz bypass ao RLS por design — é seguro porque só corre em ambiente de servidor controlado, nunca no cliente.

---

## Estado de implementação (atualizar sempre que o roadmap avançar)

| Peça | Estado em 2026-08-02 |
|---|---|
| GitHub client, chunker, embeddings, indexer, retriever, generator | ✅ Implementados e validados em TypeScript (protótipo) |
| Estrutura de monorepo (`apps/web`, `apps/rag-service`) | Criada e verificada em 02-08-2026 (`apps/web` responde 200; `apps/rag-service` responde `GET /health`) |
| Migrations SQL versionadas (`supabase/migrations`) | ✅ Escritas em `supabase/migrations/0001_initial_schema.sql` (01-08-2026) e corridas contra o Supabase real (25-08-2026) |
| Contrato de API `web` ↔ `rag-service` | ✅ Definido em `docs/API-CONTRACT.md` (01-08-2026), revisto contra o código real em 25-08-2026 (`POST /index` passou a `202` + background; erros de `POST /query` documentados) |
| Referência de variáveis de ambiente | ✅ `docs/ENV.md` (01-08-2026) |
| Porte do pipeline para Python/FastAPI | `github_client.py`, `chunker.py`, `embeddings.py` (18-08-2026) `indexer.py`, `retriever.py` e `generator.py` (25-08-2026) portados e testados; ✅ Concluído (25-08-2026) — pipeline completo em Python, `POST /index` e `POST /query` (SSE) a responder, e retrieval validado como idêntico ao do protótipo TS |
| Streaming SSE de geração | ✅ `POST /query` no rag-service (25-08-2026), com eventos `sources`/`token`/`done`/`error` |
| Contrato `web` ↔ `rag-service` + token interno | ✅ Implementado (25-08-2026): token validado em `app/core/auth.py`, proxy em `apps/web/lib/rag-service.ts` + `app/api/{index,query}` |
| Indexação em background + progresso | ✅ `POST /index` responde `202` e corre em background; progresso em `repos` (migration `0002`), lido por `GET /index/{repo_id}/status` |
| Interface de chat | ❌ Só existem endpoints de diagnóstico (`curl`) |
| Autenticação / GitHub OAuth (Clerk) | ❌ Não iniciada — hoje há um único PAT interno partilhado |
| RLS por utilizador | ❌ RLS ativo mas sem policies de isolamento por utilizador (só por `repo_id`) |
| Billing (Stripe) | ❌ Não iniciado |
| Testes automatizados | ❌ Nenhum runner configurado |

Este documento e a tabela acima devem ser atualizados a cada fase concluída do `ROADMAP.md` — se ficarem desatualizados, deixam de servir o propósito de "fotografia real do sistema" e passam a ser mais uma fonte de confusão do que de clareza.
