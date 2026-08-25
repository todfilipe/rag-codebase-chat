# Decisões de Arquitectura — RAG Codebase Chat

Registo das decisões técnicas tomadas ao longo do projeto, com contexto e raciocínio.  
Formato: data · decisão · alternativas consideradas · porquê esta escolha.

---

## Como usar este ficheiro

```
### [Título da decisão]
**Data:** DD-MM-YYYY
**Contexto:** O que te levou a ter de tomar esta decisão?  
**Decisão:** O que escolheste fazer.  
**Alternativas consideradas:** O que mais ponderaste e porquê descartaste.  
**Consequências:** O que esta decisão implica a seguir (trade-offs, limitações, próximos passos).
```

---

## Decisões

## stack para os embendigs, gemini embendigs 2
**Data:** 09 05 2026  
**Contexto:** Gratis e bom
**Decisão:** escolhi ussar o modelo da google para fazer os embendigs  
**Alternativas consideradas:** nao considerei mais nenhuma alternativa, openai claude etc e pago e eu ja stava habituado a usar a api da  gemini  
**Consequências:** limitaçoes de velocidade  e de numero de embendings que posso fazer por minuto, ja que eu nao tenho uma chave api paga 

## sdk ou fetch ?
**Data:** 09 05 2026  
**Contexto:** no momento de escolher como chamar a API depareime com 2 opçoes o SDK oficial e usar fetch directamente 
**Decisão:** escolhi o fetch porque nao tem dependencias, aprendo melhor a falar com a api e segue a filosofia que tenho pra este projeto que é construir tudo do 0.
**Alternativas consideradas:** o sdk ate tem as suas vantagens  mas neste contexto em especifico o objetivo nao é apenas ter algo funcionar, eu queria entender tudo a fundo entao nao fazia muito sentido usar o sdk.
**Consequências:** nenhuma, simplesmente nao usei o sdk e usei fetch.

## como chunkar
**Data:** 09 05 2026  
**Contexto:** preciso de escolher como vou separar as chunks
**Decisão:** decidi fazer fixed-size com overlap porque o tradeoff entre complexidade e performance é muito bom, é simples de implementar e é muito eficaz para a maioria dos casos de uso.
**Alternativas consideradas:** considerei tambem fixed-size sem overlap e separar na fronteira das funcionas mas no fixed-size perco contexto e na fronteira das funcoes é mais complexo de implementar e nao acho que seja muito mais eficaz.
**Consequências:** tenho que ter cuidado com o tamanho das chunks e o overlap para que nao perca muito contexto nem tenha chunks muito grandes.

## medir o tamanho dos chunks
**Data:** 09 05 2026  
**Contexto:** preciso de decidir como vou medir as chunks seja por linhas, caracteres ou tokens
**Decisão:** decidi usar caracteres porque é a forma mais simples e intuitiva de medir o tamanho das chunks
**Alternativas consideradas:** por linhas despensei logo de inicio pois nao faz sentido, uma linha tanto pode ter 1 caracter como 500 e isso iria complicar muito o processo de chunking, por tokens a teoria é boa mas eu precisaria de um tokenizer e como estou a usar um plano free da api iria ficar um pouco limitado pralem de tambem adicionar um nivel de complixade que acho que nao e necessario 
**Consequências:** precisam de tokens reais aproximada e pequena variancia entre ficheiros.

## Parâmetros de chunking
**Data:** 09-05-2026  
**Contexto:** Após decidir separar os chunks por caracteres de forma fixa com overlap, era necessário definir os valores adequados.
**Decisão:** Tamanho do chunk fixado em 2000 caracteres, com um overlap de 200 caracteres. Será usado um fator de conversão de 4 chars/token apenas para sanity check do limite da API.
**Alternativas consideradas:** Valores maiores poderiam perder precisão no contexto e facilmente atingir limites de tokens. Valores menores fragmentariam o código demasiadamente.
**Consequências:** Ajuda a prevenir erros na API da Google (limites de tokens) de forma simples através do sanity check, sem precisar de bibliotecas de tokenização extra.

