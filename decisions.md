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
**Fecho (27-08-2026):** a previsão só se cumpriu para metade. As policies passaram a filtrar por `auth.uid()` como estava previsto, mas o `user_id` dos repos antigos nunca chegou a ser preenchido: não havia dono nenhum para lhes atribuir. O que estava escrito como "preencher" acabou por ser um `delete`. Ver "Repos do modelo antigo apagados" (27-08-2026).

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

## Supabase Auth em vez de Clerk
**Data:** 25-08-2026  
**Contexto:** ao arrancar a Fase 4, o `ROADMAP.md`, o `LOGICA-DO-PROJETO.md` e o `ENV.md` assumiam Clerk como fornecedor de autenticação. Ao ir procurar a justificação, ela não existia: o Clerk nunca foi registado neste ficheiro, era um pressuposto herdado sem discussão. Ao examiná-lo, percebeu-se que dependia de uma pergunta de produto ainda em aberto (a app indexa repositórios privados?).
**Decisão:** usar Supabase Auth, com GitHub OAuth e email/password como métodos de login. O login é um portão de acesso ao serviço (obrigar a criar conta para usar o plano gratuito), não uma forma de obter permissões sobre os repositórios do utilizador. Só repositórios públicos ficam no âmbito do produto.
**Alternativas consideradas:** Clerk, que era o default herdado. Tinha uma vantagem técnica real e específica para este projeto: guarda e renova os tokens OAuth das contas ligadas, o que seria infraestrutura necessária se a app indexasse repos privados com as credenciais de cada utilizador (o Supabase Auth devolve o `provider_token` uma única vez a seguir ao callback e não o guarda, obrigando a construir tabela, encriptação e renovação à mão). Com a decisão de só suportar repos públicos, essa vantagem deixou de se aplicar e sobrou DX contra um fornecedor a mais. Ficou também por rejeitar o caminho "Clerk + integração third-party auth do Supabase", que era o que seria preciso para ter RLS por utilizador com identidades do Clerk.
**Consequências:** a coluna `user_id uuid references auth.users (id)` da migration 0001 continua correta tal como foi escrita em 01-08-2026, e o `auth.uid()` fica disponível dentro das policies de RLS sem configuração extra, o que simplifica a etapa mais delicada da Fase 4 (isolamento por utilizador). Em troca, o `apps/web` passa a precisar do `@supabase/ssr` e de tratar dos cookies de sessão no middleware, que é mais código do que o `clerkMiddleware()` teria sido. Sai do `ENV.md` o par de chaves do Clerk e entram as variáveis públicas do Supabase: é a primeira vez desde 25-08-2026 (apagar o pipeline TS) que o `apps/web` volta a falar diretamente com o Supabase, mas só para auth, nunca para RAG. A GitHub OAuth App continua a ser precisa, com o scope mínimo e sem `repo`; o `provider_token` que o Supabase devolve no callback é deliberadamente deitado fora. Quem lê o GitHub continua a ser o `GITHUB_TOKEN` interno do `rag-service`. Se algum dia os repos privados entrarem no produto, esta decisão tem de ser reaberta, e o custo de a reabrir é construir a guarda de tokens à mão ou migrar de fornecedor.

## Repos do modelo antigo apagados em vez de adotados (fecho da Fase 4)
**Data:** 27-08-2026  
**Contexto:** última etapa da Fase 4. Com o isolamento por utilizador em vigor, ficavam na base de dados os repositórios indexados sob o modelo antigo (PAT partilhado, decisão de 09-05-2026), todos com `user_id` nulo. O backfill da migration de posse copiava o `user_id` de `repos` para `code_chunks`, mas só onde não era nulo, por isso não migrou nada: nenhum repo pré-Fase 4 tinha dono para copiar.
**Decisão:** apagá-los, e passar `user_id` a `not null` nas duas tabelas.
**Alternativas consideradas:** (a) adotá-los para a minha conta, fazendo backfill com o meu uuid. Rejeitado porque atribuía a um utilizador repositórios que ele nunca conectou pela app, e misturava dados de teste com dados de produção logo no primeiro dia do modelo novo. (b) deixá-los como estavam. Rejeitado porque já eram inalcançáveis (a policy `auth.uid() = user_id` e o filtro do `match_chunks` dão ambos falso contra nulo), portanto seriam embeddings a ocupar espaço sem ninguém os ler, e a coluna ficava nullable para sempre.
**Consequências:** o valor real não está na limpeza, está no `not null`: enquanto a coluna aceitasse nulo, um caminho de código que se esquecesse do `user_id` gravava linhas invisíveis em silêncio em vez de rebentar no insert. Perderam-se os repos indexados até aqui, que são reindexáveis a partir do GitHub em minutos. A Fase 4 não conseguia inventar um dono para dados anónimos, e este é o custo de ter deixado a coluna nullable durante três fases: barato agora, impossível de repetir depois de haver utilizadores reais.

