// Pure helpers for sysstat (no herdr imports, so `node test_logic.mjs` can load them).

/** Samples kept for the sparkline: one minute at one reading every 2 s. */
export const SAMPLES = 30;

/** /proc/stat's first line as [busy, total] jiffies, or null. */
export function cpuTimes(stat) {
  const fields = stat?.match(/^cpu\s+(.+)$/m)?.[1].trim().split(/\s+/).slice(0, 8).map(Number);
  if (!fields || fields.length < 4 || fields.some((n) => !Number.isFinite(n))) return null;
  const total = fields.reduce((a, b) => a + b, 0);
  const idle = fields[3] + (fields[4] || 0); // idle + iowait
  return [total - idle, total];
}

/** CPU busy % between two cpuTimes readings, or null when there's no usable earlier one. */
export function cpuPercent(prev, now) {
  if (!prev || !now || now[1] <= prev[1]) return null;
  return Math.max(0, Math.min(100, Math.round((100 * (now[0] - prev[0])) / (now[1] - prev[1]))));
}

/** /proc/meminfo as { used, total } in bytes, or null. */
export function memory(meminfo) {
  const kib = (key) => Number(meminfo?.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1]);
  const total = kib("MemTotal");
  const available = kib("MemAvailable");
  if (!total || !Number.isFinite(available) || available > total) return null;
  return { used: (total - available) * 1024, total: total * 1024 };
}

/** amdgpu's sysfs readings as { busy, used, total }, or null when the files say nothing. */
export function gpu(busy, used, total) {
  const [b, u, t] = [busy, used, total].map((s) => Number(s?.trim()));
  if (!Number.isFinite(b)) return null;
  return { busy: b, used: Number.isFinite(u) ? u : null, total: t > 0 ? t : null };
}

export const gib = (bytes) => (bytes / 2 ** 30).toFixed(1);

/** Keep the last SAMPLES values. */
export const push = (hist, v) => [...hist, v].slice(-SAMPLES);

// The card's line under the CPU graph: average and peak of the samples shown.
export const spread = (hist) => (hist.length ? { avg: Math.round(hist.reduce((a, b) => a + b, 0) / hist.length), peak: Math.max(...hist) } : null);

// macOS has no /proc: one constant script prints the core count, the memory size, the summed %CPU of
// every process and vm_stat, and macLoad turns that into the same numbers the /proc readers give.
export const MAC_LOAD_SCRIPT = `sysctl -n hw.ncpu hw.memsize && ps -A -o %cpu= | awk '{s+=$1} END {print s+0}' && vm_stat`;

/** MAC_LOAD_SCRIPT's output as { cpu (%), used, total (bytes) }, or null. Memory in use is what
 *  Activity Monitor calls Memory Used: app memory (anonymous minus purgeable), wired and compressed. */
export function macLoad(out) {
  const lines = (out ?? "").split("\n");
  const [cores, total, cpu] = lines.slice(0, 3).map(Number);
  const page = Number(out?.match(/page size of (\d+) bytes/)?.[1]);
  const pages = (name) => Number(out?.match(new RegExp(`^${name}:\\s+(\\d+)\\.?$`, "m"))?.[1]);
  const [anon, purgeable, wired, compressed] = ["Anonymous pages", "Pages purgeable", "Pages wired down", "Pages occupied by compressor"].map(pages);
  if (!(cores > 0) || !(total > 0) || !Number.isFinite(cpu) || !(page > 0) || ![anon, wired, compressed].every(Number.isFinite)) return null;
  const used = Math.min(total, Math.max(0, (anon - (purgeable || 0) + wired + compressed) * page));
  return { cpu: Math.max(0, Math.min(100, Math.round(cpu / cores))), used, total };
}
