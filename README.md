# RAG Codebase Chat

Indexa um repositório do GitHub e responde a perguntas em linguagem natural sobre
o código dele, citando os ficheiros em que se baseou.

O RAG é construído de raiz — chunking, embeddings, pesquisa vectorial e prompt —
sem LangChain nem afins.

## Arquitectura

O projeto está partido em duas camadas com uma fronteira explícita:

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  Next.js  (TypeScript)       │        │  rag-service  (Python)       │
│                              │        │                              │
│  UI                          │  HTTP  │  GitHub API                  │
│  /api/index, /api/chat       │ ─────► │  chunking + embeddings       │
│  validação de input          │        │  pesquisa vectorial          │
│  (auth, quotas, billing)     │        │  geração da resposta         │
└──────────────────────────────┘        └──────────────┬───────────────┘
                                                       │
                                        ┌──────────────┴───────────────┐
                                        │  GitHub · Gemini · Supabase  │
                                        └──────────────────────────────┘
```

O Next.js é a camada de produto: nunca fala com a Gemini, com a GitHub nem com o
Supabase. Fala só com o serviço Python, através de `lib/rag-client.ts`.

O serviço Python é o núcleo de RAG e não sabe nada sobre utilizadores, sessões ou
planos. É interno — cada pedido tem de trazer o header `X-Internal-Token`.

O porquê desta separação está em [`decisions.md`](./decisions.md).

## Fluxo

**Indexar** — `POST /api/index` com `{"githubUrl": "..."}`

1. Lista a árvore do branch principal do repo.
2. Filtra: só código e texto, até 100 KB, fora de `node_modules`, `dist` e afins.
3. Parte cada ficheiro em chunks de 2000 chars com 200 de overlap.
4. Gera um embedding por chunk (Gemini, 768 dimensões).
5. Guarda tudo em `code_chunks`, substituindo o índice anterior do repo.

**Perguntar** — `POST /api/chat` com `{"question": "...", "repoId": "..."}`

1. Gera o embedding da pergunta.
2. Vai buscar os top-k chunks do repo por similaridade (`match_chunks`, pgvector).
3. Monta o prompt com esses excertos e pede a resposta à Gemini.
4. Devolve a resposta e a lista de ficheiros usados.

## Stack

| Camada    | Tecnologia                                           |
| --------- | ---------------------------------------------------- |
| Front-end | Next.js 16, React 19, Tailwind 4                     |
| Serviço   | Python 3.11+, FastAPI, httpx, uv                     |
| Dados     | Supabase (Postgres + pgvector)                       |
| Modelos   | `gemini-embedding-2` (768d), `gemini-3.1-flash-lite` |

## Correr em local

São dois processos. Primeiro o serviço Python:

```bash
cd rag-service
cp .env.example .env      # preencher as chaves
uv sync --all-groups
uv run uvicorn app.main:app --reload    # http://localhost:8000
```

Depois o Next.js, noutro terminal e a partir da raiz:

```bash
cp .env.example .env.local    # RAG_SERVICE_URL + o mesmo RAG_SERVICE_TOKEN
npm install
npm run dev                   # http://localhost:3000
```

Alternativa para o serviço Python: `docker compose up rag-service`.

## Variáveis de ambiente

| Onde                | Variável                    | Para quê                            |
| ------------------- | --------------------------- | ----------------------------------- |
| `rag-service/.env`  | `GEMINI_API_KEY`            | embeddings e geração                |
| `rag-service/.env`  | `GITHUB_TOKEN`              | ler repositórios                    |
| `rag-service/.env`  | `SUPABASE_URL`              | base de dados                       |
| `rag-service/.env`  | `SUPABASE_SERVICE_ROLE_KEY` | base de dados                       |
| `rag-service/.env`  | `RAG_SERVICE_TOKEN`         | segredo partilhado entre as camadas |
| `.env.local` (raiz) | `RAG_SERVICE_URL`           | onde está o serviço Python          |
| `.env.local` (raiz) | `RAG_SERVICE_TOKEN`         | o mesmo segredo, do lado do Next    |

## Testes e qualidade

```bash
cd rag-service && uv run pytest && uv run ruff check . && uv run mypy
npm run lint && npm run build
```

## Estado

Feito: pipeline de indexação, pesquisa vectorial, geração de respostas, e os
endpoints que expõem as duas coisas.

Por fazer: a UI de chat (`app/page.tsx` ainda é o boilerplate do Next),
autenticação, e limites de utilização por utilizador.
