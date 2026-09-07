// Shape de GET /index/{repoId}/status (docs/API-CONTRACT.md). Escrito à mão em
// vez de gerado: o contrato é pequeno e estável, e um gerador de tipos a partir
// do FastAPI era mais máquina do que o problema justifica.

export const INDEX_STAGES = [
  "listing_files",
  "reading_files",
  "embedding",
  "saving",
  "done",
  "failed",
] as const;

export type IndexStage = (typeof INDEX_STAGES)[number];

export type IndexStatus = {
  repo_id: string;
  owner: string;
  repo: string;
  stage: IndexStage;
  files_found: number | null;
  chunks_processed: number | null;
  chunks_total: number | null;
  error: { error: string; message: string } | null;
};

export type ServiceError = { error: string; message: string };

export function isTerminalStage(stage: IndexStage): boolean {
  return stage === "done" || stage === "failed";
}

// Tudo o que muda enquanto uma indexação avança. Serve para o ecrã distinguir
// "está a trabalhar" de "está parado no mesmo sítio há muito tempo", que a API
// não sabe responder: o status é uma fotografia da linha, sem timestamp de
// última alteração.
export function progressSignature(status: IndexStatus): string {
  return [
    status.stage,
    status.files_found,
    status.chunks_processed,
    status.chunks_total,
  ].join("|");
}
