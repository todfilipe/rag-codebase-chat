# Roadmap — Migração Poliglota + Continuação do Projeto

> Substitui o roadmap original de 4 semanas (Semanas 6–9, tudo em Next.js) documentado em `rag-roadmap-detalhado.docx`. Este documento assume a decisão de arquitetura de 25-07-2026: separar o pipeline RAG para um serviço Python (`apps/rag-service`) e manter o Next.js como camada de produto (`apps/web`). Ver `LOGICA-DO-PROJETO.md` para o raciocínio completo por trás de cada decisão.

## Ponto de partida

Já existe um protótipo funcional 100% TypeScript em `rag-codebase-chat` (construído em maio de 2026, antes da decisão poliglota) com o pipeline RAG completo a funcionar via endpoints de diagnóstico: GitHub client, chunking, embeddings, indexação, retrieval e geração. Este roadmap não começa do zero — a Fase 1 é sobre **portar lógica já validada** para Python, não sobre reinventá-la. O código TypeScript de `lib/*.ts` é a referência de comportamento a replicar.

Cada fase tem: objetivo, o que precisa de estar entendido antes de avançar (coerente com a filosofia "aprendizagem primeiro" do `CLAUDE.md`), etapas concretas, critério de "está pronto", e uma sugestão de que tier de modelo/agente costuma servir melhor esse tipo de trabalho (ver `CLAUDE.md` para a política completa).

---

## Fase 0 — Esqueleto do monorepo

**Objetivo:** ter a estrutura de pastas do monorepo pronta e o protótipo atual a viver dentro dela sem quebrar nada.

**Conceitos a confirmar antes de avançar:** diferença entre monorepo e multi-repo; porque é que `apps/rag-service` nunca deve ficar exposto publicamente; o que muda ao nível de deploy (Vercel vs Railway).

**Etapas:**
- [x] Criar a estrutura `apps/web`, `apps/rag-service`, `supabase/migrations`, `docs/` na raiz do monorepo.
- [x] Mover o conteúdo atual do protótipo (`app/`, `lib/`, `package.json`, etc.) para dentro de `apps/web`, sem alterar lógica — só localização.
- [x] Extrair os scripts SQL (tabelas `repos`, `code_chunks`, função `match_chunks`) do que está descrito em `decisions.md` para ficheiros reais em `supabase/migrations/` — feito em `supabase/migrations/0001_initial_schema.sql` (01-08-2026), inclui já a coluna `user_id` nullable para a Fase 4 e índice HNSW. Corrida contra o projeto Supabase real e confirmada em 25-08-2026 (tabelas e `match_chunks` a responder).
- [x] Criar o esqueleto do `apps/rag-service`: `pyproject.toml` (ou `requirements.txt`), estrutura de pastas (`app/`, `app/routers/`, `app/core/`), FastAPI "hello world" com um endpoint de health check.
- [x] Confirmar que `apps/web` continua a arrancar (`npm run dev`) e a servir os endpoints de diagnóstico depois da mudança de pasta.
- [x] Configurar `.gitignore` do monorepo para cobrir `node_modules`, `.next`, `__pycache__`, `.venv`, `.env*`.

**Está pronto quando:** o repositório tem a estrutura final de pastas, o `apps/web` corre sem alterações de comportamento, e o `apps/rag-service` responde `GET /health` com `200 OK`.

**Modelo sugerido:** sonnet 5 — é trabalho mecânico de mover ficheiros e criar esqueleto, baixo risco.

---

## Fase 1 — Portar o pipeline RAG para Python

**Objetivo:** replicar em `apps/rag-service` (FastAPI) tudo o que hoje vive em `apps/web/lib/*.ts`, mantendo o comportamento e as decisões já tomadas (chunking 2000/200, top-k=5 sem threshold, concorrência 5, clean-slate, embeddings Gemini 768-dim).

**Conceitos a confirmar antes de avançar:** diferenças de ecossistema Python vs TS para HTTP async (`httpx` vs `fetch`), gestão de concorrência em Python (`asyncio.gather` + `Semaphore` vs o pool manual em `indexer.ts`), tipagem estática em Python (`pydantic` como equivalente ao TypeScript estrito).

