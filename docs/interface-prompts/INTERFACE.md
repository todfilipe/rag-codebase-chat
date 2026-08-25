# Interface — Prompts de Design (Stitch / geração por IA)

> Este documento existe para gerar mockups de UI com uma ferramenta de IA (Stitch, ou equivalente) — não é uma spec narrativa para ler, é um conjunto de prompts para colar diretamente. A versão anterior deste ficheiro era só descrição em prosa, o que dá resultados genéricos porque não ancora nada visualmente. Esta versão corrige isso: cada prompt é autocontido, escrito em inglês (é a língua em que estas ferramentas produzem melhor resultado — o vocabulário de design UI é maioritariamente treinado em inglês), e inclui sempre a paleta e o sistema de estilo completos, para que gerar um ecrã de cada vez não perca consistência entre eles.

## Direção visual (antes de usares os prompts)

**Vibe:** moderno, limpo, premium. Mais perto de uma developer tool (Linear, Vercel, o próprio GitHub) do que de um SaaS genérico de marketing — sem gradientes, sem ilustrações fofas, sem excesso de cor. A sensação de "premium" aqui vem de restrição e precisão (espaço branco generoso, hierarquia tipográfica, bordas finas), não de elementos decorativos.

**Paleta:** fiel ao Primer, o design system real do GitHub (valores confirmados em `primer.style/primitives/colors` e na documentação do tema dark do GitHub — não são uma aproximação):

| Token | Light | Dark |
|---|---|---|
| Fundo principal | `#ffffff` | `#0d1117` |
| Fundo secundário (sidebars, cards, code blocks) | `#f6f8fa` | `#161b22` |
| Borda | `#d1d9e0` | `#30363d` |
| Texto principal | `#1f2328` | `#e6edf3` |
| Texto secundário/muted | `#59636e` | `#8b949e` |
| Accent (links, foco, ações) | `#0969da` | `#2f81f7` |
| Sucesso / botão primário | `#1f883d` | `#3fb950` |
| Erro | `#d1242f` | `#f85149` |
| Aviso | `#9a6700` | — |

Sem cor nenhuma fora desta tabela. Sem roxo, laranja ou rosa em lado nenhum — é essa restrição que faz o produto parecer calmo em vez de brincalhão.

**Tipografia:** stack de sistema (a mesma família que o GitHub usa na sua própria UI: `-apple-system, "Segoe UI", sans-serif`), sem fontes decorativas. Código e caminhos de ficheiro sempre em monospace (`ui-monospace, "SF Mono", Consolas`).

**Elevação:** sem sombras pesadas. Separação por bordas de 1px e contraste subtil de fundo (branco vs. `#f6f8fa`), não por `box-shadow`. Se alguma sombra for mesmo necessária (ex: um dropdown), tem de ser quase impercetível.

**Raio de canto:** 6px em botões/inputs/cards, 8px em containers maiores. Nada em formato de pílula.

**Densidade:** confortável mas eficiente, mais perto da densidade de informação do próprio GitHub do que do espaçamento generoso típico de um dashboard SaaS de consumo — isto é uma ferramenta para uso prolongado, não uma landing page.

**Nota de iteração (01-08-2026):** a primeira versão do Prompt 1 (testada no Stitch e num segundo gerador) pedia uma página "vazia de propósito" — sem nav bar, sem textura de fundo, sem nada a acompanhar o formulário. O resultado pareceu amador, não minimalista: um formulário sozinho no meio de um ecrã em branco lê-se como protótipo por acabar, não como produto cuidado. A correção não é adicionar cor ou decoração — continua fora da paleta e sem gradientes vivos — é adicionar **estrutura e prova visual** com os mesmos elementos que produtos como o Linear ou o Vercel usam para parecer "premium" apesar de serem minimalistas:
- Uma barra de topo mínima (não uma nav de marketing completa, só o suficiente para o ecrã não parecer órfão).
- Uma textura de fundo muito subtil (glow radial na cor accent a opacidade baixíssima, ou um grid de pontos quase impercetível) em vez de uma cor sólida lisa.
- Uma pré-visualização do produto (um mockup pequeno do chat) abaixo do formulário, para mostrar o resultado em vez de só pedir o input.

Isto está já refletido no Prompt 1 abaixo.

## Como usar estes prompts

