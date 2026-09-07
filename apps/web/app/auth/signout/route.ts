import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// POST e não GET de propósito: um /auth/signout que respondesse a GET era
// disparado por qualquer <img src> numa página qualquer, e o utilizador saía da
// sessão sem perceber porquê.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", request.url), {
    // O browser chegou aqui com um POST; sem o 303 ele repetiria o POST no
    // destino em vez de fazer o GET da landing.
    status: 303,
  });
}