## Squash das migrations num único ficheiro
**Data:** 27-08-2026  
**Contexto:** ao fechar a Fase 4 havia seis migrations. Lidas em conjunto, boa parte delas desfazia trabalho das anteriores: o `match_chunks` era criado três vezes e dropado duas (mudou de assinatura ao ganhar linhas e depois `match_user_id`), o `user_id` nascia nullable para levar um `set not null` no fim, e o `unique (owner, repo)` era criado, dropado e substituído. Uma instalação nova corria dezenas de linhas para chegar a um estado que oitenta e oito linhas descrevem diretamente.
**Decisão:** colapsar as seis num único `0001_initial_schema.sql` que descreve o schema final, correr `reset-prototype.sql` e reaplicá-lo do zero. Os ficheiros antigos ficam no histórico do git.
**Alternativas consideradas:** manter a cadeia append-only, que é a regra certa em produção (nunca se reescreve uma migration que já correu, acrescenta-se outra a corrigir). Rejeitado aqui porque a regra existe para o caso em que não se pode deitar os dados fora, e neste projeto ainda se pode. Havia também a hipótese de adiar o squash para a Fase 6, que era mais conservador mas obrigava a arrastar até lá uma cadeia que já se sabia descartável.
**Consequências:** instalar o projeto passa a ser um ficheiro. As policies com nomes datados (`"repos são legíveis por todos (pré-Fase 4)"`) deixam de existir em vez de precisarem de ser dropadas, e as que sobram dispensam aspas. O `unique nulls not distinct` volta a ser um `unique` normal, porque só existia enquanto o `user_id` podia ser nulo. Em troca, o `0001` descreve o destino e não conta o caminho: as referências às migrations `0002` e `0003` que estavam no `API-CONTRACT.md`, no `LOGICA-DO-PROJETO.md` e no `ROADMAP.md` ficaram a apontar para ficheiros que já não existem e tiveram de passar a apontar para aqui. **Esta é a última vez que isto é possível.** A janela fecha no dia em que houver um utilizador real cujos dados não se possam apagar, e a partir daí a única saída é a cadeia append-only.

