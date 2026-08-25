# RAG Codebase Chat

Faz perguntas em linguagem natural sobre qualquer repositório GitHub público e recebe respostas fundamentadas no código real, com citação dos ficheiros usados como fonte.

## O que faz e que problema resolve

Ler um codebase desconhecido é lento. Procurar "onde é que isto está definido?" ou "como funciona este fluxo?" obriga a saltar entre ficheiros e a adivinhar por onde começar.

O **RAG Codebase Chat** resolve isto indexando o repositório uma vez e permitindo depois interrogá-lo em linguagem natural. O sistema:

1. Lê os ficheiros de código do repositório via GitHub API.
2. Parte cada ficheiro em pedaços (*chunks*) e gera um *embedding* (vetor semântico) para cada um.
3. Guarda esses vetores no Postgres com a extensão `pgvector`.
4. Quando fazes uma pergunta, converte-a também num vetor, procura os *chunks* mais parecidos por *cosine similarity*, e envia esses excertos a um LLM para gerar a resposta final citando os ficheiros de origem.

Este padrão chama-se **RAG** (Retrieval-Augmented Generation): em vez de pedir ao modelo que "adivinhe" a partir do que memorizou, dá-se-lhe o contexto relevante recuperado da base de dados, o que reduz alucinações e permite responder sobre código que o modelo nunca viu.

> Todo o pipeline de RAG (chunking, embeddings, *vector search*, geração) foi construído de raiz, sem LangChain nem outras abstrações, por opção deliberada.

