import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

/** Para Server Components e Route Handlers. Ler a sessão funciona em qualquer um
 * deles; escrever cookies só funciona em Route Handlers e Server Actions, e é por
 * isso que a renovação da sessão vive no proxy.ts e não aqui. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(refreshedCookies) {
        try {
          for (const { name, value, options } of refreshedCookies) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Único catch vazio do projeto, e é de propósito: a partir de um Server
          // Component o Next atira aqui, porque o HTML já começou a sair. Não é uma
          // falha — o proxy.ts já renovou a sessão antes desta página sequer correr.
        }
      },
    },
  });
}