Cada prompt abaixo é um bloco de código autocontido — copia o bloco inteiro para o Stitch. Gera os ecrãs pela ordem em que estão aqui (o 1 estabelece a direção visual; os seguintes, dentro do mesmo projeto, tendem a herdar o estilo — mas cada um repete a paleta e o sistema de estilo explicitamente, para o caso de gerares cada ecrã como um projeto novo em vez de continuares o mesmo).

Regra de ouro ao iterar depois de um resultado gerado: **uma alteração major por prompt de refinamento** (ex: "torna a sidebar mais estreita" é um bom prompt de follow-up; "torna a sidebar mais estreita, muda a cor do botão e adiciona um ícone" não é — o Stitch tende a reconstruir o layout inteiro em vez de fazer só o que pediste quando combinas pedidos não relacionados).

---

### Prompt 1 — Landing / Connect Repository (estado vazio)

```
Design a single desktop web page (1440px canvas) for a developer tool called
"RAG Codebase Chat" — a product that lets a developer paste a public GitHub
repository URL and then ask natural-language questions about that codebase,
getting answers grounded in the actual code with file citations.

VISUAL DIRECTION
Modern, clean, premium developer-tool aesthetic — think Linear's marketing
site, Vercel's dashboard, or Raycast, not a generic consumer SaaS landing
page and not a bare wireframe either. Minimal does not mean empty: a page
with a lone form floating on a flat, textureless background reads as an
unfinished prototype. Premium minimalism comes from restraint in COLOR
(strict palette below, no gradients of arbitrary hues, no illustrations)
combined with deliberate STRUCTURE and DEPTH (a real top bar, subtle
background texture, a visual proof of the product) — restraint in one
dimension, richness in the other.

COLOR PALETTE — strictly limited to this list, dark mode (this screen uses
dark mode as the primary theme):
- Page background: #0d1117
- Secondary surface (cards, the top bar, the product preview panel): #161b22
- Border: #30363d, 1px hairline
- Primary text: #e6edf3
- Secondary/muted text: #8b949e
- Accent (links, focus ring, primary button, glow): #2f81f7
- Success state: #3fb950
Do not introduce any other hue anywhere on the page. No purple, orange, or
pink. The only saturated color allowed is the accent blue, used sparingly.

BACKGROUND TEXTURE (this is what makes the page feel designed, not empty)
- A large, soft radial gradient glow using the accent blue (#2f81f7) at
  very low opacity (roughly 10-15%), centered horizontally, positioned
  behind the hero heading, heavily blurred so it reads as ambient light
  rather than a visible shape — the same technique Linear and Vercel use
  on their dark marketing pages.
- Additionally, a very faint dot-grid pattern across the entire page
  background (small dots in the border color #30363d at ~5% opacity,
  spaced about 32px apart) for subtle texture at any zoom level.
- Both effects must stay extremely subtle — the page should still read as
  "mostly dark, mostly empty" at a glance, just not flat and lifeless.

TYPOGRAPHY
System UI font stack (SF Pro / Segoe UI / system-ui), bold weight for the
main heading with tight letter-spacing for a confident, engineered feel
(similar to how Linear sets its hero type). Monospace font for any code,
URL placeholder text, or repository name.

ELEVATION & SHAPE
No heavy drop shadows — separate elements with 1px borders and subtle
background contrast (#0d1117 vs #161b22) instead. Border radius: 6px on
inputs/buttons, 8px on larger containers/cards. No pill shapes except
small badges.

LAYOUT — top to bottom
1. A slim top bar (56px tall, bottom border #30363d, background matches
   page background — not elevated): on the left, a small geometric mark
   (a simple abstract icon, monospace-bracket-inspired or a stylized
   chat-bubble/code-bracket hybrid, in the accent blue) next to the
   wordmark "RAG Codebase Chat" in medium-weight primary text. On the far
   right, a single small icon-button: the GitHub mark (outline style,
   muted color, brightens to primary text on hover) linking to view the
   project's source — this is a developer tool, showing "view source" is
   expected and adds credibility, it is not marketing chrome.
2. A small centered badge/pill below the top bar, well above the heading:
   a rounded-rectangle outline (border #30363d, background #161b22,
   muted text, small accent-blue dot or icon on the left) reading
   "No LangChain — every layer built from scratch". This is a real,
   specific credibility signal, not generic marketing copy.
3. Centered hero heading, large (roughly 56-64px), bold, tight
   letter-spacing, primary text color: "Ask questions about any GitHub
   repository" — sitting directly in front of the soft blue glow.
4. One line of secondary/muted text below the heading, normal weight,
   explaining the product in a single sentence.
5. A centered input row (roughly 560px wide, 48px tall): text input with
   a small link/chain icon on the left, placeholder "https://github.com/
   owner/repo" in monospace muted text, dark surface background (#161b22),
   border #30363d, focus state shows an accent-blue border and a subtle
   accent-blue glow ring; a primary button directly to its right labeled
   "Analyze repository" with a small arrow icon, solid accent-blue
   background (#2f81f7), white text, slightly bolder on hover.
6. Directly below the input, small muted-color helper text: "Try it with"
   followed by "facebook/react" styled as a clickable monospace link in
   the accent color.
7. A generous gap below that, then a PRODUCT PREVIEW card (roughly 900px
   wide, centered): a browser-chrome-style container — rounded 8px card,
   border #30363d, background #161b22, with a thin header strip inside
   showing three small flat circular window-control dots in muted gray
   (not red/yellow/green, stay within the palette) and, centered in that
   header strip, the text "facebook/react" in monospace muted text like
   a browser address bar. Inside the card body, show a simplified,
   smaller-scale preview of the chat interface: a short user message
   bubble, a system response with two lines of text and a small dark code
   snippet block, and a compact "sources" list with 2 file badges on the
   right edge — all rendered at reduced visual weight (slightly smaller
   text, a touch of extra letter spacing) so it clearly reads as a
   preview/screenshot-like element, not the actual interactive screen.
   This card should have a very subtle soft shadow beneath it (the one
   exception to the no-shadow rule — barely visible, large soft blur, low
   opacity) to lift it off the page and imply depth.
8. Small centered muted footer text at the very bottom of the page:
   "Built by Filipe · open source on GitHub".

Generate this as a single high-fidelity screen, desktop viewport, dark
mode.
```

