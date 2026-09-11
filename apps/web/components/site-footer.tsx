import Image from "next/image";

const SOURCE_URL = "https://github.com/missmundofilipe/rag-codebase-chat";

// Mesma regra da barra de topo: Status/Privacy/Terms ainda não existem, por isso
// não fingem ser links.
const PLACEHOLDER_LINKS = ["Status", "Privacy", "Terms"];

export function SiteFooter() {
  return (
    <footer className="shrink-0 border-t border-line bg-surface/40">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-6 py-8 text-xs text-muted md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Image src="/logo.png" alt="" width={20} height={20} />
            RAG Codebase Chat
          </p>
          <p className="mt-1">Retrieval-augmented answers, grounded in real code.</p>
        </div>

        <p className="md:order-3 md:text-right">
          Built by <span className="font-medium text-fg">Filipe</span> ·{" "}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg"
          >
            open source on GitHub
          </a>
        </p>

        <div className="flex gap-6 md:order-2">
          {PLACEHOLDER_LINKS.map((item) => (
            <span key={item}>{item}</span>
          ))}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-fg"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
