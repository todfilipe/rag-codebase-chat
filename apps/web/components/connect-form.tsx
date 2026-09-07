"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ERROR_COPY, NETWORK_ERROR, errorMessage } from "@/lib/error-copy";
import { parseGithubRepoUrl } from "@/lib/github-url";
import type { ServiceError } from "@/lib/index-status";
import { ArrowRight, LinkIcon } from "./icons";

const EXAMPLE_REPO = "https://github.com/facebook/react";

// Um estado só, em vez de isLoading + error soltos: assim não existe forma de
// representar "a submeter e com erro ao mesmo tempo".
type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "failed"; message: string };

export function ConnectForm() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const hasError = state.status === "failed";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!parseGithubRepoUrl(repoUrl)) {
      setState({ status: "failed", message: ERROR_COPY.invalid_repo_url });
      return;
    }

    setState({ status: "submitting" });

    try {
      const response = await fetch("/api/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setState({
          status: "failed",
          message: errorMessage(payload as ServiceError),
        });
        return;
      }

      // O 202 já traz o repo_id. A indexação a sério continua no rag-service, e
      // o ecrã seguinte volta a encontrá-la só a partir deste id no URL — é isso
      // que faz um refresh (ou um separador novo) não perder o trabalho.
      router.push(`/repo/${payload.repo_id}`);
    } catch {
      setState({ status: "failed", message: NETWORK_ERROR });
    }
  }

  return (
    <div className="w-full max-w-[560px]">
      <form
        onSubmit={handleSubmit}
        className={`flex items-center gap-2 rounded-lg border bg-surface p-1.5 shadow-[0_0_40px_-12px_rgb(47_129_247/0.35)] transition-colors ${
          hasError ? "border-danger" : "border-line focus-within:border-accent"
        }`}
      >
        <LinkIcon className="ml-2.5 size-[18px] shrink-0 text-muted" />

        <input
          value={repoUrl}
          onChange={(event) => {
            setRepoUrl(event.target.value);
            if (hasError) setState({ status: "idle" });
          }}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo"
          aria-label="GitHub repository URL"
          aria-invalid={hasError}
          className="h-10 w-full min-w-0 bg-transparent font-mono text-sm text-fg outline-none placeholder:text-muted"
        />

        <button
          type="submit"
          disabled={state.status === "submitting"}
          className="flex h-10 shrink-0 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {state.status === "submitting" ? "Analyzing…" : "Analyze repository"}
          <ArrowRight className="size-4" />
        </button>
      </form>

      <div className="mt-3 min-h-5 text-center text-xs">
        {hasError ? (
          <p className="text-danger">{state.message}</p>
        ) : (
          <p className="text-muted">
            Try it with{" "}
            <button
              type="button"
              onClick={() => setRepoUrl(EXAMPLE_REPO)}
              className="font-mono text-accent hover:underline"
            >
              facebook/react
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