## Métrica de billing: três limites por plano (indexações, repositórios ativos, mensagens)
**Data:** 28-08-2026  
**Contexto:** primeira etapa por fazer da Fase 5. O `ROADMAP.md` deixava a pergunta em aberto com três hipóteses (nº de repositórios, nº de perguntas, tokens consumidos) e nenhuma resolve o problema sozinha, porque o custo do produto não é uniforme. Indexar faz uma chamada de embedding por chunk de 2000 chars e não tem teto nenhum (o `github_client.py` filtra por extensão e por 100KB por ficheiro, mas não limita o número de ficheiros), por isso o custo por repositório varia por ordens de grandeza. Uma pergunta, pelo contrário, tem custo praticamente constante, porque o top-k=5 fixa o contexto em no máximo ~10.000 chars. Uma indexação vale centenas a milhares de perguntas em custo, e reindexar paga tudo de novo por causa do clean slate (decisão de 14-05-2026).
**Decisão:** o plano define três quotas, não uma métrica só: **indexações por mês**, **repositórios ativos** e **mensagens por mês**. Por cima delas, um **teto de chunks por repositório que varia com o plano**, verificado antes do primeiro embedding: um repositório acima do teto do plano é recusado com erro claro, sem gastar nada. As três quotas cobrem cada uma um custo diferente e nenhuma substitui as outras: indexações cobrem o custo de embeddings, repositórios ativos cobrem o armazenamento persistente dos vetores, mensagens cobrem o custo de runtime.
**Alternativas consideradas:** (a) repositórios ativos como eixo único, que é a unidade mais legível numa pricing page, rejeitado porque deixa a reindexação de graça: apagar um repositório libertaria a vaga e o utilizador do plano free podia reindexar em ciclo, pagando embeddings novos de cada vez sem nunca passar do limite. É precisamente esse buraco que o contador de indexações tapa. (b) Nº de perguntas como eixo único, a métrica mais correlacionada com o custo de runtime graças ao top-k fixo, rejeitada por deixar de fora exatamente a parte cara e ilimitada. (c) Tokens consumidos, o custo real com pass-through exato, rejeitado por duas razões independentes: obriga a contabilidade por chamada antes de existir um único cliente, e dá ao utilizador uma fatura que ele não consegue prever antes de a receber. (d) Um teto de chunks igual em todos os planos, tratando o tamanho do repositório como restrição técnica do produto em vez de eixo de plano. Rejeitado porque o plano gratuito precisa de ser mais apertado que os outros: com o free tier do Gemini por trás, um repositório grande no plano free é caro e lento de indexar por razões que não têm nada a ver com o valor entregue ao utilizador. (e) Substituir o contador de indexações por uma quota de chunks por mês, mais fiel ao custo, rejeitada porque o utilizador não sabe quantos chunks tem um repositório antes de tentar, e uma quota que não se consegue prever não serve para escolher um plano.
**Consequências:** os três limites não são o mesmo mecanismo com nomes diferentes. **Repositórios ativos** é um limite de estado (quantos existem agora) e mede-se com um `count` em `repos` filtrado por `user_id`, que já existe e já está protegido por RLS. **Indexações** e **mensagens** são limites de fluxo (quantos aconteceram na janela) e nenhum dos dois tem hoje onde ser contado: não há tabela de mensagens (decisão de 01-08-2026, sem persistência de histórico) nem registo de cada corrida de indexação, só o estado atual em `repos.index_stage`. Ambos exigem uma tabela de uso nova com janela mensal, que é o grosso do trabalho de schema desta fase. O teto de chunks é o mais barato dos quatro: o `indexer.py` já conhece o número total de chunks antes do primeiro embedding, por isso a recusa acontece a custo zero em vez de a meio da indexação. Nota importante para não confundir dois problemas: o teto por plano protege o **custo e o tempo de uma indexação individual**, mas não protege a quota do Gemini, que é da chave da app e partilhada por todos os utilizadores. Dez utilizadores dentro do seu teto individual podem esgotá-la ao mesmo tempo. Quem trata disso é um rate limiter a sério, como já ficou escrito na decisão de concorrência de 25-08-2026, e não um cap por plano. Os números concretos de cada quota ficam por calibrar na etapa do Stripe, com dados reais de uso: esta decisão fixa as métricas, não a tabela de preços.

