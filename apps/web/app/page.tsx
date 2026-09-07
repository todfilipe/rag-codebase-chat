import { ConnectForm } from "@/components/connect-form";
import { ProductPreview } from "@/components/product-preview";
import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";

// Server Component. Só o <ConnectForm /> é que precisa de correr no browser —
// o resto desta página nunca chega ao bundle de JavaScript.
export default function LandingPage() {
  return (
    <>
      <TopBar />

      <main className="hero-backdrop flex flex-1 flex-col items-center px-6 pt-28 pb-32">
        <span className="flex items-center gap-2 rounded-md border border-line bg-surface px-3.5 py-1.5 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          No LangChain — every layer built from scratch
        </span>

        <h1 className="mt-10 max-w-[820px] text-center text-[52px] leading-[1.06] font-bold tracking-[-0.03em] text-balance sm:text-[64px]">
          Ask questions about any GitHub repository
        </h1>

        <p className="mt-7 max-w-[640px] text-center text-[15px] leading-7 text-muted text-balance">
          Instant semantic search and code reasoning for your entire codebase.
          Answers grounded in the actual files, with citations you can check.
        </p>

        <div className="mt-10 flex w-full justify-center">
          <ConnectForm />
        </div>

        <div className="mt-32 flex w-full justify-center">
          <ProductPreview />
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
