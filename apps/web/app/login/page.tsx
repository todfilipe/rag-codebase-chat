import { redirect } from "next/navigation";
import { AlertBanner } from "@/components/alert-banner";
import { LoginForm } from "@/components/login-form";
import { SiteFooter } from "@/components/site-footer";
import { TopBar } from "@/components/top-bar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  // Quem já tem sessão não tem nada que fazer aqui. O ?next é o sítio para onde
  // o proxy.ts o estava a mandar quando o interrompeu.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next?.startsWith("/") ? next : "/");
  }

  return (
    <>
      <TopBar />

      <main className="hero-backdrop flex flex-1 flex-col items-center px-6 pt-24 pb-32">
        {error === "oauth_failed" && (
          <div className="mb-6 w-full max-w-[400px]">
            <AlertBanner
              title="GitHub sign-in didn't complete"
              message="Try again, or sign in with your email and password."
            />
          </div>
        )}

        <LoginForm next={next?.startsWith("/") ? next : "/"} />
      </main>

      <SiteFooter />
    </>
  );
}
