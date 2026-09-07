import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

// Em Next 16 este ficheiro chama-se proxy.ts e exporta `proxy` — o middleware.ts de
// que a documentação do Supabase fala continua a funcionar, mas já avisa que está
// deprecado. Mesma função, nome novo.

// Só a landing, o login e os preços são públicos: sem sessão não se indexa nem se
// pergunta nada. O /auth entra aqui porque o GitHub devolve o utilizador ao callback
// antes de haver sessão; um redirect para /login a meio disso matava o login em
// silêncio. O /pricing é público porque é a montra: quem ainda não tem conta tem de
// poder ver os planos. Quem protege o checkout é a própria Server Action.
const PUBLIC_ROUTES = ["/", "/login", "/auth", "/pricing", "/api/stripe/webhook"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export async function proxy(request: NextRequest) {
  // Esta resposta é o que leva os cookies renovados de volta ao browser, por isso o
  // setAll abaixo reconstrói-a em vez de criar uma à parte. Devolver outra qualquer
  // no fim deitava fora o token novo, e o utilizador era expulso quando o antigo
  // expirasse (~1h depois do login, que é quando ninguém está a olhar).
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(refreshedCookies) {
        for (const { name, value } of refreshedCookies) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of refreshedCookies) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() e não getSession(): o getSession lê o cookie e acredita nele, o getUser
  // manda o JWT ao Supabase para ser validado. Um cookie é dado enviado pelo cliente.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    // Os /api respondem 401 em JSON, no mesmo shape {error, message} do resto do
    // contrato: quem lhes bate é o fetch do frontend, e devolver-lhe o HTML da página
    // de login com status 200 era pior do que um erro.
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "not_authenticated", message: "Inicia sessão para usar o serviço." },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Sem este filtro, cada imagem e cada chunk de JS pagava um getUser() ao Supabase.
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