## Autenticação na GitHub API
**Data:** 09-05-2026  
**Contexto:** Foi necessário definir a estratégia de autenticação para interagir com a API do GitHub, visando viabilidade de uma demo poderosa (qualquer repo público acessível com URL) e simplicidade de implementação no MVP.
**Decisão:** PAT (Personal Access Token) interno como token único para chamar a GitHub API.
**Alternativas consideradas:** OAuth do utilizador (modelo B) e modelo híbrido (modelo C).
**Consequências:** O trade-off aceite é que os limites de rate-limit da API são partilhados entre todos os utilizadores, e não há suporte a repositórios privados na fase atual. Fica pendente decidir mais tarde se evoluímos para o modelo C quando OAuth com scopes for relevante (esta evolução fica em aberto sem desperdício de código).

## Schema: tabela repos separada e ON DELETE CASCADE
**Data:** 14-05-2026  
**Contexto:** precisei de modelar a base de dados para guardar os repositorios e os chunks no supabase.
**Decisão:** criei uma tabela `repos` separada com UUID, e pus uma foreign key na tabela `code_chunks` com ON DELETE CASCADE.
**Alternativas consideradas:** guardar o nome do repo em cada chunk sem tabela separada (desnormalizado), mas daria mais trabalho para gerir e apagar os dados.
**Consequências:** fica super fácil apagar um repositório, apago na tabela repos e o supabase trata de limpar os milhares de chunks automaticamente.

## Metadata dos chunks: start_offset e end_offset
**Data:** 14-05-2026  
**Contexto:** precisava de uma forma de saber exatamente de onde veio o texto de cada chunk dentro do ficheiro original.
**Decisão:** adicionei as colunas `start_offset` e `end_offset` à tabela `code_chunks`.
**Alternativas consideradas:** usar números de linha, mas offsets de caracteres são muito mais exatos e fáceis de manipular em strings.
**Consequências:** no futuro permite mapear a resposta de volta para o documento original com extrema precisão (por exemplo, para fazer highlights de código).

## Controlo de concorrência: Limite de 5
**Data:** 14-05-2026  
**Contexto:** a mandar muitos requests ao mesmo tempo para a API do GitHub e do Gemini as coisas começaram a rebentar.
**Decisão:** implementei um limite de concorrência de 5 para as leituras do GitHub e para a geração de embeddings no Gemini.
**Alternativas consideradas:** fazer sequencial (um a um) mas ficava muito lento. mandar tudo de vez rebentava com rate limits.
**Consequências:** indexa a uma velocidade porreira e ao mesmo tempo é seguro e não rebenta o RPM (Requests Per Minute) das APIs.

## Indexação clean slate
**Data:** 14-05-2026  
**Contexto:** como lidar com repositórios que já foram indexados e precisam de ser atualizados.
**Decisão:** a indexação faz clean slate, ou seja, apaga tudo o que lá estava antes e volta a inserir do zero, sem diff incremental.
**Alternativas consideradas:** fazer diff incremental verificando só os ficheiros que mudaram, mas a complexidade seria gigante nesta fase.
**Consequências:** muito mais simples de implementar e garante que o estado fica certinho. o tradeoff é que gasta mais tokens e tempo se o repositório for muito grande.

## Erros a meio da indexação
**Data:** 14-05-2026  
**Contexto:** o que fazer se o processo longo de indexação rebentar a meio (ex: falha de rede, limite da api).
**Decisão:** simplesmente atira um erro e deixa as coisas num estado parcial.
**Alternativas consideradas:** fazer rollback automático ou tentar recuperar de onde falhou.
**Consequências:** a recuperação fica para uma versão futura. por agora, se der erro o user tem de simplesmente voltar a tentar e o "clean slate" trata de limpar o que ficou a meio.

