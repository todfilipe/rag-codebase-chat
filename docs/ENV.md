# Variáveis de Ambiente

> Referência única para todas as variáveis de ambiente do monorepo. Cada serviço tem o seu próprio `.env.local` (Next.js) / `.env` (FastAPI), e a raiz tem um terceiro `.env` que só o `docker compose` lê. Nenhum é commitado, todos cobertos pelo `.gitignore`; a única exceção é o `.env.example` da raiz, que é template e não tem valores.

## Raiz do monorepo (`docker compose`)

O `docker-compose.yml` interpola três variáveis (`${NEXT_PUBLIC_SUPABASE_URL}`, `${NEXT_PUBLIC_SUPABASE_ANON_KEY}`, `${NEXT_PUBLIC_SITE_URL}`) e passa-as como **build args** à imagem do `web`. Copiar `.env.example` para `.env` na raiz e preencher antes do primeiro `docker compose build`.

| Variável | Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | O mesmo valor do `.env.local` do `web`. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Idem. |
| `NEXT_PUBLIC_SITE_URL` | Em produção é o domínio real (o Stripe usa-o no `success_url`), não `localhost`. |

Porque é que estas três estão duplicadas entre o `.env` da raiz e o `.env.local` do `web`, e porque é que não podem vir do `env_file:`: o Next substitui `process.env.NEXT_PUBLIC_*` pelo valor literal **no momento do build**, incluindo em código de servidor. Um valor injetado só em runtime chega tarde de mais e o bundle fica com as variáveis vazias. E `env_file:` só alimenta o contentor em runtime, nunca o build, por isso os build args são a única via. O `.env.local` continua a ser preciso porque contém todas as outras variáveis, essas sim lidas em runtime.

Se as três faltarem, o build falha em `lib/supabase/env.ts`, que faz `throw` explícito. É o comportamento desejado: uma imagem construída sem elas arrancaria e só partia no browser do primeiro utilizador.

## `apps/web` (Next.js)

| Variável | Descrição | Introduzida em |
|---|---|---|
| ~~`GEMINI_API_KEY`~~ | **Já não é usada em `apps/web`** desde 25-08-2026 (o pipeline TS foi apagado). Vive só no `rag-service`. Apagar do `.env.local`: uma chave que ninguém lê continua a ser uma chave que pode vazar. | Protótipo |
| ~~`GITHUB_TOKEN`~~ | Idem — migrou para o `rag-service`. Apagar do `.env.local`. | Protótipo |
| `SUPABASE_URL` | URL do projeto Supabase, lado servidor. Nunca para RAG: isso é sempre via `rag-service`. | Protótipo |
| `NEXT_PUBLIC_SUPABASE_URL` | O mesmo URL, exposto ao cliente porque o SDK de auth corre também no browser. | Fase 4 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública do Supabase. É desenhada para ser exposta: sozinha não dá acesso a nada, quem manda são as policies de RLS. | Fase 4 |
| `SUPABASE_SERVICE_ROLE_KEY` | Acesso total, ignora RLS. Nunca expor no cliente. Uso pós-migração limitado a operações que não são RAG (ex: dashboard a listar repos do utilizador). | Protótipo |
| `RAG_SERVICE_URL` | URL interna do `rag-service`. Em desenvolvimento fora do compose, `http://localhost:8000`. Sob `docker compose`, é `http://rag-service:8000` e vem já definida no `environment:` do serviço `web`, não do `.env.local`. | Fase 2 |
| `RAG_SERVICE_INTERNAL_TOKEN` | Token partilhado enviado em `Authorization: Bearer` em todo pedido ao `rag-service`. Ver `docs/API-CONTRACT.md`. Gerar com algo como `openssl rand -hex 32`; rodar se alguma vez for exposto. | Fase 2 |
| ~~`CLERK_SECRET_KEY`~~ / ~~`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`~~ | **Nunca chegaram a existir.** A Fase 4 ficou com Supabase Auth, não Clerk (decisão de 25-08-2026 em `decisions.md`). | — |
| ~~`GITHUB_OAUTH_CLIENT_ID`~~ / ~~`GITHUB_OAUTH_CLIENT_SECRET`~~ | Também não vivem aqui. Com Supabase Auth, as credenciais da GitHub OAuth App são coladas no painel do Supabase (Authentication → Providers), não no `.env.local`. | — |
| `STRIPE_SECRET_KEY` | Chave secreta do Stripe (servidor). Em desenvolvimento é a do sandbox (`sk_test_...`); as chaves são por sandbox, trocar de sandbox obriga a trocar as duas. | Fase 5 |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Chave pública do Stripe (cliente/checkout), `pk_test_...` em desenvolvimento. | Fase 5 |
| `STRIPE_WEBHOOK_SECRET` | Verifica a assinatura dos webhooks do Stripe. | Fase 5 |
| `NEXT_PUBLIC_SITE_URL` | URL base da app (`http://localhost:3000` em desenvolvimento). O Stripe precisa de URLs absolutos para o `success_url` do checkout e o `return_url` do portal, e o servidor não sabe sozinho em que domínio está. | Fase 5 |

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