---

### Prompt 2 — Landing / Connect Repository (estado de indexação)

```
This is a state variant of the same "RAG Codebase Chat" landing page from
the previous screen — same product, same visual system, generate it as a
separate screen showing what happens after the user submits a repository
URL.

VISUAL DIRECTION AND PALETTE
Identical system to the previous screen: modern, clean, premium developer
tool aesthetic, dark mode, colors strictly limited to:
background #0d1117, secondary surface #161b22, border #30363d (1px),
primary text #e6edf3, muted text #8b949e, accent #2f81f7, success #3fb950.
Same subtle radial accent-blue glow behind the hero area and the same
faint dot-grid background texture as the previous screen — keep the two
screens visually continuous. System UI font, monospace for code/paths,
6px/8px radius, no heavy shadows except the one soft shadow described
below, no extra hues.

LAYOUT — top to bottom
1. The identical slim top bar from the previous screen (logo mark +
   wordmark on the left, GitHub icon link on the right).
2. In the same vertical position where the hero heading sat on the
   previous screen, replace it with a smaller muted-color label:
   "Analyzing" followed by "facebook/react" in monospace primary text.
3. Below that, a progress panel card (roughly 480px wide, centered,
   background #161b22, border #30363d, radius 8px, padding, the one
   subtle soft shadow beneath it for a touch of lift): a vertical list of
   5 progress steps, each on its own row with a status icon on the left
   (a filled accent-blue checkmark circle for completed steps, a small
   spinning/loading indicator in accent blue for the current step, an
   empty outline circle in muted gray for pending steps) and a label in
   primary text color to the right, steps connected by a thin vertical
   line on the left edge like a timeline/stepper:
   1. "Reading repository structure" — completed
   2. "Found 214 code files" — completed
   3. "Generating embeddings" — currently in progress, with a thin
      horizontal progress bar underneath this row specifically (accent
      blue fill on a #30363d track) and small muted text to the right
      showing "142 / 318 chunks"
   4. "Saving to index" — pending, muted/greyed out
   5. "Ready" — pending, muted/greyed out
   No spinner-only "loading" feeling — the numbers and named steps must
   read as real, specific progress, not a generic wait state.
4. Keep the same small muted footer text at the bottom as the previous
   screen, for continuity.

Generate this as a single high-fidelity screen, desktop viewport, same
canvas size, dark mode, visually continuous with the previous screen.
```

---

### Prompt 3 — Chat (estado vazio, mesmo repositório)

