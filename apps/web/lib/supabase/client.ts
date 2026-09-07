import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "./env";

// Uma função em vez de uma instância exportada: o cliente guarda estado de sessão
// lá dentro, e uma instância partilhada por módulo é o tipo de coisa que sobrevive
// a um fast refresh e depois mente sobre quem está logado.
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
