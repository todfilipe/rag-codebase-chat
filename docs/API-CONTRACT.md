# Contrato de API — `apps/web` ↔ `apps/rag-service`

> Fecha a etapa "definir e documentar o contrato de API" da Fase 2 do `ROADMAP.md`. O `rag-service` nunca é exposto publicamente — só o `apps/web` lhe fala, autenticado pelo header abaixo. Isto é o contrato concreto; se mudar durante a implementação, atualiza este ficheiro e regista o porquê em `decisions.md`.

## Autenticação entre serviços

Todo pedido do `apps/web` para o `apps/rag-service` inclui:

```
Authorization: Bearer <RAG_SERVICE_INTERNAL_TOKEN>
```

O `rag-service` rejeita com `401 Unauthorized` qualquer pedido sem este header ou com o token errado, antes de tocar em qualquer lógica de negócio. Ver `docs/ENV.md` para onde esta variável vive.

| Status | Quando | Body |
|---|---|---|
| `401` | Header `Authorization` em falta ou sem o prefixo `Bearer ` | `{"error": "missing_internal_token", "message": "..."}` |
| `401` | Header presente mas com token diferente do configurado | `{"error": "invalid_internal_token", "message": "..."}` |

`GET /health` é a única exceção (o health check do Railway não tem forma de conhecer o segredo). Os endpoints `/diagnostics/*` **exigem** o token: gastam quota do Gemini como qualquer outro.

---

## `POST /index`

Indexa (ou reindexa, só os ficheiros que mudaram) um repositório GitHub.

**Request**

```json
{
  "repo_url": "https://github.com/owner/repo",
  "user_id": "uuid",
  "force": false
}
```

Desde 29-08-2026 a indexação é **incremental**: o `rag-service` compara o blob SHA de cada ficheiro da árvore do GitHub com o que tem guardado em `indexed_files` e só lê e reembeda os que mudaram. Ficheiros que desapareceram do repositório têm os chunks apagados. `force: true` (opcional, `false` por omissão) salta essa comparação e reindexa tudo de raiz, e existe para o caso em que os parâmetros de chunking mudam e os SHAs deixam de ser suficientes para detetar que os chunks guardados estão obsoletos.

`user_id` é **obrigatório** desde a Fase 4 (etapa 3): o `apps/web` envia sempre o do utilizador autenticado (lido da sessão no Route Handler, nunca do body do browser), e o repo e os chunks ficam gravados com ele. A unicidade em `repos` é (owner, repo, user_id), por isso dois utilizadores a indexar o mesmo repositório têm linhas e chunks separados.

**Response — sucesso (`202 Accepted`)**

A indexação **não** corre dentro deste pedido. O `rag-service` faz só a parte barata (validar o URL, upsert do repo, listar e filtrar a árvore), responde de imediato, e arranca o trabalho pesado numa task de background. É isso que faz a indexação sobreviver ao utilizador fechar o separador.

```json
{
  "repo_id": "uuid",
  "owner": "owner",
  "repo": "repo",
  "files_found": 42,
  "stage": "reading_files"
}
```

O total de chunks só é conhecido depois de os ficheiros serem lidos, por isso não vem aqui — aparece em `GET /index/{repo_id}/status` quando a etapa `embedding` começar.

**Response — erro**

| Status | Quando | Body |
|---|---|---|
| `400` | URL não é do `github.com`, ou mal formado | `{"error": "invalid_repo_url", "message": "..."}` |
| `400` | `user_id` em falta ou não é um uuid | `{"error": "missing_user_id" \| "invalid_user_id", "message": "..."}` |
| `404` | Repositório não existe ou é privado (sem acesso com o PAT atual) | `{"error": "repo_not_found", "message": "..."}` |
| `422` | Repositório existe mas não tem ficheiros indexáveis | `{"error": "no_indexable_files", "message": "..."}` |
| `429` | Rate limit do GitHub ou do Gemini atingido a meio da indexação | `{"error": "rate_limited", "message": "...", "retry_after_seconds": 60}` |
| `500` | Falha inesperada a meio da indexação | `{"error": "indexing_failed", "message": "..."}` — consistente com a decisão já tomada em `decisions.md`: sem rollback automático, o estado fica parcial, e a tentativa seguinte refaz os ficheiros que ficaram sem registo em `indexed_files`. |

| `402` | O utilizador já usou todas as vagas de repositório do plano (só o `apps/web` devolve este) | `{"error": "repo_limit_reached", "message": "..."}` |

Todos os erros da tabela acima acontecem **antes** do `202` — são as falhas causadas pelo input do utilizador, e ele ainda está à espera da resposta para as receber. Depois do `202`, qualquer falha passa a ser reportada em `GET /index/{repo_id}/status` com `stage: "failed"`, porque já não há resposta HTTP aberta para onde a mandar. As duas quotas de chunks caem aqui por construção: só se sabe quantos chunks tem um repositório depois de o chunking correr, o que já é depois do `202`.

| `error` em `repos.index_error` | Quando |
|---|---|
| `repo_too_large` | O repositório passa o `max_chunks_per_repo` do plano. Verificado entre o chunking e o primeiro embedding, por isso a recusa não gasta nada. |
| `chunk_budget_exceeded` | Esta indexação passaria o `max_chunks_per_month` do plano (cláusula de utilização justa, decisão de 29-08-2026). |

## `GET /index/{repo_id}/status`

Progresso de uma indexação em curso — usado pela UI para os passos nomeados descritos em `INTERFACE.md`. O estado vive nas colunas `index_*` de `repos`, não em memória do processo: um deploy a meio de uma indexação não pode deixar o utilizador sem forma de saber em que pé está.

**Response (`200 OK`)**