```
Design the main application screen of "RAG Codebase Chat", the chat
interface a user lands on right after a repository finishes indexing.
This is a two-column desktop web app layout (1440px canvas), empty
conversation state (no messages sent yet).

VISUAL DIRECTION AND PALETTE
Same system as the landing screens, and same dark theme (this is the
screen the user reaches right after the landing/indexing flow — it must
feel like the same product, not a theme switch). Colors strictly limited
to: background #0d1117, secondary surface #161b22, border #30363d
(1px hairline), primary text #e6edf3, muted text #8b949e, accent #2f81f7,
success #3fb950, error #f85149. System UI font for interface text,
monospace font for any file path or code. Radius 6px on small elements,
8px on larger containers. No heavy shadows — separate panels using a 1px
border and the background/surface contrast instead. No extra colors
beyond this list. No background glow/dot-grid texture on this screen —
that effect is reserved for the landing hero; this is a working screen,
it should read as calm and focused, not decorative.

LAYOUT
Two columns divided by a 1px vertical border:
- LEFT/MAIN column (roughly 70% width): the chat area.
  - A slim top bar (56px tall, bottom border #30363d, background matches
    page background) showing the repository name "facebook/react" in
    monospace primary text with a small muted GitHub icon to its left,
    and on the far right a small secondary/outline button labeled
    "Change repository" (border #30363d, muted text, brightens on hover)
  - Below the top bar, a large centered empty state in the middle of the
    remaining vertical space: a short heading "Ask anything about this
    codebase" in primary text, and below it three suggestion chips/pills
    stacked or in a row, each a bordered rounded rectangle (border
    #30363d, background #161b22, radius 6px, muted text, becomes
    accent-colored border on hover) with example questions: "How does
    authentication work?", "Where is the main entry point defined?",
    "Explain the folder structure"
  - Fixed at the bottom of this column, a message input bar: a rounded
    rectangle input (border #30363d, background #161b22, radius 8px) with
    placeholder text "Ask a question about this repository..." and a
    small accent-blue circular send button on its right edge
- RIGHT column (roughly 30% width, background #161b22, left border
  #30363d): the context/sources panel.
  - Small uppercase muted-color label at the top: "SOURCES"
  - Centered muted-text placeholder message below it: "Sources for your
    next question will appear here" — this panel is empty in this
    specific screen state, keep it visually quiet, not broken-looking

Generate this as a single high-fidelity screen, desktop viewport, dark
mode.
```

---

### Prompt 4 — Chat (conversa ativa, com streaming e fontes)

```
This is a state variant of the same "RAG Codebase Chat" application screen
from the previous prompt — same two-column layout, same visual system,
generate it showing an active conversation with one exchange already
complete and a response that has file citations.

VISUAL DIRECTION AND PALETTE
Identical system to the previous chat screen: dark mode, colors strictly
limited to background #0d1117, secondary surface #161b22, border #30363d
(1px), primary text #e6edf3, muted text #8b949e, accent #2f81f7, success
#3fb950, error #f85149. System UI font, monospace for code/paths, 6px/8px
radius, no heavy shadows, no extra hues.

LAYOUT — LEFT/MAIN column (same top bar and input bar as before)
Below the top bar, a scrollable message thread with generous vertical
spacing between messages:
- A user message, right-aligned, contained in a rounded rectangle bubble
  with background #161b22 (no border), primary text color, max width
  about 60% of the column: "How does authentication work in this repo?"
- Below it, a system response, left-aligned, NOT in a bubble — plain text
  on the page background, max width about 80% of the column, so it reads
  like a document rather than a chat bubble (this is deliberate, code and
  citations need room to breathe):
  - A short paragraph of explanatory text in primary text color
  - Followed by a code block: card with background #161b22 and #e6edf3
    monospace text — a touch lighter than the page background so it still
    reads as a distinct surface, like GitHub's own code syntax blocks —
    rounded 8px corners, thin border #30363d, a thin top bar inside the
    block showing the file path in muted monospace text and a small
    "copy" icon button on the right
  - Below the code block, another short paragraph continuing the
    explanation, ending with an inline citation reference styled as a
    small pill/badge with a file icon, monospace filename text, and the
    accent blue border color
- Message input bar fixed at the bottom, same as the empty state

LAYOUT — RIGHT column (sources panel, background #161b22)
- "SOURCES" label at top, same as before
- Below it, a vertical list of 3 source cards, each a rounded rectangle
  using the page background #0d1117 (so the cards stand apart from the
  #161b22 panel behind them), border #30363d, radius 6px, padding, small
  gap between cards:
  - Top row of the card: small file-type icon + file path in monospace
    primary text (e.g. "lib/auth.ts")
  - Below it, a small horizontal similarity bar (thin track in #30363d,
    filled portion in accent blue) with the percentage in small muted
    text next to it (e.g. "71% match")
  - Cards have a subtle hover state look (slightly accent-tinted border)
    to suggest they are clickable/expandable

Generate this as a single high-fidelity screen, desktop viewport, visually
consistent with the previous chat screen (same top bar, same column
proportions).
```

