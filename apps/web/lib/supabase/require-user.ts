import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";

export async function requireUser(): Promise<User | Response> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "not_authenticated", message: "Inicia sessão para usar o serviço." },
      { status: 401 }
    );
  }

  return user;
}
