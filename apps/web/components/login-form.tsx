"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { GithubMark } from "./icons";

type Mode = "signin" | "signup";

// Mesmo padrão do ConnectForm: um estado só, para não existir forma de
// representar "a submeter e com erro ao mesmo tempo".
type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "failed"; message: string }
  | { status: "check_email" };

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const busy = state.status === "submitting";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setState({ status: "submitting" });

    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        setState({ status: "failed", message: error.message });
        return;
      }

      // Com a confirmação de email ligada no Supabase, o signUp devolve
      // utilizador mas não devolve sessão. Não é erro: é o email por abrir.
      if (!data.session) {
        setState({ status: "check_email" });
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setState({ status: "failed", message: error.message });
        return;
      }
    }

    // O router.refresh() é o que faz o servidor voltar a correr agora que o
    // cookie de sessão existe. Sem ele, a TopBar continuava a dizer "Sign in".
    router.push(next);
    router.refresh();
  }

  async function handleGithub() {
    setState({ status: "submitting" });

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        // Scope mínimo: só o email, que é o que o Supabase precisa para criar a
        // identidade. Sem `repo` de propósito — este login é um portão de
        // entrada, não uma permissão sobre os repositórios de ninguém.
        scopes: "user:email",
      },
    });

    if (error) {
      setState({ status: "failed", message: error.message });
    }
    // Sem else: em caso de sucesso o browser já vai a caminho do GitHub.
  }

  if (state.status === "check_email") {
    return (
      <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          We sent a confirmation link to{" "}
          <span className="font-mono text-fg">{email}</span>. Open it to finish
          creating your account.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[400px] rounded-xl border border-line bg-surface p-8 shadow-[0_0_40px_-12px_rgb(248_167_29/0.25)]">
      <Image
        src="/logo.png"
        alt=""
        width={44}
        height={44}
        className="mx-auto mb-4"
      />
      <h1 className="text-center text-xl font-semibold tracking-tight">
        {mode === "signin" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted">
        Connect a repository and start asking questions.
      </p>

      <button
        type="button"
        onClick={handleGithub}
        disabled={busy}
        className="mt-7 flex h-10 w-full items-center justify-center gap-2.5 rounded-md border border-line bg-canvas text-sm font-medium transition-colors hover:border-muted disabled:opacity-60"
      >
        <GithubMark className="size-[18px]" />
        Continue with GitHub
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email"
          className="h-10 rounded-md border border-line bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />

        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder="Password"
          aria-label="Password"
          className="h-10 rounded-md border border-line bg-canvas px-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />

        <button
          type="submit"
          disabled={busy}
          className="mt-1 h-10 rounded-md bg-accent text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="mt-4 min-h-5 text-center text-xs">
        {state.status === "failed" && (
          <p className="text-danger">{state.message}</p>
        )}
      </div>

      <p className="mt-2 text-center text-sm text-muted">
        {mode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setState({ status: "idle" });
          }}
          className="text-accent hover:underline"
        >
          {mode === "signin" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