## Tabela de planos: Free, Pro a 12€, Ultra a 29€
**Data:** 29-08-2026  
**Contexto:** primeira sub-etapa da integração do Stripe. A decisão de 28-08 fixou as métricas e deixou os valores "por calibrar com dados reais". Ao calcular o custo com o pricing real (`gemini-embedding-2` a $0,20/M, `gemini-3.1-flash-lite` a $0,25 in / $1,50 out) apareceram três factos que nenhuma intuição tinha dado. Um chunk custa $0,0001 a indexar e uma mensagem custa $0,0013, ou seja uma indexação de 1.000 chunks vale 75 mensagens. Guardar 1.000 chunks custa ~$0,001 por mês, o que dá oito anos de armazenamento pelo preço de uma única reindexação. E o mercado: o Cody descontinuou os planos self-serve e recuou para Enterprise a $59/lugar, o Greptile trocou o flat-rate de $30 por $1 por review em março de 2026, e o Copilot passa a faturação por uso em junho de 2026. Os três a fugir do mesmo sítio, que era para onde eu ia.
**Decisão:** três planos. Free (3 repositórios, 1.000 chunks por repo, 100 mensagens/mês), Pro a 9€ (30 repositórios, 10.000 chunks por repo, 1.500 mensagens/mês), Ultra a 28€ (70 repositórios, 40.000 chunks por repo, 5.000 mensagens/mês). Reindexação ilimitada nos três. O Pro é o plano herói e o Ultra a âncora; o que faz alguém subir é o tamanho máximo por repositório, o único eixo onde um monorepo grande simplesmente não cabe no plano de baixo.
**Alternativas consideradas:** (a) Ultra a 49€, que era o que a conta do custo pedia. Rejeitado pela análise de mercado: por $53 o comprador tem o Cursor Pro+ a $60 com limites 3x e modelos de fronteira, ou está a $6 do Cody Enterprise com SSO e suporte. Uma ferramenta de propósito único não ganha essa comparação, e o teto realista de self-serve neste mercado é $10 a $30. (b) Estrangular o Pro de propósito para empurrar toda a gente para o Ultra, que era a minha intenção inicial. Rejeitado por duas razões independentes: perde-se por inteiro quem tinha 12€ de disposição a pagar e não sobe (vai-se embora), e o padrão documentado das pricing pages é o plano do meio ser o herói, com o ganho de 12 a 15% a vir de empurrar para o meio, não para o topo. (c) Limites apertados de repositórios (5 no Pro, 10 no Ultra), que foi a primeira tabela que escrevi. Rejeitado quando percebi que guardar é ~100x mais barato do que reindexar: um limite apertado de vagas não poupa nada, obriga a pessoa a apagar para abrir espaço, e é o próprio limite que provoca a reindexação cara mais tarde.
**Consequências:** o mais útil que sai daqui não são os números, é a régua que os produziu. Há dois tipos de limite num plano e eu estava a tratá-los como o mesmo: os que **controlam custo** (existem porque a operação gasta dinheiro) e os que **segmentam disposição a pagar** (existem só para dar razão de subir). Passados por essa régua, só sobra um controlo de custo verdadeiro, que é chunks indexados por mês. O tamanho máximo por repo é misto. Repositórios e mensagens são quase só escada de valor, e por isso podem ser generosos sem custo. Foi isso que permitiu a tabela deixar de parecer racionamento. Segunda consequência, e foi precisa uma tentativa falhada para lá chegar: eu tinha escrito que o Ultra empata no mês em que a pessoa liga todos os repositórios, e que isso era um período de retorno a defender. Está errado, e o Filipe apanhou-o. Encher 70 vagas de 40.000 chunks são $280 de indexação, mas esses $280 saem do mesmo orçamento mensal de 200.000 chunks, portanto demoram 14 meses a acontecer e nunca aparecem todos num mês só. **A utilização justa é o que garante que o custo nunca ultrapassa o preço**, por construção: pior caso $29,30 contra $30,24 de receita. Não existe período de retorno nenhum a defender, porque não existe desembolso à cabeça. A margem no pior caso absoluto é que fica em $0,94, e aí as taxas do Stripe (~1,4% + 0,25€ em cartões europeus) comem-na por inteiro. Só acontece a quem esgotar os 200.000 chunks todos os meses seguidos; se algum dia incomodar, o ajuste é baixar a utilização justa do Ultra para 150.000, que não é visível na pricing page. Fica por confirmar a tarifa de disco do Supabase, o único número desta decisão que não sai do nosso código nem de uma página de pricing lida.

