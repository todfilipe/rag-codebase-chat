"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeRepo } from "@/app/dashboard/actions";
import { NETWORK_ERROR, errorMessage } from "@/lib/error-copy";
import type { ServiceError } from "@/lib/index-status";
import type { IndexedRepo } from "@/lib/repos";

type RowState =
  | { status: "idle" }
  | { status: "confirming" }
  | { status: "reindexing" }
  | { status: "failed"; message: string };

const STAGE_DOT: Record<string, string> = {
  done: "bg-success",
  failed: "bg-danger",
};

export function RepoRow({
  repo,
  lastIndexed,
}: {
  repo: IndexedRepo;
  lastIndexed: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<RowState>({ status: "idle" });
  const [removing, startRemoving] = useTransition();

  const indexed = repo.index_stage === "done";
  const busy = state.status === "reindexing" || removing;

  async function reindex() {
    setState({ status: "reindexing" });

    try {
      const response = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repo.url }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setState({
          status: "failed",
          message: errorMessage(payload as ServiceError),
        });
        return;
      }

      router.push(`/repo/${payload.repo_id}`);
    } catch {
      setState({ status: "failed", message: NETWORK_ERROR });
    }
  }

  function remove() {
    startRemoving(async () => {
      const failure = await removeRepo(repo.id);

      if (failure) {
        setState({ status: "failed", message: failure });
        return;
      }

      setState({ status: "idle" });
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
      <div className="min-w-0 flex-1">
        <Link
          href={indexed ? `/repo/${repo.id}/chat` : `/repo/${repo.id}`}
          className="flex items-center gap-2.5 font-mono text-sm transition-colors hover:text-accent"
        >
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${
              STAGE_DOT[repo.index_stage] ?? "bg-accent"
            }`}
          />
          <span className="truncate">
            {repo.owner}/{repo.repo}
          </span>
        </Link>

        <p className="mt-1.5 pl-4 text-xs text-muted">
          {repo.index_stage === "failed"
            ? "Indexing didn't finish — reindexing starts it over"
            : indexed
              ? `Indexed ${lastIndexed}`
              : "Indexing in progress"}
        </p>
      </div>

      {state.status === "confirming" ? (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted">Remove this repository and its index?</span>
          <button
            type="button"
            onClick={remove}
            disabled={removing}
            className="rounded-md border border-danger/40 px-2.5 py-1.5 text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
          <button
            type="button"
            onClick={() => setState({ status: "idle" })}
            className="text-muted transition-colors hover:text-fg"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          {indexed ? (
            <Link
              href={`/repo/${repo.id}/chat`}
              className="rounded-md border border-accent/40 px-2.5 py-1.5 text-accent transition-colors hover:bg-accent/10"
            >
              Open chat
            </Link>
          ) : (
            repo.index_stage !== "failed" && (
              <Link
                href={`/repo/${repo.id}`}
                className="rounded-md border border-line px-2.5 py-1.5 text-fg transition-colors hover:border-accent hover:text-accent"
              >
                View progress
              </Link>
            )
          )}
          <button
            type="button"
            onClick={reindex}
            disabled={busy}
            className="rounded-md border border-line px-2.5 py-1.5 text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {state.status === "reindexing" ? "Starting…" : "Reindex"}
          </button>
          <button
            type="button"
            onClick={() => setState({ status: "confirming" })}
            disabled={busy}
            className="rounded-md border border-line px-2.5 py-1.5 text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
          >
            Remove
          </button>
        </div>
      )}

      {indexed && repo.index_error && (
        <p className="w-full pl-4 text-xs text-muted">
          Last reindex was refused: {errorMessage(repo.index_error)}
        </p>
      )}

      {state.status === "failed" && (
        <p className="w-full pl-4 text-xs text-danger">{state.message}</p>
      )}
    </li>
  );
}