## Supabase RLS ativado desde início
**Data:** 14-05-2026  
**Contexto:** configurar as permissões das tabelas no Supabase.
**Decisão:** deixei o Row Level Security (RLS) ativado em todas as tabelas logo desde o início, mesmo sem ter policies ainda.
**Alternativas consideradas:** desligar o RLS para ser mais fácil de programar agora no início.
**Consequências:** defesa em profundidade. garante que se alguém tentar ir ler os dados a partir do frontend sem autorização não consegue, evitando leaks estúpidos de segurança.

## Escrita server-side com service_role_key
**Data:** 14-05-2026  
**Contexto:** com o RLS ativado, precisava de conseguir escrever na base de dados no momento da indexação.
**Decisão:** usar a `service_role_key` do Supabase para fazer as escritas a partir do servidor (API routes).
**Alternativas consideradas:** criar policies manhosas para permitir que o cliente escrevesse, o que seria perigoso.
**Consequências:** bypassa o RLS por design. como o código está a correr num ambiente seguro do servidor, tem controlo total e não temos de nos chatear com permissões complexas no postgres.

## Top-k = 5 sem threshold
**Data:** 16-05-2026  
**Contexto:** no retrieval, precisava de escolher quantos chunks ia enviar para o prompt e se usava ou não um valor mínimo de similaridade. reparei que queries relevantes batiam nos 0.65-0.7 e irrelevantes nos 0.4-0.5.
**Decisão:** decidi ir buscar sempre os top 5 (top-k = 5) sem aplicar qualquer threshold (corte por similaridade).
**Alternativas consideradas:** usar um threshold de ex: 0.6 e cortar o que viesse abaixo. no entanto as métricas e embeddings podem flutuar, e cortar cedo podia deitar fora coisas úteis.
**Consequências:** mando sempre 5 chunks e deixo o trabalho de filtrar o que realmente serve para responder a pergunta para o LLM.

## Função SQL match_chunks com filtragem por repo_id
**Data:** 16-05-2026  
**Contexto:** para buscar os embeddings da forma mais eficiente através do pgvector, precisava de cruzar a query com a tabela de forma performante.
**Decisão:** implementei uma função SQL chamada `match_chunks` no supabase onde passo o `repo_id` diretamente para dentro da query.
**Alternativas consideradas:** podia buscar todos os dados de um repo e calcular a distância do coseno localmente, mas isso não escala de todo.
**Consequências:** a procura é rápida e acontece do lado da base de dados sem esgotar memória ou transferir demasiados dados do postgres para a app.

## Isolamento de repositórios
**Data:** 16-05-2026  
**Contexto:** precisava de uma forma fiável de responder à pergunta de entrevista "como garantiste que repos de utilizadores diferentes não se misturam?".
**Decisão:** usar a filtragem por `repo_id` na chamada à base de dados (dentro da `match_chunks`) como o principal mecanismo de isolamento.
**Alternativas consideradas:** criar uma tabela ou schema diferente por repo, mas o esforço de gestão e a complexidade tornaria o projeto num pesadelo.
**Consequências:** a query só olha mesmo para as linhas do repo pretendido. não há forma nenhuma de uma pergunta do utilizador ir parar aos chunks do repo de outro, garantindo segurança e privacidade a nível de RAG.

## Modelo de geração: gemini-3.1-flash-lite-preview
**Data:** 16-05-2026  
**Contexto:** precisava de escolher que modelo usar para gerar a resposta final depois de ter os chunks. precisava de algo rápido e barato para a fase de testes e MVP.
**Decisão:** escolhi usar o `gemini-3.1-flash-lite-preview` como modelo de runtime.
**Alternativas consideradas:** usar modelos maiores como o pro, mas são mais caros e pesados. para a maioria das tarefas de RAG onde damos o contexto "mastigado", um modelo flash lite é excelente no trade-off custo/latência.
**Consequências:** poupo nos custos da api e a latência de resposta é baixíssima. se futuramente precisar de um modelo com mais raciocínio, é só mudar uma variável e a estrutura mantém-se.