## Reindexação incremental substitui o clean slate
**Data:** 29-08-2026  
**Contexto:** revê a decisão de 14-05-2026. Ao dimensionar os planos, o clean slate revelou-se o que impedia qualquer tabela de preços de ser ao mesmo tempo generosa e sustentável: cada reindexação paga o repositório inteiro outra vez, mesmo que só um ficheiro tenha mudado. Com a regra óbvia de produto (indexações ~3x os repositórios ativos), o pior caso do plano de topo dava $72 de embeddings contra $42 de receita. Não havia escolha de números que resolvesse isso, porque o problema era aritmético, não de calibração.
**Decisão:** guardar um hash do conteúdo por ficheiro e, na reindexação, reembedar só os ficheiros cujo hash mudou, em vez de apagar tudo e voltar a inserir.
**Alternativas consideradas:** (a) manter o clean slate e apertar os limites até a conta fechar, que produz exatamente a tabela mesquinha que foi rejeitada. (b) Manter o clean slate e adiar o incremental para a Fase 6, que era a ordem do roadmap. Rejeitado porque a reindexação incremental não é uma otimização de custo, é o que torna a tabela de preços vendável: sem ela a linha "reindexação ilimitada" (a frase mais generosa da página, e a que custa quase nada a cumprir) é impossível de escrever.
**Consequências:** inverte a ordem de trabalho da Fase 5, o incremental entra antes do Stripe. O trabalho é contido: uma coluna de hash em `code_chunks` e o `indexer.py`; não toca no `retriever.py`, no `generator.py`, nem em nada do `apps/web`. Há uma interação a resolver que não é óbvia: a decisão de 14-05-2026 sobre erros a meio da indexação apoiava-se explicitamente no clean slate para limpar o estado parcial ("o clean slate trata de limpar o que ficou a meio"). Com incremental, uma indexação que rebenta a meio deixa chunks parciais que a tentativa seguinte já não varre por inteiro, por isso essa decisão precisa de ser revisitada em conjunto com esta implementação. A decisão de 14-05-2026 fica revista, não errada: o clean slate era a escolha certa enquanto indexar não custava dinheiro a ninguém.

## Limite de fluxo passa a chunks por mês, e sai da tabela de preços para os termos
**Data:** 29-08-2026  
**Contexto:** a decisão de 28-08 previa "indexações por mês" como uma das três quotas visíveis do plano, e rejeitou explicitamente uma quota de chunks porque o utilizador não consegue prever quantos chunks tem um repositório antes de tentar. Ao montar a tabela real, dois problemas com isso. Primeiro, três contadores numa pricing page leem-se como três formas de dizer não, e nenhum plano parece generoso por muito que se subam os números. Segundo, contar indexações trata um repo de 200 chunks como um de 20.000, quando um custa cem vezes o outro.
**Decisão:** o contador de indexações sai da tabela de preços e passa a rede de proteção contra abuso, denominada em **chunks indexados por mês** (5.000 no Free, 70.000 no Pro, 200.000 no Ultra), documentada nos termos de utilização e não na montra.
**Alternativas consideradas:** (a) mantê-lo como eixo visível do plano, que era o previsto em 28-08. Rejeitado pelo efeito na leitura da página. (b) Removê-lo de todo, agora que a reindexação incremental torna reindexar barato. Rejeitado porque reabre o buraco que a própria decisão de 28-08 identificou: apagar o repositório liberta a vaga e a ligação seguinte é uma indexação de raiz a preço cheio, portanto o ciclo apagar-e-ligar continua a custar dinheiro real mesmo com incremental.
**Consequências:** a objeção de imprevisibilidade de 28-08 continua correta, mas deixa de se aplicar: ela vale para um eixo de plano, onde a pessoa tem de conseguir escolher, e não para uma cláusula de utilização justa, que ninguém lê para decidir o que comprar. A mesma métrica que era má como montra é a certa como rede. Efeito lateral bem-vindo: o orçamento mensal de chunks passa a travar sozinho a acumulação de repositórios (encher 30 vagas de 10.000 chunks são 300.000, mais de quatro vezes o orçamento do Pro, logo demora uns quatro meses), o que é precisamente o que permite pôr números generosos de repositórios na tabela sem risco. Fica também identificada uma peça de produto que ainda não existe e que tornaria este número legível: contar os chunks de um repositório a partir da árvore do GitHub antes de gastar um único embedding, e mostrar "este repositório são 4.200 chunks, cabe no Pro" antes de a pessoa criar conta. O `github_client.py` e o `chunker.py` já têm tudo o que é preciso para o fazer a custo zero.

