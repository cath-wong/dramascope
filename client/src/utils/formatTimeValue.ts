export function formatTimeValue(value: unknown): string {
  if (value === null || value === undefined) return "Unknown";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  if (num % 1 === 0) return Math.floor(num).toString();
  return num.toString();
}
