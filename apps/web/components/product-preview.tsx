import { BotIcon, CopyIcon, FileIcon, LockIcon, UserIcon } from "./icons";

// Estático de propósito: é a "prova visual" do produto na landing, não o chat a
// sério (esse é a etapa 2 da Fase 3).
export function ProductPreview() {
  return (
    <div className="w-full max-w-[920px] overflow-hidden rounded-lg border border-line bg-surface shadow-[0_40px_120px_-50px_rgb(0_0_0/0.95)]">
      <div className="flex h-11 items-center border-b border-line px-4">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
          <span className="size-2.5 rounded-full bg-line" />
        </div>
        <span className="flex flex-1 items-center justify-center gap-1.5 font-mono text-xs text-muted">
          <LockIcon className="size-3" />
          facebook/react
        </span>
        <div className="w-14" />
      </div>

      <div className="space-y-6 p-7 text-[13px] leading-relaxed">
        <div className="flex gap-3.5">
          <Avatar>
            <UserIcon className="size-3.5" />
          </Avatar>
          <p className="pt-0.5 text-fg">
            How does the React reconciliation algorithm handle fiber node updates
            in the current version?
          </p>
        </div>

        <div className="flex gap-3.5">
          <Avatar>
            <BotIcon className="size-3.5" />
          </Avatar>

          <div className="min-w-0 flex-1 space-y-4">
            <p className="text-muted">
              In{" "}
              <span className="rounded border border-accent/40 bg-accent/10 px-1 py-0.5 font-mono text-[12px] text-accent">
                packages/react-reconciler/src/ReactFiberBeginWork.js
              </span>
              , the reconciliation logic is distributed across several key
              functions. When an update is triggered, React creates a new fiber
              node (the &quot;work-in-progress&quot; fiber) using the{" "}
              <span className="font-mono text-[12px] text-accent">
                createWorkInProgress
              </span>{" "}
              function.
            </p>

            <CodePreview />

            <div className="flex flex-wrap gap-2">
              {["ReactFiber.js", "ReactChildFiber.js"].map((file) => (
                <span
                  key={file}
                  className="flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-muted"
                >
                  <FileIcon className="size-3" />
                  {file}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-muted">
      {children}
    </span>
  );
}

// Highlighting à mão. Um destacador a sério (shiki, prism) para um bloco
// decorativo de dez linhas era peso a mais — o chat real, esse sim, vai precisar
// de um na etapa 2.
function CodePreview() {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-canvas">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <span className="font-mono text-[11px] text-muted">
          ReactFiberBeginWork.js
        </span>
        <CopyIcon className="size-3.5 text-muted" />
      </div>
      <pre className="overflow-x-auto px-3.5 py-3.5 font-mono text-[12px] leading-6 text-fg">
        <code>
          <K>function</K> <F>beginWork</F>(current, workInProgress, renderLanes){" "}
          {"{"}
          {"\n"}
          {"  "}
          <C>{"// Check for recurring updates"}</C>
          {"\n"}
          {"  "}
          <K>if</K> (current !== <K>null</K>) {"{"}
          {"\n"}
          {"    "}
          <K>const</K> oldProps = current.memoizedProps;
          {"\n"}
          {"    "}
          <K>const</K> newProps = workInProgress.pendingProps;
          {"\n\n"}
          {"    "}
          <K>if</K> (oldProps !== newProps || <F>hasContextChanged</F>()) {"{"}
          {"\n"}
          {"      "}
          <C>{"// Mark as having changed props or context"}</C>
          {"\n"}
          {"      "}
          didReceiveUpdate = <K>true</K>;{"\n"}
          {"    }"}
          {"\n"}
          {"  }"}
          {"\n"}
          {"}"}
        </code>
      </pre>
    </div>
  );
}

const K = ({ children }: { children: React.ReactNode }) => (
  <span className="text-accent">{children}</span>
);
const F = ({ children }: { children: React.ReactNode }) => (
  <span className="text-success">{children}</span>
);
const C = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted">{children}</span>
);
