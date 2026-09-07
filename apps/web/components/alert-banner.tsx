export function AlertBanner({
  title,
  message,
  detail,
}: {
  title: string;
  message: string;
  detail?: string | null;
}) {
  // Erro calmo, não alarmante: fundo com um lavado de vermelho a baixa
  // opacidade em vez de vermelho sólido, e a barra à esquerda a fazer o
  // trabalho de sinalizar.
  return (
    <div className="w-full rounded-md border border-danger/30 border-l-[3px] border-l-danger bg-danger/5 px-4 py-3">
      <p className="text-sm font-medium text-fg">{title}</p>
      <p className="mt-1 text-sm text-muted">{message}</p>

      {/* A mensagem do serviço fica disponível mas fechada. Um 429 do Gemini
          chega aqui como o JSON de erro inteiro: é a informação certa para
          perceber o que se passou, e a errada para ser a primeira coisa que se
          lê. */}
      {detail && (
        <details className="mt-2.5 group">
          <summary className="cursor-pointer text-xs text-muted transition-colors hover:text-fg">
            Details from the service
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-line bg-canvas p-2.5 font-mono text-[11px] leading-5 whitespace-pre-wrap text-muted">
            {detail}
          </pre>
        </details>
      )}
    </div>
  );
}