## Estrutura do prompt RAG
**Data:** 16-05-2026  
**Contexto:** sem regras estritas, o LLM começa a divagar, inventar e ignorar o contexto.
**Decisão:** criei uma system instruction com 5 regras muito explícitas (grounding, anti-hallucination, citação, idioma e concisão) e um formato standard no user prompt: os chunks vêm separados por `---` e encabeçados com `## Ficheiro: [path]`.
**Alternativas consideradas:** despejar os chunks todos seguidos sem separadores ou system instructions complexas, o que acabava sempre em respostas genéricas e alucinações de ficheiros inexistentes.
**Consequências:** o LLM tem "muros" claros por onde se guiar, sabe distinguir quando acaba um ficheiro e começa outro e obedece melhor às restrições do grounding.

## Citação de fontes nas respostas
**Data:** 16-05-2026  
**Contexto:** o utilizador precisa de confirmar rapidamente onde estão os blocos de código ou as explicações que o assistente fornece, criando confiança na ferramenta.
**Decisão:** estabeleci o "file_path" guardado na DB como a fonte oficial e mandei o LLM citá-lo explicitamente sempre que responder a algo.
**Alternativas consideradas:** fazer highlight pós-geração ou não fazer citações de todo. no entanto, ter as referências orgânicas geradas pelo LLM flui muito melhor no chat.
**Consequências:** aumenta imediatamente a credibilidade da resposta, permitindo ao utilizador ir diretamente ao ficheiro `X` verificar se a implementação que o modelo descreveu é exatamente aquela.

## Índice de vetores: HNSW em vez de IVFFlat
**Data:** 01-08-2026  
**Contexto:** ao escrever o schema SQL real (`supabase/migrations/0001_initial_schema.sql`), precisava de escolher que tipo de índice usar em `code_chunks.embedding` para o `match_chunks` não fazer scan sequencial à medida que o volume de chunks cresce.
**Decisão:** índice HNSW (`vector_cosine_ops`).
**Alternativas consideradas:** IVFFlat, mas exige escolher um número de listas afinado ao volume de dados e degrada mais em recall com poucos dados (o caso normal por repositório aqui, que são milhares a dezenas de milhares de chunks, não milhões).
**Consequências:** melhor recall/latência para o volume esperado por repositório, sem precisar de reafinar o índice à medida que os dados crescem.

## `user_id` nulo em `repos` até à Fase 4
**Data:** 01-08-2026  
**Contexto:** ao escrever o schema SQL, o modelo de dados final (pós-Fase 4) já tem `repos.user_id`, mas a Fase 4 (auth) ainda não foi implementada — hoje não existe utilizador autenticado nenhum.
**Decisão:** criar já a coluna `user_id` (nullable, `references auth.users`), em vez de a adicionar só na Fase 4 via nova migration.
**Alternativas consideradas:** deixar a coluna de fora até à Fase 4 e adicioná-la depois com `ALTER TABLE`. Rejeitado porque criar a migration da Fase 4 sobre uma tabela já a preencher-se é mais arriscado (precisa de backfill) do que ter a coluna desde o início, simplesmente vazia até lá.
**Consequências:** antes da Fase 4, todo repo indexado fica com `user_id = null` e é visível a qualquer utilizador da app (policy de RLS mínima, ver migration). Isto é uma limitação conhecida e temporária, não um bug — fica resolvida quando a Fase 4 preencher `user_id` e as policies passarem a filtrar por ele.

