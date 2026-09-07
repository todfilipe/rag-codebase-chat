"use client";

import { useState } from "react";
import { CopyIcon } from "./icons";

// Render de markdown escrito à mão em vez de react-markdown. Com a system
// instruction que temos, o Gemini responde em parágrafos, `código inline`,
// **negrito** e blocos com fences — quatro casos, ~50 linhas. Tabelas, headings
// e links aparecem como texto cru; se algum dia forem comuns nas respostas, é
// aqui (e só aqui) que se troca por uma dependência a sério.

type AnswerBlock =
  | { kind: "text"; text: string }
  | { kind: "code"; language: string; code: string };

function splitBlocks(answer: string): AnswerBlock[] {
  // Cortar por ``` deixa os segmentos a alternar: pares são texto, ímpares são
  // código. Durante o streaming a última fence está quase sempre por fechar, e
  // isto trata desse caso sozinho — o segmento ímpar final vira bloco de código
  // logo, que é o que se quer ver a aparecer linha a linha.
  return answer.split("```").flatMap((segment, index): AnswerBlock[] => {
    if (index % 2 === 0) {
      return segment.trim() ? [{ kind: "text", text: segment }] : [];
    }

    const firstBreak = segment.indexOf("\n");
    return [
      {
        kind: "code",
        language: firstBreak === -1 ? "" : segment.slice(0, firstBreak).trim(),
        code: (firstBreak === -1 ? segment : segment.slice(firstBreak + 1)).replace(
          /\n$/,
          ""
        ),
      },
    ];
  });
}

const INLINE_MARKUP = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

// Os bullets têm de sair antes do split inline, senão o "*" que abre a linha ia
// emparelhar com o itálico seguinte e comer o texto pelo meio. O [^*\n] no
// itálico é a outra metade da proteção: um asterisco solto nunca atravessa
// linhas.
function bulletsToDots(paragraph: string): string {
  return paragraph.replace(/^[ \t]*\*[ \t]+/gm, "• ");
}

function renderInline(text: string) {
  return bulletsToDots(text)
    .split(INLINE_MARKUP)
    .map((part, index) => {
      if (part.startsWith("`")) {
        return (
          <code
            key={index}
            className="rounded border border-line bg-canvas px-1 py-0.5 font-mono text-[12.5px] text-accent"
          >
            {part.slice(1, -1)}
          </code>
        );
      }

      // O ** tem de ser testado antes do *, senão o negrito entrava aqui como
      // itálico com asteriscos a mais.
      if (part.startsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-fg">
            {part.slice(2, -2)}
          </strong>
        );
      }

      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }

      return part;
    });
}

export function AnswerBody({ answer }: { answer: string }) {
  return (
    <div className="space-y-4">
      {splitBlocks(answer).map((block, index) =>
        block.kind === "code" ? (
          <CodeBlock key={index} language={block.language} code={block.code} />
        ) : (
          // whitespace-pre-wrap em vez de um parser de listas: as linhas com "-"
          // ou "1." que o Gemini escreve mantêm-se onde estavam.
          <div key={index} className="space-y-3">
            {block.text
              .split(/\n{2,}/)
              .filter((paragraph) => paragraph.trim())
              .map((paragraph, paragraphIndex) => (
                <p
                  key={paragraphIndex}
                  className="text-[14.5px] leading-7 whitespace-pre-wrap text-fg/90"
                >
                  {renderInline(paragraph.trim())}
                </p>
              ))}
          </div>
        )
      )}
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <span className="font-mono text-[11px] text-muted">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-fg"
        >
          <CopyIcon className="size-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-6 text-fg">
        <code>{code}</code>
      </pre>
    </div>
  );
}
