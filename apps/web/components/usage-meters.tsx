function Meter({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const full = used >= limit;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className={full ? "text-danger" : "text-fg"}>
          {used.toLocaleString("en")} / {limit.toLocaleString("en")}
        </span>
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${full ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function UsageMeters({
  repos,
  maxRepos,
  messages,
  maxMessages,
  chunks,
  maxChunks,
}: {
  repos: number;
  maxRepos: number;
  messages: number;
  maxMessages: number;
  chunks: number;
  maxChunks: number;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Meter label="Repositories" used={repos} limit={maxRepos} />
      <Meter label="Messages this month" used={messages} limit={maxMessages} />
      <Meter label="Chunks indexed this month" used={chunks} limit={maxChunks} />
    </div>
  );
}