## Formato de streaming: SSE com eventos nomeados (`sources`, `token`, `done`, `error`)
**Data:** 01-08-2026  
**Contexto:** ao definir o contrato de API (`docs/API-CONTRACT.md`) para `POST /query`, precisava de decidir a forma exata como o `rag-service` comunica progressivamente a resposta ao `apps/web`.
**Decisão:** SSE com eventos nomeados — `sources` primeiro (assim que o retrieval termina), depois vários `token`, terminando em `done` (ou `error` se falhar a meio).
**Alternativas consideradas:** um único stream de texto plano sem eventos nomeados (mais simples, mas obriga o cliente a adivinhar quando as fontes chegaram vs. quando é conteúdo da resposta) ou WebSockets (bidirecional, mas este caso de uso é só um pedido → uma resposta em stream, não precisa de bidirecionalidade — SSE é mais simples e mais barato de fazer proxy através de Route Handlers do Next.js).
**Consequências:** o frontend consegue mostrar as fontes citadas assim que o stream arranca (antes do texto todo chegar), e distinguir claramente erro-a-meio-do-stream de fim-normal, sem parsing ambíguo.

## Dark mode passa a tema primário da interface (revê decisão anterior)
**Data:** 01-08-2026  
**Contexto:** ao testar o primeiro prompt de design da landing page (`docs/interface-prompts/INTERFACE.md`) no Stitch e noutra ferramenta de geração de UI, o resultado em light mode pareceu "amador" — um formulário sozinho sem estrutura nem textura de fundo. Ao refinar o prompt para corrigir isso (nav bar mínima, glow subtil, pré-visualização do produto), o dark mode passou a ser o tema testado e validado.
**Decisão:** dark mode passa a ser o tema primário de todos os prompts de design da interface, revendo a decisão anterior de "modo escuro fica para a Fase 6 (polish)". Light mode passa a tema alternativo a implementar depois, usando os valores já documentados na tabela de paleta.
**Alternativas consideradas:** manter light mode como primário e só ajustar a estrutura (nav, textura, preview) sem mudar de tema — rejeitado porque o dark mode já é o que está validado visualmente nesta sessão, e reverter para light exigiria retestar tudo outra vez sem ganho claro.
**Consequências:** a Fase 3 do `ROADMAP.md` deve implementar dark mode primeiro (ou como único tema do MVP, se for mais simples), não light mode. Se mais tarde fizer sentido inverter outra vez, discutir e atualizar aqui e no `INTERFACE.md`.

## Perguntas em aberto da interface, decididas para não bloquear a Fase 3
**Data:** 01-08-2026  
**Contexto:** o `docs/interface-prompts/INTERFACE.md` tinha quatro perguntas de produto deliberadamente em aberto (histórico persiste?, múltiplos repos ativos?, sugestões estáticas ou dinâmicas?, modo escuro é prioridade?), que bloqueavam poder implementar a Fase 3 com confiança.
**Decisão:** para o MVP — sem persistência de histórico entre sessões, um repositório ativo de cada vez, perguntas sugeridas estáticas (não geradas a partir do README), modo escuro fica para a Fase 6 (polish).
**Alternativas consideradas:** para cada uma, a alternativa era a versão mais complexa (persistir histórico, multi-repo, sugestões dinâmicas via LLM, dark mode no MVP) — todas rejeitadas por não serem essenciais para provar o conceito do produto e adicionarem complexidade de estado ou custo de API sem benefício claro nesta fase.
**Consequências:** a Fase 3 pode avançar sem decisões de produto pendentes. Nenhuma destas decisões é definitiva — todas são boas candidatas a revisitar depois do MVP funcionar, especialmente persistência de histórico depois da Fase 4 (auth) dar um dono claro aos dados.
## PostgREST via httpx em vez do `supabase-py` no serviço Python
**Data:** 25-08-2026  
**Contexto:** ao portar o `indexer.ts` para Python, precisava de escolher como o `rag-service` escreve no Supabase. No protótipo TS era o SDK `@supabase/supabase-js`.
**Decisão:** falar diretamente com o PostgREST (a REST API que o Supabase expõe por cima do Postgres) usando `httpx`, sem SDK. O upsert do repo passa a ser um `POST /rest/v1/repos?on_conflict=owner,repo` com header `Prefer: resolution=merge-duplicates`, o clean slate um `DELETE /rest/v1/code_chunks?repo_id=eq.<uuid>`, e os inserts um `POST` com um array no body.
**Alternativas consideradas:** o `supabase-py`, que é o equivalente direto do SDK usado no protótipo. Rejeitado por duas razões: é a mesma escolha já registada em "sdk ou fetch?" (09-05-2026) aplicada agora ao Supabase, e o cliente principal do `supabase-py` é síncrono, o que bloquearia o event loop do FastAPI (o caminho async existe mas é uma API à parte).
**Consequências:** uma dependência a menos, e o `indexer.py` fica no mesmo padrão que o `github_client.py` e o `embeddings.py` (fábrica de `AsyncClient` com `base_url` e headers, passado às funções). Em troca, ficam expostos detalhes do PostgREST no código: `Prefer: return=minimal` para não receber de volta os embeddings acabados de inserir, e `Accept: application/vnd.pgrst.object+json` como equivalente ao `.single()` do supabase-js. O `retriever.py` vai reutilizar o mesmo cliente para chamar `POST /rest/v1/rpc/match_chunks`.