---

### Prompt 5 — Estados de erro (referência compacta)

```
Design three small inline UI components for the "RAG Codebase Chat"
product (not full screens — component-level mockups, shown side by side
or stacked on a single reference canvas), following the same visual
system: dark mode, colors limited to background #0d1117, secondary
surface #161b22, border #30363d, primary text #e6edf3, muted text
#8b949e, accent #2f81f7, error #f85149. System UI font, 6px radius, no
heavy shadows.

COMPONENT A — Invalid repository URL inline error
A text input (same style as the landing page input) in an error state:
red-tinted border (#f85149), and directly below it a small line of error
text in #f85149: "This doesn't look like a GitHub repository URL."

COMPONENT B — Repository not found / private banner
A horizontal banner/alert bar, full width, background #161b22 with a
subtle red-tinted overlay (a very low-opacity wash of #f85149 over the
surface color, not the solid color), red left border accent (3px), a
small warning icon in #f85149 on the left, and text in primary light
color: "This repository is private or doesn't exist. Only public
repositories are supported right now."

COMPONENT C — Mid-conversation generation error (chat message style)
A system message as it would appear inline in the chat thread (not a
bubble, matches the plain-text system message style), with a small
warning icon, muted-red text: "Something went wrong generating a
response." followed by a small secondary/outline button labeled
"Try again" with a border #30363d and accent-blue text on hover.

Keep all three visually calm and quiet — errors in this product should
read as informative, not alarming. No bright red fills, no aggressive
iconography.
```

---

## Contexto de produto (para quem for implementar depois de gerar o design)

O que os prompts acima descrevem já reflete estas decisões, tomadas em 01-08-2026 e também registadas em `decisions.md`:

- Sem persistência de histórico entre sessões no MVP — cada visita a um repositório é uma conversa nova.
- Só um repositório "ativo" de cada vez — sem tabs, trocar de repo volta ao ecrã de conectar.
- Perguntas sugeridas no estado vazio são estáticas, não geradas a partir do README.
- **Atualização (01-08-2026, revê a decisão anterior sobre modo escuro):** os prompts acima foram redesenhados para dark mode como tema primário — foi o que ficou testado e refinado no Stitch, e para uma developer tool o dark costuma ler como mais "premium" à primeira vista. Isto muda a recomendação anterior ("modo escuro fica para a Fase 6"): faz mais sentido implementar dark mode primeiro/como default na Fase 3, e tratar light mode como o tema alternativo a acrescentar depois, usando os valores já documentados na tabela de "Direção visual" no topo deste ficheiro. Esta mudança está também registada em `decisions.md`.

Componentes reutilizáveis a extrair do design gerado, para a implementação em React (Fase 3 do `ROADMAP.md`):

- **`SourceBadge`** — o cartão/badge de fonte citada (Prompt 4, coluna direita), usado também inline no texto da resposta.
- **`CodeBlock`** — o bloco de código escuro com cabeçalho de ficheiro e botão de copiar (Prompt 4).
- **`ProgressSteps`** — o stepper vertical de indexação (Prompt 2), reutilizável para uma futura reindexação a partir do dashboard (Fase 5).
- **`InlineError`** / **`AlertBanner`** / **`RetryableSystemMessage`** — os três componentes do Prompt 5.

Ligação ao pipeline real (para quem for implementar, ver `docs/API-CONTRACT.md` e `docs/LOGICA-DO-PROJETO.md` para os detalhes técnicos por trás de cada estado visual):

- Os 5 passos do Prompt 2 mapeiam diretamente aos stages devolvidos por `GET /index/{repo_id}/status`.
- O evento `sources` do stream SSE de `POST /query` chega antes dos `token` — por isso, no Prompt 4, o painel de fontes já não está vazio quando o texto da resposta ainda está a aparecer.