## Customer do Stripe criado no primeiro checkout, não no registo
**Data:** 29-08-2026  
**Contexto:** sub-etapa do Stripe. O `stripe_customer_id` é a chave que liga o nosso `user_id` ao mundo do Stripe, e é indispensável porque os webhooks chegam identificados por `customer` e não por email (que é mutável dos dois lados e pode nem coincidir, já que o utilizador pode pagar no checkout com um email diferente do da conta). Faltava decidir em que momento esse Customer nasce.
**Decisão:** nasce no primeiro checkout, não no registo. Quem nunca tentar subscrever nunca tem Customer nem linha em `subscriptions`, e ausência de linha significa plano `free`.
**Alternativas consideradas:** criar no registo, o que tinha a vantagem real de a linha em `subscriptions` existir sempre e todo o código a jusante poder assumi-la. Rejeitado porque punha uma chamada ao Stripe dentro do caminho do registo: com o Stripe lento ou em baixo, ou o registo falha, ou passa e fica um utilizador sem Customer, que é o mesmo problema outra vez mais o registo partido pelo caminho. Criar conta é a operação que menos pode falhar na app inteira, e cada serviço externo metido nesse caminho é uma forma nova de ela falhar.
**Consequências:** o custo da escolha é ter de lidar com a corrida do duplo clique, em que dois pedidos simultâneos não encontram linha e ambos decidem criar um Customer. O que resolve isso é a **chave de idempotência** do Stripe (`customer-<user_id>`): os dois pedidos recebem de volta o mesmo `cus_`, um insert ganha e o outro rebenta com erro de chave duplicada. Verificado contra a API real, duas chamadas com a mesma chave devolveram `cus_VA8SFoQtnRWYNo` nas duas. Sem isto ficaria um Customer órfão no Stripe que a nossa tabela não consegue guardar (o `user_id` é primary key), e um pagamento feito por esse órfão chegava no webhook com um `cus_` desconhecido: alguém pagava e não recebia acesso. Entre um erro alto e um erro calado, quer-se o alto. Como segunda rede, o `user_id` fica gravado em `metadata` no próprio Customer, para que um órfão, se algum dia aparecer, seja rastreável em vez de anónimo. Nota de processo: esta decisão chegou a ser implementada antes de ser tomada, e foi o Filipe a dar por isso.

## Cada quota é verificada onde o número existe
**Data:** 30-08-2026  
**Contexto:** última etapa da Fase 5, aplicar os limites que a tabela de planos já descrevia. As quatro quotas (`max_repos`, `max_messages_per_month`, `max_chunks_per_repo`, `max_chunks_per_month`) não podem ser verificadas todas no mesmo sítio: as duas primeiras lêem-se do Supabase com um `count` e são conhecidas antes de qualquer trabalho, as duas de chunks só existem depois de os ficheiros serem lidos e cortados, o que acontece dentro do `rag-service`.
**Decisão:** dividir a verificação pelo sítio onde o número existe. Repositórios e mensagens no `apps/web` (`lib/limits.ts`), antes de o `rag-service` ser chamado. Chunks por repo e chunks por mês no `rag-service` (`app/core/limits.py`), entre o chunking e o primeiro embedding.
**Alternativas consideradas:** (a) tudo no `rag-service`, com o `web` a ser burro e o serviço a ler `plans` e `subscriptions` com a service_role. Um único sítio de verdade, mas o utilizador que já esgotou as vagas só recebia a recusa depois de o `rag-service` ter listado a árvore inteira do GitHub. (b) Tudo no `web`, o que obrigava a contar a árvore e a chunkar em TypeScript antes de chamar o serviço, ou seja a ressuscitar o `chunker.ts` e o `github.ts` que a Fase 2 apagou de propósito.
**Consequências:** a assimetria não é um descuido de desenho, é o que o momento em que o número existe impõe. Repositórios e mensagens recusam com `402` síncrono e o utilizador vê a mensagem na hora. Chunks recusam obrigatoriamente **depois do `202`**, porque nessa altura já não há resposta HTTP aberta, e por isso chegam ao ecrã pela via normal das falhas de indexação: gravadas em `repos.index_error` e lidas pelo `GET /index/{repo_id}/status`. Detalhe do incremental que só se vê ao implementar: o teto por repositório tem de somar os chunks que já estão na base aos que vão ser criados, senão um repositório grande passava o limite às fatias, uma reindexação de cada vez. Confirmado com dados reais: o `polymarket-bot` tem 416 chunks guardados mas uma reindexação sem alterações só produz 0 novos.

