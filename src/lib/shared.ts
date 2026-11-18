/* Shared by the TV and the phone remote. Keep this file free of side effects. */
/* ---------- small, crash-proof localStorage helpers ---------- */
export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: keep running in memory */
  }
}

export const AVATAR_COLORS = [
  'linear-gradient(140deg,#ffb37a,#ff6f61)',
  'linear-gradient(140deg,#7cf0c0,#2bb3a8)',
  'linear-gradient(140deg,#ffe36b,#ffa63d)',
  'linear-gradient(140deg,#8fb4ff,#5b5bff)',
  'linear-gradient(140deg,#ff9ad5,#c04bff)',
  'linear-gradient(140deg,#c9d3ea,#7b86a8)',
];