```json
{
  "repo_id": "uuid",
  "owner": "facebook",
  "repo": "react",
  "stage": "listing_files | reading_files | embedding | saving | done | failed",
  "files_found": 42,
  "chunks_processed": 210,
  "chunks_total": 318,
  "error": null
}
```

`owner` e `repo` foram acrescentados em 25-08-2026, durante a Fase 3. O ecrã de indexação vive em `/repo/{repo_id}` (o `repo_id` no URL é o que faz a indexação sobreviver a um refresh), e quem chega a esse URL de raiz só tem o uuid — sem estes dois campos não conseguia mostrar o nome do repositório. Os dados já vinham da mesma linha de `repos`, por isso o custo é zero.

`files_found`, `chunks_processed` e `chunks_total` são `null` enquanto ainda não forem conhecidos. `chunks_processed` é atualizado de 25 em 25 embeddings, não a cada chunk.

Quando `stage` é `"failed"`, `error` contém o mesmo shape `{"error", "message"}` da tabela acima; caso contrário é `null`.

| Status | Quando | Body |
|---|---|---|
| `404` | Não existe repo com esse `repo_id` | `{"error": "repo_not_found", "message": "..."}` |

**Limitação conhecida:** se o processo do `rag-service` morrer a meio de uma indexação (deploy, crash), o trabalho não é retomado por ninguém e o `stage` fica congelado no último valor gravado. Não há fila de jobs com retry — está fora do âmbito deste projeto. A recuperação é o utilizador reindexar, e o incremental refaz só os ficheiros que ficaram sem registo.

---

## `POST /query`

Faz retrieval + geração para uma pergunta sobre um repositório já indexado. **Streaming via SSE.**

**Request**

```json
{
  "repo_id": "uuid",
  "question": "como funciona o login?",
  "user_id": "uuid"
}
```

`user_id` é **obrigatório** desde a Fase 4 (etapa 4): o `apps/web` envia sempre o da sessão (nunca o do body do browser), e o `match_chunks` filtra por ele além do `repo_id`. Perguntar sobre o `repo_id` de outro utilizador devolve `404 repo_not_indexed`, indistinguível de um repo que nunca foi indexado (de propósito: não confirma a existência de repos alheios).

**Response — sucesso**

`Content-Type: text/event-stream`. Sequência de eventos, por esta ordem:

1. Um evento `sources` — enviado assim que o retrieval termina, **antes** da geração começar (ver `LOGICA-DO-PROJETO.md`: o retriever corre primeiro, os chunks já são conhecidos desde o início do stream):

   ```
   event: sources
   data: {"sources": [{"file_path": "lib/auth.ts", "similarity": 0.71, "start_offset": 120, "end_offset": 2120, "start_line": 8, "end_line": 74, "content": "export async function signIn(..."}, ...]}
   ```

   `content` é o excerto tal como foi indexado — o mesmo texto que seguiu no prompt do Gemini. Vai no evento para o painel de fontes poder mostrar o código em que a resposta se apoiou sem uma segunda ida ao servidor (~10 KB por pergunta, uma única vez, antes do primeiro `token`).

   `start_line`/`end_line` são 1-based. As colunas são nullable e o cliente trata `null` linkando para o ficheiro inteiro em vez de saltar para o excerto, mas desde o reset de 27-08-2026 todos os chunks são indexados com linhas.

2. Vários eventos `token`, um por pedaço de texto gerado:

   ```
   event: token
   data: {"text": "O login "}
   ```

3. Um evento final `done`:

   ```
   event: done
   data: {"finish_reason": "stop"}
   ```

**Response — erro antes do stream começar**

O retrieval corre antes de o stream abrir, por isso falhas nesta fase ainda são respostas normais, não-streaming, com o shape `{"error": "...", "message": "..."}`:

| Status | Quando | Body |
|---|---|---|
| `400` | `user_id` em falta ou não é um uuid | `{"error": "missing_user_id" \| "invalid_user_id", "message": "..."}` |
| `404` | Não há chunks indexados para o `repo_id` **deste utilizador** (nunca foi indexado, o id não existe, ou pertence a outro utilizador) | `{"error": "repo_not_indexed", "message": "..."}` |
| `500` | Falha ao gerar o embedding da pergunta (Gemini) ou ao correr `match_chunks` (Supabase) | `{"error": "retrieval_failed", "message": "..."}` |
| `402` | O utilizador já usou todas as mensagens do mês (só o `apps/web` devolve este) | `{"error": "message_limit_reached", "message": "..."}` |

**Response — erro a meio do stream** (ex: a API do Gemini falha depois de já ter começado a gerar)

```
event: error
data: {"error": "generation_failed", "message": "..."}
```

O `apps/web` faz proxy deste stream sem bufferizar (`ReadableStream` em Route Handlers) — ver Fase 2 do `ROADMAP.md`. Se o `rag-service` não responder dentro de um timeout razoável (a definir na implementação, sugestão inicial: 30s até ao primeiro byte), o `apps/web` fecha a ligação e devolve `event: error` ao browser com `{"error": "upstream_timeout"}`.

---

## `GET /health`

Sem autenticação (é o único endpoint que não exige o token interno, para health checks do Railway).

```json
{"status": "ok"}
```

---

## O que falta decidir durante a implementação

- Timeout exato de `POST /query` até ao primeiro byte do stream.
- Se `POST /index` deve aceitar reindexação forçada de um repo já indexado recentemente, ou se há um cooldown mínimo.
- Rate limiting dos próprios endpoints do `rag-service` (hoje o rate limit é só o das APIs externas, GitHub/Gemini) — decidir se faz sentido antes da Fase 6.

Regista a decisão em `decisions.md` quando qualquer um destes pontos for fechado.
