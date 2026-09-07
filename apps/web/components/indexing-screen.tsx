"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { NETWORK_ERROR, errorDetail, errorMessage } from "@/lib/error-copy";
import { buildGithubRepoUrl } from "@/lib/github-url";
import {
  isTerminalStage,
  progressSignature,
  type IndexStatus,
  type ServiceError,
} from "@/lib/index-status";
import { AlertBanner } from "./alert-banner";
import { ProgressSteps } from "./progress-steps";

// A indexação corre em background no rag-service e o progresso vive na tabela
// `repos`. Por isso o ecrã não precisa de um segundo stream SSE: chega um GET de
// dois em dois segundos a ler a linha. E, ao contrário de um stream, isto
// sobrevive a um refresh sem nada especial.
const POLL_INTERVAL_MS = 2000;

// Ao fim de quanto tempo sem o payload mudar é que vale a pena dizer alguma
// coisa. Não é um timeout e o polling não pára: o rag-service não retoma
// indexações interrompidas (API-CONTRACT.md), por isso um processo que morra a
// meio deixa o stage congelado para sempre e o ecrã ficava a rodar o spinner
// eternamente. Dois minutos porque `listing_files` e `reading_files` não gravam
// progresso numérico nenhum e num repo grande ficam legitimamente calados muito
// tempo (o facebook/react tinha 6914 ficheiros para listar).
const STALE_AFTER_MS = 120_000;

type ScreenState =
  | { status: "loading" }
  | { status: "tracking"; index: IndexStatus; stale: boolean }
  | { status: "unavailable"; message: string };

