// Ao contrário do resto das variáveis deste serviço, estas duas são NEXT_PUBLIC_:
// o SDK de auth do Supabase corre também no browser, por isso os valores têm mesmo
// de ir no bundle. A anon key é desenhada para ser pública — sozinha não abre nada,
// quem decide o que se pode ler são as policies de RLS.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY em falta no .env.local"
  );
}

export const supabaseUrl = url;
export const supabaseAnonKey = anonKey;