**Etapas (uma por módulo, mesma ordem em que foram construídos originalmente em TS):**
- [x] `github_client.py` — porta de `lib/github.ts`: parsing de URL, descoberta de branch principal, listagem da árvore, leitura de ficheiros, filtragem por extensão/tamanho/diretório ignorado.
- [x] `chunker.py` — porta de `lib/chunker.ts`: fixed-size 2000 chars, overlap 200.
- [x] `embeddings.py` — porta de `lib/gemini.ts`: chamada ao Gemini `gemini-embedding-2`, verificação de dimensão (768).
- [x] `indexer.py` — porta de `lib/indexer.ts`: upsert do repo, clean-slate dos chunks antigos, pool de concorrência 5, gravação no Supabase via `supabase-py` ou `postgrest` direto.
- [x] `retriever.py` — porta de `lib/retriever.ts`: chamada à função SQL `match_chunks` filtrando por `repo_id`, top-k=5.
- [x] `generator.py` — porta de `lib/generator.ts`: mesma system instruction (5 regras: grounding, anti-alucinação, citação, idioma, concisão), mesmo formato de prompt (`## Ficheiro: [path]` + `---`).
- [x] Endpoints FastAPI equivalentes aos de diagnóstico atuais (`/index`, `/retrieve`, `/generate`) para poder testar cada peça isoladamente, tal como no protótipo TS.
- [x] Endpoint de **streaming SSE** para geração — isto é novo, não existia no protótipo TS (que devolvia a resposta completa de uma vez). Ver `LOGICA-DO-PROJETO.md` para o contrato de streaming.
- [x] Testes manuais lado-a-lado: correr a mesma pergunta no protótipo TS antigo e no novo serviço Python, comparar chunks recuperados e resposta gerada.

**Está pronto quando:** o `apps/rag-service` indexa um repositório real, responde a uma pergunta com streaming SSE, e os resultados são equivalentes aos do protótipo TS para os mesmos inputs.

**Modelo sugerido:** opus 5 para o desenho de cada porte (decisões de como traduzir idiomaticamente cada peça, não só copiar sintaxe) e para o streaming SSE (é lógica nova, não uma porta 1:1). Sonnet 5 pode tratar da tradução mecânica depois do desenho estar validado. Se surgir uma decisão sensível sobre isolamento de dados entre repos/utilizadores durante esta fase, escalar para fable 5.

---

## Fase 2 — Contrato entre `rag-service` e `web`

**Objetivo:** o `apps/web` deixa de falar diretamente com Supabase/Gemini para RAG e passa a chamar o `apps/rag-service` via HTTP, fazendo proxy do streaming para o browser.

**Conceitos a confirmar antes de avançar:** o que é um token interno partilhado e porque não é "autenticação" no sentido tradicional; como funciona proxy de SSE em Next.js (Route Handlers com `ReadableStream`); modelo de ameaça — o que acontece se `RAG_SERVICE_INTERNAL_TOKEN` vazar.

**Etapas:**
- [x] Definir e documentar o contrato de API endpoint-a-endpoint (`POST /index`, `GET /index/{repo_id}/status`, `POST /query` com streaming) — feito em `docs/API-CONTRACT.md` (01-08-2026), com request/response shape e códigos de erro. Revisto em 25-08-2026 contra o código real: acrescentados os erros de `POST /query` (`repo_not_indexed`, `retrieval_failed`) e o `POST /index` passou a `202` + indexação em background.
- [x] Passar a indexação para background no `rag-service` (`202` imediato + `GET /index/{repo_id}/status`), com o progresso gravado nas colunas `index_*` de `repos`. Não estava previsto nesta fase: veio de perceber que, com indexação síncrona, fechar o separador podia deitar fora minutos de embeddings já pagos.
- [x] Gerar `RAG_SERVICE_INTERNAL_TOKEN`, adicionar a ambos os `.env` (web e rag-service), validar no `rag-service` que todo pedido tem o token correto — dependência em `app/core/auth.py`, aplicada a `/index`, `/query` e `/diagnostics/*`; só `/health` fica aberto.
- [x] Implementar no `apps/web` os Route Handlers que fazem proxy: `POST /api/index`, `GET /api/index/{repoId}/status` e `POST /api/query` (SSE devolvido com `new Response(upstream.body)`, sem ler o corpo). Lógica partilhada em `lib/rag-service.ts`.
- [x] Testar falha propositada (rag-service em baixo, token errado, timeout) e confirmar que o `web` devolve um erro claro em vez de um crash silencioso — verificado em 25-08-2026: `502 rag_service_unavailable`, `401 invalid_internal_token` (propagado do rag-service), `504 upstream_timeout` aos 30s. A indexação do `expressjs/express` apanhou também uma falha real (429 de quota do Gemini) e confirmou que ela fica gravada em `repos.index_error` com o número de chunks onde parou.

**Está pronto quando:** uma pergunta feita no browser passa por `web → rag-service → Gemini`, com a resposta a chegar em streaming, e nenhuma chamada direta a Supabase/Gemini para RAG resta em `apps/web`.

- [x] Apagar o pipeline TS de `apps/web` (`lib/{chunker,gemini,generator,github,indexer,retriever}.ts` e as rotas `app/api/test-*`) — feito em 25-08-2026. O `apps/web` fica sem uma única chamada direta ao Supabase ou ao Gemini: só `lib/rag-service.ts` e os três Route Handlers de proxy. O código antigo fica no histórico do git, que é onde deve estar.