## Concorrência em Python: `asyncio.Semaphore` em vez do pool por lotes do TS
**Data:** 25-08-2026  
**Contexto:** o `indexer.ts` implementava o limite de 5 cortando a lista em fatias de 5 e fazendo `Promise.all` de cada fatia. Ao portar, havia a hipótese de replicar isso tal e qual ou usar o idiomático em Python.
**Decisão:** um `asyncio.Semaphore(5)` com um único `asyncio.gather` sobre a lista toda, em vez do ciclo de fatias.
**Alternativas consideradas:** replicar o pool por lotes linha a linha. Rejeitado porque o lote sofre de head-of-line blocking: se um dos 5 ficheiros demorar 3 segundos e os outros 100ms, ficam 4 slots parados até o lento acabar, porque a fatia seguinte só arranca depois de o `Promise.all` resolver. O semáforo liberta cada slot no instante em que o pedido acaba.
**Consequências:** o teto de pedidos em simultâneo continua a ser 5, mas passa a ser aproveitado por inteiro, logo a indexação fica mais rápida. Há aqui um detalhe importante e que vale a pena saber explicar: **5 em simultâneo nunca foi um limitador de RPM**. Com ~300ms por embedding, 5 em voo dão ~16 pedidos por segundo, muito acima dos 100 RPM do plano gratuito do Gemini. O protótipo TS safava-se em parte por ser ineficiente, e a versão Python, por ser mais eficiente, chega mais depressa ao limite. Se aparecerem `429`s a meio da indexação, a correção certa é um rate limiter a sério (pedidos por janela de tempo), não baixar a concorrência ao calhas. O `API-CONTRACT.md` já prevê devolver `429` nesse caso.

## `indexed_at` escrito no fim da indexação (muda comportamento do protótipo)
**Data:** 25-08-2026  
**Contexto:** o upsert do protótipo TS escrevia `{ owner, repo, url }`. Como o `default now()` da coluna `indexed_at` só dispara no `INSERT`, uma reindexação nunca lhe tocava e a coluna ficava congelada na data da primeira indexação. Nunca deu problema porque nenhum endpoint de diagnóstico a lia.
**Decisão:** escrever `indexed_at` explicitamente, num `PATCH` ao repo **depois** do último chunk estar gravado. A coluna passa a significar "última indexação concluída com sucesso".
**Alternativas consideradas:** (a) deixar como estava e resolver na Fase 5, quando o dashboard precisar da data. Rejeitado porque o bug seria descoberto três fases depois da causa, e o valor errado é plausível (não é nulo nem dá erro, é só mentira). (b) escrever no upsert, no início. Rejeitado porque, com a decisão de não haver rollback (14-05-2026), um repo que rebenta a meio ficaria com data fresca e conteúdo parcial: o dashboard diria "indexado há 2 minutos" sobre um repo meio indexado.
**Consequências:** um repo cuja indexação falhou mantém a data da última vez que esteve completo, que é a verdade. Custa um pedido HTTP extra por indexação. Nota conhecida: o timestamp vem do relógio da máquina que corre o `rag-service`, não do Postgres, por isso pode divergir do `created_at` se os relógios não estiverem sincronizados (na máquina local havia ~30s de diferença). Irrelevante para mostrar uma data num dashboard, e desaparece em produção com NTP. Se algum dia a precisão passar a importar, a correção é gerar o timestamp no Postgres (trigger ou função) em vez de o mandar do cliente.

