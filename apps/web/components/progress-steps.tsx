import type { IndexStage, IndexStatus } from "@/lib/index-status";
import { CheckCircle } from "./icons";

// A ordem em que o indexer grava os stages. É o que permite decidir, para cada
// passo, se já passou, se é o atual, ou se ainda não chegou lá.
const STAGE_ORDER: Record<Exclude<IndexStage, "failed">, number> = {
  listing_files: 0,
  reading_files: 1,
  embedding: 2,
  saving: 3,
  done: 4,
};

// O rag-service grava só 'failed' e perde a etapa onde estava. Os números que
// ficaram gravados são o suficiente para saber até onde chegou. chunks_processed
// não serve para distinguir 'embedding' de 'saving': ele é gravado a zero quando
// os embeddings começam, por isso é sinal de que a etapa arrancou, não de que
// acabou. Quem separa as duas é o processed ter chegado ao total.
function furthestStepReached(status: IndexStatus): number {
  if (
    status.chunks_total !== null &&
    status.chunks_processed !== null &&
    status.chunks_processed >= status.chunks_total
  ) {
    return 3;
  }
  if (status.chunks_total !== null) return 2;
  if (status.files_found !== null) return 1;
  return 0;
}

function stepLabels(status: IndexStatus): string[] {
  return [
    "Reading repository structure",
    status.files_found === null
      ? "Reading code files"
      : `Found ${status.files_found} code files`,
    "Generating embeddings",
    "Saving to index",
    "Ready",
  ];
}

export function ProgressSteps({ status }: { status: IndexStatus }) {
  const failed = status.stage === "failed";
  // O ternário testa status.stage e não `failed` porque é assim que o
  // TypeScript exclui 'failed' do índice de STAGE_ORDER.
  const currentIndex =
    status.stage === "failed"
      ? furthestStepReached(status)
      : STAGE_ORDER[status.stage];
  const labels = stepLabels(status);

  return (
    <ol className="space-y-1">
      {labels.map((label, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex && !failed;
        const isFailedHere = index === currentIndex && failed;

        return (
          <li key={label} className="flex gap-4">
            {/* Coluna do ícone: o traço vertical liga os passos e desaparece no
                último, para o stepper não terminar numa linha solta. */}
            <div className="flex flex-col items-center">
              <StepIcon
                state={
                  isDone
                    ? "done"
                    : isFailedHere
                      ? "failed"
                      : isCurrent
                        ? "current"
                        : "pending"
                }
              />
              {index < labels.length - 1 && (
                <span className="my-1 w-px flex-1 bg-line" />
              )}
            </div>

            <div className="flex-1 pb-5">
              <p
                className={
                  isDone || isCurrent
                    ? "text-sm text-fg"
                    : isFailedHere
                      ? "text-sm text-danger"
                      : "text-sm text-muted"
                }
              >
                {label}
              </p>

              {isCurrent && status.stage === "embedding" && (
                <EmbeddingProgress
                  processed={status.chunks_processed}
                  total={status.chunks_total}
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EmbeddingProgress({
  processed,
  total,
}: {
  processed: number | null;
  total: number | null;
}) {
  // chunks_total só é conhecido depois de os ficheiros serem lidos, e o
  // processed é atualizado de 25 em 25 — a barra fica parada por momentos e isso
  // é esperado, não é um bug.
  const percent =
    processed !== null && total !== null && total > 0
      ? Math.round((processed / total) * 100)
      : 0;

  return (
    <div className="mt-2 max-w-sm">
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className="text-muted">
          {total === null
            ? "a preparar chunks…"
            : `${processed ?? 0} / ${total} chunks`}
        </span>
        <span className="text-accent">{percent}%</span>
      </div>
    </div>
  );
}

function StepIcon({
  state,
}: {
  state: "done" | "current" | "pending" | "failed";
}) {
  if (state === "done") {
    return <CheckCircle className="size-5 shrink-0 text-accent" />;
  }

  if (state === "current") {
    return (
      <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
    );
  }

  return (
    <span
      className={`size-5 shrink-0 rounded-full border-2 ${
        state === "failed" ? "border-danger" : "border-line"
      }`}
    />
  );
}