export function IndexingScreen({ repoId }: { repoId: string }) {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>({ status: "loading" });
  // Incrementar isto volta a arrancar o efeito de polling depois de uma
  // reindexação, sem ter de sair e voltar à página.
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  // Levantado enquanto uma reindexação está a ser pedida. Sem isto, o ciclo de
  // polling que já estava a correr voltava a escrever o estado por cima do erro
  // do POST e o ecrã continuava a mostrar o progresso antigo como se nada
  // tivesse acontecido.
  const pausedRef = useRef(false);

  useEffect(() => {
    // setTimeout encadeado em vez de setInterval: se uma resposta demorar mais
    // do que o intervalo, os pedidos empilhavam-se em cima uns dos outros.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    // Vivem no closure do efeito, e não em estado, porque só o ciclo de polling
    // as lê: pô-las em useState só provocava renders sem nada de novo para
    // mostrar.
    let lastSignature = "";
    let changedAt = Date.now();

    async function poll() {
      try {
        const response = await fetch(`/api/index/${repoId}/status`);
        const payload = await response.json();
        // pausedRef é lido depois do await, e não antes: o pedido pode ter
        // partido antes do clique em "Try again" e chegado depois dele.
        if (cancelled || pausedRef.current) return;

        if (!response.ok) {
          setState({
            status: "unavailable",
            message:
              (payload as ServiceError).error === "repo_not_found"
                ? "There is no indexing job at this address."
                : errorMessage(payload as ServiceError),
          });
          return;
        }

        const index = payload as IndexStatus;
        const signature = progressSignature(index);
        if (signature !== lastSignature) {
          lastSignature = signature;
          changedAt = Date.now();
        }
        const stale = Date.now() - changedAt >= STALE_AFTER_MS;

        setState((current) =>
          // Sem esta comparação o setState corria de dois em dois segundos com
          // um objeto novo e re-renderizava o stepper inteiro para desenhar
          // exatamente o mesmo.
          current.status === "tracking" &&
          current.stale === stale &&
          progressSignature(current.index) === signature
            ? current
            : { status: "tracking", index, stale }
        );

        // replace e não push: o passo de indexação não é sítio para onde voltar
        // com o botão de trás depois de o repo já estar pronto.
        if (index.stage === "done") {
          router.replace(`/repo/${repoId}/chat`);
          return;
        }

        if (isTerminalStage(index.stage)) return;
      } catch {
        if (cancelled) return;
        setState({
          status: "unavailable",
          message:
            "Lost connection to the server while tracking this indexing job.",
        });
        return;
      }

      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [repoId, router, attempt]);

  // O upsert do repo é por (owner, repo), portanto reindexar devolve o mesmo
  // repo_id e este URL continua a servir. O clean-slate do indexer é que trata
  // dos chunks que a tentativa anterior deixou a meio.
  const retry = useCallback(async (owner: string, repo: string) => {
    pausedRef.current = true;
    setRetrying(true);

    try {
      const response = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: buildGithubRepoUrl({ owner, repo }) }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setState({
          status: "unavailable",
          message: errorMessage(payload as ServiceError),
        });
        return;
      }

      // Só aqui é que o polling volta a poder escrever: a partir deste ponto há
      // uma indexação nova a que vale a pena ir buscar o progresso.
      pausedRef.current = false;
      setState({ status: "loading" });
      setAttempt((count) => count + 1);
    } catch {
      setState({ status: "unavailable", message: NETWORK_ERROR });
    } finally {
      setRetrying(false);
    }
  }, []);

  if (state.status === "loading") {
    return <p className="text-sm text-muted">Looking for this indexing job…</p>;
  }

  if (state.status === "unavailable") {
    return (
      <div className="w-full max-w-lg space-y-4">
        <AlertBanner title="Indexing unavailable" message={state.message} />
        <ConnectAnotherLink />
      </div>
    );
  }

  const { index, stale } = state;
  const failed = index.stage === "failed";

  return (
    <div className="flex w-full max-w-lg flex-col items-center">
      <p className="text-xs font-semibold tracking-widest text-muted uppercase">
        {index.stage === "done" ? "Ready" : failed ? "Failed" : "Analyzing"}
      </p>
      <h1 className="mt-2 font-mono text-3xl text-accent">
        {index.owner}/{index.repo}
      </h1>

      <div className="mt-10 w-full rounded-lg border border-line bg-surface p-6">
        <ProgressSteps status={index} />
      </div>

      {failed && index.error && (
        <div className="mt-6 w-full space-y-4">
          <AlertBanner
            title="Indexing didn't finish"
            message={errorMessage(index.error)}
            detail={errorDetail(index.error)}
          />
          <Actions
            index={index}
            retrying={retrying}
            onRetry={retry}
            retryLabel="Try again"
          />
        </div>
      )}

      {/* Parado, mas não falhado: o servidor pode estar a trabalhar em silêncio
          ou pode ter morrido, e daqui não há como distinguir os dois. Por isso a
          redação diz o que se sabe (nada mudou há algum tempo) em vez de
          declarar uma falha que pode não existir. */}
      {!failed && stale && (
        <div className="mt-6 w-full space-y-4">
          <div className="rounded-md border border-line bg-surface px-4 py-3">
            <p className="text-sm text-fg">This hasn’t moved in a while</p>
            <p className="mt-1 text-sm text-muted">
              Indexing may still be running on a large repository, or the
              service may have stopped. Nothing is lost either way: starting
              over re-indexes this repository from scratch.
            </p>
          </div>
          <Actions
            index={index}
            retrying={retrying}
            onRetry={retry}
            retryLabel="Start over"
          />
        </div>
      )}

      {index.stage === "done" ? (
        // Estado de passagem: o efeito já mandou o router para o chat, isto é só
        // o que se vê no intervalo até a rota trocar.
        <p className="mt-6 text-sm text-muted">
          Repository indexed. Opening the chat…
        </p>
      ) : (
        !failed &&
        !stale && (
          <p className="mt-6 max-w-sm text-center text-sm text-muted">
            You can close this page: indexing keeps running on the server, and
            this address will pick the progress back up.
          </p>
        )
      )}
    </div>
  );
}

function Actions({
  index,
  retrying,
  retryLabel,
  onRetry,
}: {
  index: IndexStatus;
  retrying: boolean;
  retryLabel: string;
  onRetry: (owner: string, repo: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        disabled={retrying}
        onClick={() => onRetry(index.owner, index.repo)}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {retrying ? "Starting…" : retryLabel}
      </button>
      <ConnectAnotherLink />
    </div>
  );
}

function ConnectAnotherLink() {
  return (
    <Link href="/" className="text-sm text-accent hover:underline">
      ← Connect another repository
    </Link>
  );
}