**Modelo sugerido:** opus 5 — é lógica de fronteira entre sistemas, com implicações de segurança (token interno) que vale a pena pensar com cuidado.

---

## Fase 3 — Interface de chat real

**Objetivo:** substituir os endpoints de diagnóstico por uma interface de chat utilizável. Ver `docs/interface-prompts/INTERFACE.md` para o desenho detalhado.

**Etapas:**
- [x] Ecrã de "conectar repositório": input de URL do GitHub, validação, feedback de progresso da indexação — feito em 25-08-2026. Landing em `apps/web/app/page.tsx` e ecrã de progresso em `/repo/[repoId]`, com polling de 2s ao `GET /index/{repo_id}/status`. O `repo_id` vive no URL para a indexação sobreviver a um refresh. Verificado ponta a ponta com `sindresorhus/slugify` (8 ficheiros): 202 → redirect → stepper → `Ready`, mais os caminhos de URL inválido (parado no cliente) e `repo_not_found`.
- [x] Ecrã de chat: histórico de mensagens, input, streaming de tokens em tempo real, citações de ficheiros por mensagem — feito em 25-08-2026 em `/repo/[repoId]/chat` (rota própria: o ecrã de indexação faz `router.replace` para lá quando o stage chega a `done`, e o chat devolve para trás quem chegue com a indexação a meio). O stream é consumido com `fetch` + `getReader()` e um parser de SSE escrito à mão em `lib/sse.ts`, porque o `EventSource` do browser só faz GET e a pergunta vai no body. Verificado com `sindresorhus/slugify`: o evento `sources` enche o painel antes do primeiro token, a resposta aparece aos pedaços, e os ficheiros citados ficam por mensagem no fim.
- [x] Estados: vazio (sem repo conectado), a indexar, pronto, erro de indexação, sem resultados relevantes.
- [x] Painel ou secção de fontes citadas, com link/preview do excerto do ficheiro.

**Está pronto quando:** um utilizador consegue colar um URL do GitHub, ver o progresso da indexação, e conversar com o repositório sem tocar em nenhum endpoint de diagnóstico.

**Modelo sugerido:** sonnet 5 para componentes de UI mecânicos (bolhas de mensagem, inputs, listas). Opus 5 para o desenho dos estados e da gestão do streaming no frontend (é fácil de fazer mal — ex: re-renders excessivos, perda de tokens a meio do stream).

---

## Fase 4 — Autenticação e GitHub OAuth

**Objetivo:** cada utilizador tem conta própria; deixa de haver um único PAT partilhado para todos os repositórios.

**Conceitos a confirmar antes de avançar:** diferença entre o modelo atual (PAT interno único, decisão registada em `decisions.md`) e login por utilizador; porque é que aqui o GitHub OAuth é só identidade e não acesso a repositórios; as duas fronteiras de autenticação (browser→web pela sessão, web→rag-service pelo token interno) e porque uma não substitui a outra; como isto se liga ao RLS do Supabase.

**Etapas:**
- [x] Integrar Supabase Auth no `apps/web` (`@supabase/ssr`, sessão em cookies, middleware a proteger tudo menos a landing).
- [x] Configurar os métodos de login: email/password e GitHub OAuth app com scope mínimo, sem `repo` (o login é portão de acesso, não dá acesso aos repositórios do utilizador).
- [x] Associar `repos` e `code_chunks` a um `user_id`, migrar o schema.
- [x] Atualizar `match_chunks` e as policies RLS para filtrar também por utilizador, não só por `repo_id`.
- [x] Decidir e documentar o que acontece a repositórios já indexados sob o modelo antigo (PAT partilhado).

**Está pronto quando:** um utilizador só vê e consulta os repositórios que ele próprio conectou, com login via GitHub.

**Modelo sugerido:** fable 5 para o desenho das policies de RLS e do modelo de isolamento por utilizador — é exatamente o tipo de decisão de segurança onde um erro é caro e difícil de detetar depois. Opus 5 para a integração do Supabase Auth em si (o middleware e o refresh de sessão em cookies é fácil de fazer mal). Sonnet 5 para UI de login/perfil.

---

## Fase 5 — Dashboard e billing

**Objetivo:** utilizador consegue ver os repositórios que já indexou, geri-los, e (se for esse o plano de produto) pagar por uso acima de um limite gratuito.

