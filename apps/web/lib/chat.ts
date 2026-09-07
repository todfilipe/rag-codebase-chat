// O histórico vive só em memória (decisão de 01-08-2026: sem persistência entre
// sessões no MVP). Um refresh limpa a conversa, e isso é o comportamento
// esperado, não uma falha.

export type Source = {
  file_path: string;
  similarity: number;
  start_offset: number;
  end_offset: number;
  // Nulas para chunks indexados antes da migration 0003. Sem linhas o link vai
  // ao ficheiro inteiro em vez de saltar para o excerto; ver github-url.ts.
  start_line: number | null;
  end_line: number | null;
  // O mesmo texto que o Gemini recebeu no prompt, para o painel poder mostrar
  // em que código a resposta se apoiou.
  content: string;
};

export type UserMessage = { id: string; role: "user"; text: string };

export type AssistantMessage = {
  id: string;
  role: "assistant";
  text: string;
  sources: Source[];
  status: "streaming" | "done" | "failed";
  error: string | null;
};

export type ChatMessage = UserMessage | AssistantMessage;

export function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}
