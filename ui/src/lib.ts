export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function shortSha(value: string): string {
  return value.slice(0, 9);
}

export function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function barLevel(value: number, maximum: number): string {
  if (maximum <= 0 || value <= 0) return "bar-level-0";
  const level = Math.max(1, Math.min(10, Math.ceil((value / maximum) * 10)));
  return `bar-level-${level}`;
}
