# rag-service

Núcleo RAG do Codebase Chat. Indexa repositórios do GitHub e responde a perguntas
sobre o código deles. É um serviço interno: quem fala com ele é a camada Next.js,
não o browser.

## Pipeline

**Indexação** (`POST /index`)

```
URL do GitHub -> árvore do branch principal -> filtro de ficheiros
              -> chunks de 2000 chars com 200 de overlap
              -> embeddings Gemini (768 dims)
              -> code_chunks no Supabase
```

**Resposta** (`POST /chat`)

```
pergunta -> embedding -> match_chunks (pgvector, top-k por repo)
         -> prompt com os excertos -> Gemini -> resposta + ficheiros citados
```

## Endpoints

| Método | Rota      | Corpo                                | Devolve                                            |
| ------ | --------- | ------------------------------------ | -------------------------------------------------- |
| GET    | `/health` | —                                    | `{"status": "ok"}`                                  |
| POST   | `/index`  | `{"github_url"}`                     | `{"repo_id", "files_indexed", "chunks_created", "duration_ms"}` |
| POST   | `/chat`   | `{"question", "repo_id", "k"?}`      | `{"answer", "sources": [...], "duration_ms"}`       |

`/index` e `/chat` exigem o header `X-Internal-Token` igual a `RAG_SERVICE_TOKEN`.
Os erros saem sempre como `{"error": "..."}`: 400 para input inválido, 401 sem
token, 422 para corpo malformado, 502 quando a GitHub ou a Gemini falham.

## Correr em local

```bash
cp .env.example .env   # preencher as chaves
uv sync --all-groups
uv run uvicorn app.main:app --reload
```

Ou via Docker, a partir da raiz do repositório:

```bash
docker compose up rag-service
```

## Qualidade

```bash
uv run pytest          # testes (nenhum toca na rede)
uv run ruff check .    # lint
uv run ruff format .   # formatação
uv run mypy            # tipos, em modo strict
```

## Notas de implementação

- Um único `httpx.AsyncClient` é criado no `lifespan` e reutilizado por todos os
  pedidos, em vez de um cliente por chamada.
- A concorrência das chamadas externas é limitada por um `asyncio.Semaphore(5)`,
  para não estourar o RPM da chave gratuita da Gemini.
- O cliente `supabase-py` é síncrono; cada chamada vai para um worker thread via
  `asyncio.to_thread` (ver `app/core/db.py`), para não bloquear o event loop.
- O schema do Supabase (`repos`, `code_chunks`, função `match_chunks`) vive na
  base de dados e não é gerido por este serviço.
