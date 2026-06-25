export function formatTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;

  return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis
    .toString()
    .padStart(3, "0")}`;
}
