import { NextResponse, type NextRequest } from "next/server";
import { siteUrl } from "@/lib/site-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Aqui é onde o GitHub OAuth acaba. O Supabase não nos devolve a sessão, devolve
// um `code` de uso único que só vale trocado por quem consegue escrever cookies —
// ou seja, um Route Handler. Um Server Component não servia: quando ele corre, o
// HTML já começou a sair e os cookies já não podem ser postos.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");

  // `next` vem do URL, logo é input do utilizador. Sem esta guarda, um
  // ?next=//outro-site tornava a nossa página de login num redirecionador para
  // qualquer lado — o clássico open redirect, e ainda por cima num sítio onde a
  // vítima acabou de escrever a password.
  const requestedNext = searchParams.get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

  if (!code) {
    // Sem code é porque o utilizador carregou em Cancel no ecrã do GitHub.
    return NextResponse.redirect(`${siteUrl}/login`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${siteUrl}/login?error=oauth_failed`);
  }

  return NextResponse.redirect(`${siteUrl}${next}`);
}
