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

### Núcleo RAG em Python, camada de produto em TypeScript
**Data:** 26 07 2026  
**Contexto:** O RAG todo estava em TypeScript dentro do Next.js (`lib/chunker.ts`, `lib/gemini.ts`, `lib/github.ts`, `lib/indexer.ts`, `lib/retriever.ts`, `lib/generator.ts`), a par de 8 rotas `app/api/test-*` que eram diagnóstico manual — abria-se o browser e olhava-se para o JSON. Não havia testes automáticos e a lógica de domínio estava misturada com a camada web.  
**Decisão:** Separei o projeto em duas camadas. O núcleo de RAG passou para um serviço FastAPI em `rag-service/` (GitHub, chunking, embeddings, indexação, retrieval, geração). O Next.js ficou com a camada de produto — UI, rotas HTTP, validação de input e, mais à frente, auth e quotas — e passa a falar com o serviço através de `lib/rag-client.ts`, autenticado por um segredo partilhado. O comportamento do pipeline não mudou: mesmos modelos, mesmo chunking (2000/200), mesmas 768 dimensões, mesmo limite de 5 chamadas concorrentes.  
**Alternativas consideradas:** (1) Deixar tudo em TypeScript — funcionava, mas o RAG é território natural do Python e este projeto também serve para o mostrar. (2) Chamar Python a partir do Node por subprocesso — evitava o salto HTTP mas dava um acoplamento pior e um deploy mais estranho. (3) Passar tudo para Python, incluindo o front-end, com Streamlit ou Gradio — perdia a parte de SaaS, que é metade do ponto do projeto. (4) Adoptar LangChain ou LlamaIndex na migração — descartado de propósito: o valor está em ter o RAG construído de raiz, não em colar uma framework.  
**Consequências:** Passa a haver dois processos para correr em local e dois deploys para manter (Vercel + um host de contentores). Cada pergunta ganha um salto HTTP extra, irrelevante ao lado dos segundos que a Gemini demora. Em troca: as rotas `test-*` desapareceram e o pipeline passou a ter 56 testes com `pytest`, nenhum a tocar na rede, mais `ruff` e `mypy` em modo strict. A fronteira também ficou útil por si — o serviço não conhece utilizadores, e o Next.js deixou de ter acesso às chaves da Gemini, da GitHub e do Supabase. 