## Uso contado ao ritmo dos embeddings, não no fim da indexação
**Data:** 30-08-2026  
**Contexto:** a primeira versão do contador de uso corria depois de a indexação estar completa. Um teste real expôs o problema: uma indexação do `polymarket-bot` morreu aos 75 chunks com um 429 do Gemini. Estado final: 75 embeddings pagos, 0 chunks guardados, e `usage_monthly.chunks` a zero.
**Decisão:** gravar o uso ao ritmo a que os embeddings acontecem (uma escrita por batch), e não uma vez no fim.
**Alternativas consideradas:** manter a contagem no fim, que é mais simples e mais generoso para o utilizador (uma indexação falhada não lhe custa orçamento nenhum). Rejeitado porque deixa de fora exatamente a parte que a métrica existe para medir.
**Consequências:** medir chunks **bem-sucedidos** não é a mesma coisa que medir chunks **pagos**, e é a segunda que corresponde à fatura. Com a contagem no fim, uma indexação que rebentasse repetidamente aos 95% era grátis à luz da quota e cara na conta do Gemini. O preço da mudança é a contagem ficar aproximada por defeito: o que foi embedado desde a última escrita perde-se, no máximo um batch. Erro pequeno e sempre no sentido de cobrar a menos, que é o lado certo para errar. Verificado depois da correção: a indexação que falhou deixou 75 contados, e a que passou somou os 416, dando 491.

## O 429 do Gemini era TPM e não RPM: limitador por tokens com janela deslizante
**Data:** 30-08-2026  
**Contexto:** revê a decisão de concorrência de 25-08-2026, que previa um rate limiter "por pedidos por janela de tempo" como resposta aos 429. O painel de quotas da Google mostrou que o diagnóstico estava errado: no momento da falha os pedidos estavam em **37 de 100 RPM** e os tokens em **39,6K de 30K TPM**. O eixo que rebentava nunca foi o número de pedidos.
**Decisão:** limitar por **tokens por minuto** (teto de 25.000, margem abaixo dos 30.000 reais), com **janela deslizante**, um único limitador partilhado por todo o processo, mais retry com espera quando um 429 aparecer na mesma. Em paralelo, passar as chamadas de embedding a **batch** (`batchEmbedContents`, 25 chunks por pedido).
**Alternativas consideradas:** (a) limitar por pedidos, que era o previsto em 25-08 e não resolvia nada, porque os pedidos estavam a um terço do teto. (b) Apertar os limites do plano até deixarem de provocar o 429, que foi a proposta do Filipe. Rejeitado por aritmética: com ~880ms por embedding e 5 em voo, o teto de tokens é ultrapassado por volta do centésimo chunk, portanto o `max_chunks_per_repo` teria de descer para ~100 e o plano Ultra, que promete 40.000 chunks por repositório, ficava impossível de servir. Não é um problema de calibração. (c) Janela fixa a reiniciar de minuto a minuto, que foi a primeira implementação e falhou no teste real aos 75 chunks: dois batches no fim de uma janela mais dois no início da seguinte dão o dobro do teto dentro de 60 segundos deslizantes. (d) Passar a chave paga, que resolve tudo e foi rejeitado por decisão de produto (manter o tier gratuito).
**Consequências:** o batching não acelera nada, porque quem trava são os tokens e o batch gasta os mesmos. Entra por outra razão: o tier gratuito tem **1.000 pedidos por dia**, e sem batch os 5.000 chunks/mês vendidos no plano Free eram 5.000 pedidos, ou seja o plano não era servível. Com batches de 25 passam a 200. Duas correções de factos que sustentavam decisões anteriores: os "~300ms por embedding" da decisão de 25-08 estão errados, o valor medido é **881ms de mediana**; e a estimativa de tokens passou de 4 para 3 caracteres por token, porque em código a proporção real é pior do que em texto e subestimar tokens é o mesmo que não ter limitador. O limitador ser partilhado pelo processo, e não por indexação, é o que o torna útil de todo: a quota é da chave da app, portanto com um limitador por indexação bastavam duas em simultâneo para o teto ser ultrapassado a dobrar. Fica identificada a limitação que só aparece no deploy: "por processo" só é igual a "pela app" enquanto houver um processo, e duas réplicas do `rag-service` no Railway são dois limitadores. Resolver isso a sério obriga a pôr o contador fora do processo. Custo aceite: com 25.000 tokens/min partilhados, cinco utilizadores a indexar ao mesmo tempo esperam cinco vezes mais. No tier gratuito não há forma de contornar isso, e lentidão é melhor do que erro.

