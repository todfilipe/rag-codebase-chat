import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GithubMark } from "./icons";

const SOURCE_URL = "https://github.com/missmundofilipe/rag-codebase-chat";

// Docs/Pricing/Changelog estão no mockup e ainda não têm página por trás. Ficam
// como texto, não como <a href="#">: um link que não vai a lado nenhum é pior do
// que um rótulo.
const NAV_ITEMS = ["Docs", "Changelog"];

export async function TopBar() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="h-14 shrink-0 border-b border-line">
      <div className="mx-auto flex h-full max-w-[1200px] items-center px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-7 items-center justify-center rounded-md bg-accent font-mono text-[13px] font-bold text-white"
          >
            {"{}"}
          </span>
          <span className="text-[15px] font-semibold tracking-tight">
            RAG Codebase Chat
          </span>
        </Link>

        <nav className="ml-10 hidden gap-7 text-sm text-muted md:flex">
          {user && (
            <Link href="/dashboard" className="transition-colors hover:text-fg">
              Dashboard
            </Link>
          )}
          <Link href="/pricing" className="transition-colors hover:text-fg">
            Pricing
          </Link>
          {NAV_ITEMS.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source on GitHub"
            className="text-muted transition-colors hover:text-fg"
          >
            <GithubMark className="size-[18px]" />
          </a>
          {user ? (
            <>
              <span className="hidden text-sm text-muted sm:inline">
                {user.email}
              </span>
              {/* Um <form> em vez de um botão com onClick: assim a TopBar
                  continua a ser Server Component e não arrasta React para o
                  bundle de todas as páginas por causa de um logout. */}
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-line bg-surface px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-muted"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-line bg-surface px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-muted"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