**Etapas:**
- [x] Dashboard: lista de repositórios indexados, data da última indexação, botão de reindexar/remover.
- [x] Definir métrica de billing (nº de repositórios? nº de perguntas? tokens consumidos?) — esta é uma decisão de produto que falta tomar, registar em `decisions.md` quando for tomada.
- [x] Reindexação incremental (hash de conteúdo por ficheiro) a substituir o clean slate no indexer.py.
- [x] Integrar Stripe: planos, checkout, portal do cliente.
- [x] Webhooks do Stripe para atualizar o estado da subscrição.
- [x] Aplicar limites (ex: bloquear indexação de novos repos se o plano gratuito esgotou).

**Está pronto quando:** existe pelo menos um plano pago funcional de ponta a ponta (checkout → acesso desbloqueado → webhook de cancelamento a revogar acesso).

**Modelo sugerido:** fable 5 para a lógica de webhooks do Stripe e reconciliação de estado de subscrição (dinheiro real, bugs aqui custam caro e são subtis). Sonnet 5 para o dashboard de listagem.

---

## Fase 6 — Qualidade, deploy e lançamento

**Objetivo:** o projeto está deployado, testado, e o Filipe consegue defendê-lo numa entrevista técnica.

**Conceitos a confirmar antes de avançar:** porque é que o plano original (Vercel + Railway) foi trocado por uma VPS única (decisão de 30-08-2026, ver `decisions.md`): a indexação em background do `rag-service` obriga a um processo sempre a correr, logo a VPS é precisa de qualquer forma, e co-localizar os dois serviços permite que o `rag-service` escute só em `127.0.0.1` em vez de ficar exposto à internet com o token interno como única defesa. O que se perde em troca: preview deploys, rollback num clique, CDN e escala automática.

**Etapas:**
- [x] Preparar o `apps/web` para correr fora do Vercel: `output: "standalone"` no `next.config`, build de produção validada localmente.
- [x] `Dockerfile` para cada serviço e um `docker-compose.yml` que levante os dois na VPS, ambos a apontar para o mesmo Supabase de produção.
- [x] Publicar só o `web` através do nginx (reverse proxy + TLS com certbot). O `rag-service` fica na rede interna do compose, sem porta publicada, e o `RAG_SERVICE_URL` passa a ser um endereço interno.
- [x] Confirmar que o nginx não faz buffering do SSE de `POST /api/query` (`proxy_buffering off`), senão a resposta chega toda de uma vez em vez de token a token.
- [ ] Definir e documentar o processo de deploy (build na VPS a partir do git, ou imagens construídas em CI e puxadas por SSH) e o arranque automático depois de um reboot.
- [x] Testes automatizados mínimos: pelo menos os módulos críticos do `rag-service` (chunking, isolamento por `repo_id`/`user_id`) e os Route Handlers de proxy no `web`.
- [x] Revisão de segurança: `service_role_key` nunca chega ao cliente, RLS ativo e testado, token interno não exposto, `rag-service` sem resposta a partir do exterior da VPS (testar de fora, não assumir), rate limiting básico nos endpoints públicos.
- [ ] Rever `decisions.md` e `LOGICA-DO-PROJETO.md`, garantir que refletem o estado real do código (não o que foi planeado e mudou).
- [ ] Preparar respostas às "Perguntas de Entrevista" do `CLAUDE.md`, agora incluindo perguntas novas sobre a arquitetura poliglota: "porque separaste o RAG em Python?", "como comunicam os dois serviços?", "o que acontece se o rag-service cair?".
- [ ] Polish visual final, README atualizado com screenshots/GIF de demo.

**Está pronto quando:** a aplicação está publicamente acessível, funciona de ponta a ponta, e o Filipe consegue explicar qualquer parte do sistema sem hesitar.

**Modelo sugerido:** opus 5 como principal para a revisão de segurança e para as respostas de entrevista (exige síntese e precisão). Sonnet 5 para polish visual e atualização de documentação.

---

## Como este roadmap se relaciona com os outros documentos

- **`LOGICA-DO-PROJETO.md`** explica o *porquê* e o *como* de cada peça mencionada aqui — consulta-o sempre que uma etapa não estiver clara.
- **`decisions.md`** (na raiz do `apps/web` herdado do protótipo) regista decisões já tomadas; continua a ser o sítio certo para registar novas decisões técnicas à medida que as fases avançam.
- **`interface-prompts/INTERFACE.md`** detalha a Fase 3, incluindo as decisões de produto do MVP já fechadas.
- **`API-CONTRACT.md`** detalha a Fase 2 — shapes de request/response concretos, não é preciso inventar.
- **`ENV.md`** lista todas as variáveis de ambiente por fase em que são introduzidas.
- **`supabase/migrations/0001_initial_schema.sql`** já cobre a etapa de schema SQL da Fase 0.
- **`CLAUDE.md`** define como qualquer assistente (incluindo Claude) deve ajudar a executar este roadmap — que modelo usar, como escrever código, como ensinar em vez de só entregar, e como retomar uma sessão nova sem perder contexto.
