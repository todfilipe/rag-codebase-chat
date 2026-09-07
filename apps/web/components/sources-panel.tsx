"use client";

import { useState } from "react";
import type { Source } from "@/lib/chat";
import { fileName } from "@/lib/chat";
import { buildGithubFileUrl, type ParsedRepoUrl } from "@/lib/github-url";
import { ChevronDown, ExternalLinkIcon, FileIcon } from "./icons";

// Mostra as fontes da última resposta. O evento `sources` do stream chega antes
// do primeiro token (o retrieval corre todo antes de a geração começar), por isso
// este painel enche-se enquanto o texto ainda está a escrever-se.
export function SourcesPanel({
  sources,
  repo,
}: {
  sources: Source[];
  repo: ParsedRepoUrl;
}) {
  return (
    <aside className="hidden w-[360px] shrink-0 flex-col overflow-y-auto border-l border-line bg-surface lg:flex">
      <p className="px-5 pt-5 pb-3 text-[11px] font-semibold tracking-widest text-muted uppercase">
        Sources
      </p>

      {sources.length === 0 ? (
        <p className="px-5 text-sm leading-6 text-muted">
          Sources for your next question will appear here.
        </p>
      ) : (
        <ul className="space-y-2 px-4 pb-5">
          {sources.map((source) => (
            <li key={source.file_path + source.start_offset}>
              <SourceCard source={source} repo={repo} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function SourceCard({ source, repo }: { source: Source; repo: ParsedRepoUrl }) {
  const [open, setOpen] = useState(false);
  const match = Math.round(source.similarity * 100);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-canvas transition-colors hover:border-accent/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full cursor-pointer p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <FileIcon className="size-3 shrink-0 text-muted" />
          <span className="truncate font-mono text-[12px] text-fg" title={source.file_path}>
            {fileName(source.file_path)}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-muted">
            {lineRange(source)}
          </span>
          <ChevronDown
            className={`size-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>

        {/* Ficheiros na raiz do repo repetiam o nome duas vezes seguidas. */}
        {source.file_path.includes("/") && (
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
            {source.file_path}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${match}%` }}
            />
          </div>
          <span className="text-[11px] text-muted">{match}% match</span>
        </div>
      </button>

      {open && (
        <>
          {/* O excerto vai cru, como foi indexado. O chunking corta a cada 2000
              caracteres e não em fronteiras de linha, por isso a primeira e a
              última linha aparecem quase sempre a meio — mostrar isso é mais
              honesto do que aparar as pontas e fingir um bloco certinho. */}
          <pre className="max-h-64 overflow-auto border-t border-line px-3 py-2.5 font-mono text-[11.5px] leading-5 text-fg/85">
            <code>{source.content}</code>
          </pre>

          <div className="flex items-center justify-between border-t border-line px-3 py-2">
            <span className="font-mono text-[11px] text-muted">
              {source.start_line === null
                ? "reindex for line links"
                : `${source.end_offset - source.start_offset} chars`}
            </span>
            <a
              href={buildGithubFileUrl(
                repo,
                source.file_path,
                source.start_line,
                source.end_line
              )}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-accent"
            >
              Open on GitHub
              <ExternalLinkIcon className="size-3" />
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// Repos indexados antes da migration 0003 não têm linhas gravadas; aí o cartão
// mostra os offsets em caracteres, que é a única posição que se conhece.
function lineRange({ start_line, end_line, start_offset }: Source): string {
  if (start_line === null) return `@${start_offset}`;
  return `L${start_line}-L${end_line ?? start_line}`;
}
