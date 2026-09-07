const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const absolute = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function relativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return relative.format(-minutes, "minute");

  const hours = Math.round(minutes / 60);
  if (hours < 24) return relative.format(-hours, "hour");

  const days = Math.round(hours / 24);
  if (days < 30) return relative.format(-days, "day");

  return absolute.format(date);
}
