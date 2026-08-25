# Variáveis de Ambiente

> Referência única para todas as variáveis de ambiente do monorepo, nos dois serviços. Cada serviço tem o seu próprio `.env.local` (Next.js) / `.env` (FastAPI) — nunca commitados, ambos cobertos pelo `.gitignore`.

## `apps/web` (Next.js)

| Variável | Descrição | Introduzida em |
|---|---|---|
| ~~`GEMINI_API_KEY`~~ | **Já não é usada em `apps/web`** desde 25-08-2026 (o pipeline TS foi apagado). Vive só no `rag-service`. Apagar do `.env.local`: uma chave que ninguém lê continua a ser uma chave que pode vazar. | Protótipo |
| ~~`GITHUB_TOKEN`~~ | Idem — migrou para o `rag-service`. Apagar do `.env.local`. | Protótipo |
| `SUPABASE_URL` | URL do projeto Supabase. Sem uso em `apps/web` neste momento (nenhum código lá fala com o Supabase); fica para o dashboard da Fase 5 e para o Clerk da Fase 4. Nunca para RAG — isso é sempre via `rag-service`. | Protótipo |
| `SUPABASE_SERVICE_ROLE_KEY` | Acesso total, ignora RLS. Nunca expor no cliente. Uso pós-migração limitado a operações que não são RAG (ex: dashboard a listar repos do utilizador). | Protótipo |
| `RAG_SERVICE_URL` | URL interna do `rag-service` (ex: `https://rag-service.internal.railway.app`). | Fase 2 |
| `RAG_SERVICE_INTERNAL_TOKEN` | Token partilhado enviado em `Authorization: Bearer` em todo pedido ao `rag-service`. Ver `docs/API-CONTRACT.md`. Gerar com algo como `openssl rand -hex 32`; rodar se alguma vez for exposto. | Fase 2 |
| `CLERK_SECRET_KEY` | Chave secreta do Clerk (servidor). | Fase 4 |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Chave pública do Clerk (cliente). | Fase 4 |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | Credenciais da GitHub OAuth App para login por utilizador (distinto do `GITHUB_TOKEN` interno). | Fase 4 |
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe (servidor). | Fase 5 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Chave pública do Stripe (cliente/checkout). | Fase 5 |
| `STRIPE_WEBHOOK_SECRET` | Verifica a assinatura dos webhooks do Stripe. | Fase 5 |

## `apps/rag-service` (FastAPI)

| Variável | Descrição | Introduzida em |
|---|---|---|
| `GEMINI_API_KEY` | Embeddings (`gemini-embedding-2`) e geração (`gemini-3.1-flash-lite-preview`). | Fase 1 |
| `GITHUB_TOKEN` | PAT interno para ler repositórios via GitHub API. | Fase 1 |
| `SUPABASE_URL` | Mesmo projeto Supabase que o `web`. | Fase 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Escrita de `repos`/`code_chunks` durante a indexação, bypass ao RLS por design (servidor). | Fase 1 |
| `RAG_SERVICE_INTERNAL_TOKEN` | O mesmo valor configurado no `web` — usado para validar o header `Authorization` recebido. | Fase 2 |

## Regras

- `SUPABASE_SERVICE_ROLE_KEY` nunca é exposta ao cliente, em nenhum dos dois serviços — só lida a partir de código server-side.
- `RAG_SERVICE_INTERNAL_TOKEN` tem de ser **idêntico** nos dois `.env` (é comparado por igualdade simples no `rag-service`, ver `docs/API-CONTRACT.md`). Se rodares um, roda os dois ao mesmo tempo.
- Se qualquer chave desta lista for exposta acidentalmente (commit, log, print de debug), rota-a de imediato no respetivo painel — não basta remover do código, a chave antiga já está comprometida.
- Ao introduzir uma variável nova durante a implementação de uma fase, adiciona-a a esta tabela no mesmo commit — este ficheiro só é útil se ficar sincronizado com o código real.