## "Caractere" não é a mesma unidade em JS e em Python (chunking diverge em ficheiros com emojis)
**Data:** 25-08-2026  
**Contexto:** no teste lado-a-lado do fim da Fase 1, indexei o mesmo repo (`sindresorhus/slugify`) com o protótipo TS e com o `rag-service` em Python. Mesmo número de ficheiros (8) e de chunks (20), mas 14 dos 20 chunks tinham conteúdo diferente. O caso que denunciou a causa foi o `overridable-replacements.js`: conteúdo byte a byte idêntico, mas 134 caracteres em Python e 135 em TS.
**Decisão:** ficar com o comportamento do Python (contar code points) e aceitar que os chunks deixam de ser idênticos aos do protótipo em ficheiros com caracteres fora do BMP.
**Alternativas consideradas:** replicar a contagem UTF-16 do JS em Python, para os dois produzirem chunks iguais. Rejeitado porque a contagem do JS é a pior das duas: em UTF-16 um emoji é um surrogate pair (duas unidades), e cortar num índice arbitrário pode partir esse par ao meio, produzindo meio caractere inválido. Em Python isso é impossível por construção, porque a unidade de fatiar é o code point. Verifiquei se o chunker TS chegou a partir algum par neste repo: não partiu, mas só por sorte, nenhuma fronteira calhou lá.
**Consequências:** isto não invalida a decisão de 09-05-2026 de medir os chunks em caracteres, mas acrescenta-lhe uma nota importante: "caractere" não é uma unidade universal, depende da linguagem. A diferença de comprimento é sempre exatamente o número de caracteres fora do BMP no ficheiro (confirmado ficheiro a ficheiro: 1 emoji = 1 de diferença). Como o protótipo TS vai ser descontinuado, a divergência não fica a incomodar ninguém. Ver a entrada seguinte para o efeito nos offsets.

## `start_offset` e `end_offset` são offsets em code points, não em UTF-16
**Data:** 25-08-2026  
**Contexto:** consequência direta da entrada anterior. Os offsets guardados em `code_chunks` são gerados pelo `chunker.py`, logo contam code points de Python.
**Decisão:** assumir e documentar que os offsets estão em code points, e tratar isso como parte do contrato dos dados, não como detalhe de implementação.
**Alternativas consideradas:** guardar também um offset em UTF-16 para conveniência do frontend. Rejeitado por agora: acrescenta uma coluna e uma conversão para resolver um problema que ainda não existe (não há UI a usar offsets).
**Consequências:** armadilha à espera na Fase 3. Se a UI mostrar o excerto citado destacando-o dentro de um ficheiro carregado no browser, o JavaScript vai indexar essa string em UTF-16 e o destaque fica desalinhado em ficheiros com emojis (desalinhado por 1 posição por emoji antes do offset). Duas saídas quando lá chegar: converter o offset no cliente antes de o usar, ou nem sequer usar offsets para destacar e mostrar apenas o `content` do chunk, que já está guardado e não precisa de alinhamento nenhum. A segunda é mais simples e provavelmente a certa.