## Stack tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Framework / Runtime | [Next.js](https://nextjs.org) 16 (App Router) · React 19 |
| Linguagem | TypeScript 5 (modo estrito) |
| Base de dados | Supabase (PostgreSQL + extensão `pgvector`) via [`@supabase/supabase-js`](https://github.com/supabase/supabase-js) |
| Embeddings | Google Gemini — modelo `gemini-embedding-2` (768 dimensões) |
| Geração de respostas | Google Gemini — modelo `gemini-3.1-flash-lite-preview` |
| Fonte de código | GitHub REST API (v2022-11-28) |
| Estilos | Tailwind CSS 4 |
| Lint | ESLint 9 (`eslint-config-next`) |

> **Nota sobre versões:** os números de versão acima refletem exatamente o que está declarado no `package.json`. Os nomes dos modelos Gemini são os que estão definidos em [`lib/gemini.ts`](lib/gemini.ts) e [`lib/generator.ts`](lib/generator.ts).

## Funcionalidades principais

- **Parsing e validação de URLs do GitHub** — aceita URLs normais e de `git clone` (`.git`), rejeitando URLs que não pertençam ao `github.com`. Ver [`lib/github.ts`](lib/github.ts).
- **Listagem e filtragem inteligente de ficheiros** — descobre o *branch* principal automaticamente (`main` ou `master`), percorre a árvore completa do repositório e filtra por extensão, tamanho (máx. 100 KB) e diretórios ignorados (`node_modules`, `dist`, `.git`, etc.).
- **Chunking com sobreposição** — divide o texto em pedaços de 2000 caracteres com 200 de sobreposição, para não cortar contexto a meio de uma fronteira de *chunk*. Ver [`lib/chunker.ts`](lib/chunker.ts).
- **Geração de embeddings** — vetores de 768 dimensões via Gemini, com verificação explícita da dimensão devolvida. Ver [`lib/gemini.ts`](lib/gemini.ts).
- **Indexação end-to-end com concorrência controlada** — *upsert* do repositório, limpeza dos *chunks* antigos (*clean slate* a cada reindexação) e processamento em *pools* de 5 chamadas paralelas para respeitar o *rate limit* da API. Ver [`lib/indexer.ts`](lib/indexer.ts).
- **Vector search isolado por repositório** — recupera os *top-k* *chunks* mais similares através de uma função SQL `match_chunks`, filtrando sempre por `repo_id` para que repositórios diferentes nunca se misturem. Ver [`lib/retriever.ts`](lib/retriever.ts).
- **Geração de respostas com *grounding* e citação de fontes** — o modelo é instruído a responder apenas com base nos excertos fornecidos, a admitir quando não tem informação suficiente e a citar os ficheiros usados. Ver [`lib/generator.ts`](lib/generator.ts).

## Pré-requisitos

- **Node.js** 20 ou superior (exigido pelas dependências e tipos declarados).
- **npm** (ou outro gestor compatível; os exemplos usam npm).
- **Conta Supabase** com um projeto onde a extensão `pgvector` esteja ativada.
- **Chave da API Gemini** (Google AI Studio).
- **GitHub Personal Access Token** com permissão de leitura de repositórios públicos.

## Instalação

### 1. Clonar e instalar dependências

```bash
git clone <URL-DO-TEU-REPOSITORIO>
cd rag-codebase-chat
npm install
```

### 2. Preparar a base de dados (Supabase)

No teu projeto Supabase, ativa a extensão `pgvector` e cria o schema. A estrutura abaixo é a documentada em [`decisions.md`](decisions.md) e usada pelo código:

- Tabela **`repos`** — `id` (UUID, chave primária), `owner`, `repo`, `url`, com restrição de unicidade em `(owner, repo)`.
- Tabela **`code_chunks`** — `repo_id` (chave estrangeira para `repos.id` com `ON DELETE CASCADE`), `file_path`, `content`, `start_offset`, `end_offset`, `chunk_index` e `embedding` (`vector(768)`).
- Função SQL **`match_chunks(query_embedding, match_repo_id, match_count)`** — devolve os *chunks* mais similares de um dado repositório, ordenados por *cosine similarity*.

> ℹ️ Os scripts SQL de criação de tabelas e da função `match_chunks` não estão versionados neste repositório. Consulta [`decisions.md`](decisions.md) para o desenho exato das tabelas e do isolamento por `repo_id`. **[PLACEHOLDER: adicionar as migrations SQL ao repositório, ex. numa pasta `supabase/`.]**

### 3. Configurar variáveis de ambiente

Cria um ficheiro `.env.local` na raiz do projeto (está ignorado pelo Git). Ver a secção [Variáveis de ambiente](#variáveis-de-ambiente) para a descrição de cada uma:

```bash
GEMINI_API_KEY=a-tua-chave-gemini
GITHUB_TOKEN=o-teu-github-token
SUPABASE_URL=https://o-teu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=a-tua-service-role-key
```

## Correr localmente

Arrancar o servidor de desenvolvimento:

```bash
npm run dev
```

A aplicação fica disponível em [http://localhost:3000](http://localhost:3000).

### Endpoints de diagnóstico

O pipeline é atualmente exercitado através de *endpoints* de diagnóstico (rotas `GET`). Estão marcados no código para serem removidos quando a interface final de chat existir.

**Indexar um repositório** (lê, faz *chunk*, gera *embeddings* e grava tudo):

```bash
curl "http://localhost:3000/api/test-indexer?url=https://github.com/owner/repo"
```

Devolve o `repoId` gerado, número de ficheiros indexados e de *chunks* criados. Guarda o `repoId` para os passos seguintes.

**Recuperar os chunks mais relevantes para uma pergunta:**

```bash
curl "http://localhost:3000/api/test-retriever?q=como%20funciona%20o%20login&repoId=<REPO_ID>"
```

**Correr o pipeline RAG completo (recuperação + geração da resposta):**

```bash
curl "http://localhost:3000/api/test-generator?q=como%20funciona%20o%20login&repoId=<REPO_ID>"
```

Devolve a resposta gerada e a lista de ficheiros usados como fonte, cada um com o respetivo *score* de similaridade.

Existem ainda *endpoints* de diagnóstico mais granulares para testar peças isoladas: `test-embedding`, `test-chunker`, `test-github`, `test-github-list` e `test-github-file`.

## Estrutura de pastas

```
rag-codebase-chat/
├── app/                      # Next.js App Router
│   ├── api/                  # Endpoints de diagnóstico (um por peça do pipeline)
│   │   ├── test-embedding/   #   → gera embedding de um texto
│   │   ├── test-chunker/     #   → parte texto em chunks
│   │   ├── test-github/      #   → parsing de URL do GitHub
│   │   ├── test-github-list/ #   → lista ficheiros de um repo
│   │   ├── test-github-file/ #   → lê o conteúdo de um ficheiro
│   │   ├── test-indexer/     #   → pipeline de indexação completo
│   │   ├── test-retriever/   #   → vector search por repo
│   │   └── test-generator/   #   → pipeline RAG end-to-end
│   ├── layout.tsx            # Layout raiz da aplicação
│   ├── page.tsx              # Página inicial
│   └── globals.css           # Estilos globais (Tailwind)
├── lib/                      # Lógica do pipeline RAG (construída de raiz)
│   ├── github.ts             # Cliente GitHub: parsing, listagem, leitura, filtragem
│   ├── chunker.ts            # Divisão de texto em chunks com sobreposição
│   ├── gemini.ts             # Geração de embeddings via Gemini
│   ├── indexer.ts            # Orquestra indexação: fetch → chunk → embed → gravar
│   ├── retriever.ts          # Vector search (match_chunks) filtrado por repo_id
│   └── generator.ts          # Geração da resposta final com citação de fontes
├── decisions.md              # Registo das decisões técnicas e respetivos trade-offs
├── package.json
└── tsconfig.json
```

## Variáveis de ambiente

Todas são lidas do `.env.local` (nunca commitado). **Não incluas valores reais no controlo de versões.**

| Variável | Descrição | Onde é usada |
|----------|-----------|--------------|
| `GEMINI_API_KEY` | Chave da API Google Gemini, usada para gerar *embeddings* e respostas. | [`lib/gemini.ts`](lib/gemini.ts), [`lib/generator.ts`](lib/generator.ts) |
| `GITHUB_TOKEN` | GitHub Personal Access Token para ler repositórios via API. | [`lib/github.ts`](lib/github.ts) |
| `SUPABASE_URL` | URL do projeto Supabase. | [`lib/indexer.ts`](lib/indexer.ts), [`lib/retriever.ts`](lib/retriever.ts) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave *service role* do Supabase (acesso total; usar apenas no servidor). | [`lib/indexer.ts`](lib/indexer.ts), [`lib/retriever.ts`](lib/retriever.ts) |

> ⚠️ A `SUPABASE_SERVICE_ROLE_KEY` dá acesso total à base de dados e ignora as *Row Level Security policies*. Nunca a exponhas no cliente nem a versiones. Se alguma destas chaves for exposta acidentalmente, **rota-a de imediato** no respetivo painel.

## Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Arranca o servidor de desenvolvimento em `localhost:3000`. |
| `npm run build` | Compila a aplicação para produção. |
| `npm run start` | Serve a *build* de produção. |
| `npm run lint` | Corre o ESLint sobre o projeto. |

## Testes

Atualmente **não existe uma suíte de testes automatizados** (nenhum *runner* como Jest ou Vitest está configurado no `package.json`).

A verificação é feita manualmente através dos *endpoints* de diagnóstico descritos na secção [Correr localmente](#correr-localmente), que exercitam cada peça do pipeline de forma isolada e o fluxo completo end-to-end.

## Roadmap

> Esta secção reflete o âmbito documentado em [`CLAUDE.md`](CLAUDE.md) e [`decisions.md`](decisions.md). Os pontos abaixo **ainda não estão implementados** no código.

- Interface de chat (substituindo os *endpoints* de diagnóstico).
- *Streaming* das respostas via Server-Sent Events (SSE).
- Autenticação e dashboard de utilizador.
- *Billing* / planos.
- *Row Level Security* no Supabase e reforço do isolamento por utilizador.

## Como contribuir

Este é um projeto de portfólio de aprendizagem, com foco em construir cada peça do RAG de raiz e compreendê-la a fundo. Se quiseres contribuir:

1. Faz *fork* do repositório e cria um *branch* descritivo (`feat/...` ou `fix/...`).
2. Garante que `npm run lint` passa sem erros.
3. Mantém o código **simples e comentado no "porquê"**, sem abstrações prematuras e sem `any` no TypeScript (convenções seguidas em todo o projeto).
4. Se tomares uma decisão técnica não trivial, regista-a em [`decisions.md`](decisions.md).
5. Abre um *Pull Request* a descrever a mudança e o raciocínio.

## Licença

**[PLACEHOLDER: nenhuma licença foi encontrada no repositório.]** Sem um ficheiro `LICENSE`, o código é, por defeito, "todos os direitos reservados". Adiciona uma licença (ex. MIT) se pretenderes permitir reutilização.

## Autor

**[PLACEHOLDER: autor não declarado no código.]** O *commit history* atribui o trabalho a *Filipe*; confirma e preenche aqui o nome/contacto que preferires expor publicamente.