## Recusa por quota não é falha de indexação
**Data:** 30-08-2026  
**Contexto:** ao testar as recusas, uma reindexação do `polymarket-bot` foi recusada por orçamento mensal e o repositório ficou com `index_stage = 'failed'`. Os 416 chunks continuavam todos na base e o chat funcionaria perfeitamente, mas o dashboard esconde o botão de conversar em repositórios falhados. Uma recusa por quota tinha transformado um repositório que funcionava num repositório que a interface dizia estar partido.
**Decisão:** uma recusa por quota num repositório que já tem chunks grava `index_stage = 'done'` com o motivo em `index_error`, e o dashboard mostra esse motivo numa linha à parte. Só marca `failed` se o repositório estiver vazio, porque aí não há nada a preservar.
**Alternativas consideradas:** deixar o dashboard abrir o chat de qualquer repositório que tenha chunks, independentemente do `index_stage`. Mais robusto, porque cobria também as falhas a meio que deixam índice parcial utilizável, mas menos honesto sobre o que aconteceu ao repositório.
**Consequências:** são dois tipos de acontecimento diferentes e estavam a ser tratados como um só. Uma indexação que rebenta a meio deixa o índice inconsistente e o `failed` é a descrição correta. Uma recusa por quota não toca no índice: ela acontece antes do primeiro embedding, por construção. Efeito lateral: o motivo da recusa não podia viver no ecrã de indexação, porque esse redireciona para o chat assim que o stage é `done`, e por isso passou a viver na linha do dashboard. Corrigido ao mesmo tempo um caso que o teste tornou óbvio: uma reindexação sem alterações produz 0 chunks, não gasta nada, e mesmo assim estava a ser recusada por falta de orçamento. Recusar uma operação de custo zero por falta de orçamento não faz sentido nenhum, e o cheque passou a ignorá-la.

## Um repositório falhado ocupa vaga no limite de repositórios
**Data:** 30-08-2026  
**Contexto:** o `_upsert_repo` cria a linha em `repos` logo no início do `POST /index`, antes do `202` e muito antes de se saber quantos chunks o repositório tem. Uma indexação que seja recusada ou que rebente deixa portanto uma linha criada, e o `countMyRepos` conta-a. Quem tentar ligar um repositório grande de mais fica com uma vaga ocupada por um repositório que nunca chegou a ter um único chunk.
**Decisão:** conta. O `countMyRepos` continua a contar todas as linhas de `repos`, sem filtrar por `index_stage`.
**Alternativas consideradas:** filtrar `index_stage != 'failed'`, com o argumento de que o limite de repositórios existe por causa do armazenamento dos vetores e um repositório falhado tem zero chunks guardados, logo custo zero. Era a opção que parecia mais justa, e foi rejeitada ao perceber que tem uma fuga: uma **reindexação** falhada deixa o repositório a `failed` mas com os chunks da indexação anterior todos na base. Com o filtro, esse repositório deixava de contar para a quota e continuava a ocupar armazenamento a sério, que é exatamente o que o limite existe para travar. A opção que parecia tapar o buraco era a que o abria.
**Consequências:** o argumento inicial (ocupa espaço na base de dados) não se aguenta, porque uma linha em `repos` sem vetores não custa nada. O que sustenta a decisão é não haver exceções para manter e a vaga libertar-se com um clique em Remove no dashboard. Nota de âmbito, depois da decisão de hoje sobre recusas: como uma recusa por quota já não marca `failed` num repositório com índice, o caso que sobra aqui é estreito, um repositório que nunca chegou a ser indexado. Fica identificada a melhoria de produto que o tornaria irrelevante e que já tinha sido apontada na decisão de 29-08: contar os chunks a partir da árvore do GitHub antes de criar a linha, e recusar aí. O `github_client.py` e o `chunker.py` já conseguem fazê-lo a custo zero.
