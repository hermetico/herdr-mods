// spaces-plus' own helpers (ports, pull requests, machine load), kept out of main.js so Herdr's
// `spaces` updates merge cleanly. Pure (no herdr imports): `node test_logic.mjs` loads them.

export const tilde = (path) => (path || "~").replace(/^\/home\/[^/]+|^\/Users\/[^/]+/, "~");
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

export function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// A tab's label: its name, or the title its lead program set (as the agents mod does).
export function tabLabel(tab, ps) {
  const mine = ps.filter((p) => p.tab === tab.id && p.terminal);
  const l = mine.find((p) => p.program?.agent) ?? mine.find((p) => p.focused) ?? mine[0];
  const live = clean(l?.title);
  const telling = live && live !== l?.program?.name && !/^[~/]/.test(live) && !live.includes("@");
  return tab.named || !telling ? tab.name : `${tab.index} \u00b7 ${live}`;
}

// Changed files in `git status --porcelain=v2` output: tracked changes, conflicts and untracked.
export function changedCount(out) {
  return out.split("\n").filter((l) => /^[12u?] /.test(l)).length;
}
/** Prints one line per listening TCP socket of this user's processes: address, pid, program, its
 *  folder (tab-separated). `ss` and /proc on Linux, `lsof` elsewhere (macOS). A constant script,
 *  run with `sh -c` on the space's machine; nothing from a space goes into it. */
export const PORTS_SCRIPT = `
if command -v ss >/dev/null 2>&1; then
  ss -ltnpH 2>/dev/null | while read -r _ _ _ addr _ users; do
    printf '%s\\n' "$users" | grep -o '"[^"]*",pid=[0-9]*' | sort -u | while IFS= read -r pair; do
      name=\${pair%%\\",pid=*}; pid=\${pair##*pid=}
      printf '%s\\t%s\\t%s\\t%s\\n' "$addr" "$pid" "\${name#\\"}" "$(readlink /proc/$pid/cwd 2>/dev/null)"
    done
  done
else
  lsof -nP -iTCP -sTCP:LISTEN -Fpcn 2>/dev/null | awk '/^p/{p=substr($0,2)} /^c/{c=substr($0,2)} /^n/{print substr($0,2) "\\t" p "\\t" c}' | sort -u |
  while IFS="$(printf '\\t')" read -r addr pid name; do
    printf '%s\\t%s\\t%s\\t%s\\n' "$addr" "$pid" "$name" "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  done
fi`;

// Coding agents and their helpers listen too (OpenCode's server, IDE bridges); not a space's app.
const AGENTS = new Set(["claude", "codex", "opencode", "pi", "pig", "hermes", "herdr-core", "herdr-app"]);
const ANY = new Set(["*", "0.0.0.0", "::", "127.0.0.1", "::1", "localhost"]);

/** PORTS_SCRIPT's output as [{ host, port, pid, name, cwd }]. Ephemeral ports (32768 and up: a
 *  program's private socket, not something to open) and agents' own are left out. */
export function parseListeners(out) {
  const list = [];
  for (const line of (out ?? "").split("\n")) {
    const [addr, pid, name, cwd] = line.split("\t");
    const m = addr?.match(/^\[?(.*?)\]?(?:%[^:]*)?:(\d+)$/);
    if (!m || !cwd) continue;
    const port = Number(m[2]);
    if (!(port > 0 && port < 32768) || AGENTS.has(name)) continue;
    list.push({ host: ANY.has(m[1]) ? "localhost" : m[1], port, pid: Number(pid), name, cwd });
  }
  return list;
}

const isHome = (f) => /^(\/home\/[^/]+|\/Users\/[^/]+|\/root|\/)\/?$/.test(f);

/** Folder -> its listening ports ([{ host, port, name }], by port): a socket belongs to the space
 *  whose folder holds the program's folder most closely (a worktree's server goes to the worktree,
 *  not the checkout around it). Home folders take none: everything runs under home. */
export function assignPorts(listeners, folders) {
  const usable = [...new Set(folders)].filter((f) => f && !isHome(f)).map((f) => f.replace(/\/+$/, ""));
  const out = new Map();
  for (const l of listeners) {
    const best = usable.filter((f) => l.cwd === f || l.cwd.startsWith(`${f}/`)).sort((a, b) => b.length - a.length)[0];
    if (!best) continue;
    const mine = out.get(best) ?? [];
    if (!mine.some((p) => p.port === l.port)) mine.push({ host: l.host, port: l.port, name: l.name });
    out.set(best, mine.sort((a, b) => a.port - b.port));
  }
  return out;
}

/** The folders a space's programs may run in: its own place first, then every pane's live folder,
 *  so a server started from a tab in a repo shows on its space even when the space sits at home. */
export function spaceFolders(place, paneFolders) {
  return [...new Set([place, ...(paneFolders ?? [])].filter(Boolean))];
}

/** A space's ports: those of each of its folders (assignPorts' map, keyed by machine and folder),
 *  once per port, lowest first. */
export function portsOf(ports, machine, folders) {
  const seen = new Map();
  for (const f of folders) for (const p of ports.get(JSON.stringify([machine, f.replace(/\/+$/, "")])) ?? []) if (!seen.has(p.port)) seen.set(p.port, p);
  return [...seen.values()].sort((a, b) => a.port - b.port);
}

/** Whether a machine's /proc/sys/kernel/osrelease is a WSL kernel ("…-microsoft-standard-WSL2"). */
export const isWsl = (osrelease) => /microsoft|wsl/i.test(osrelease ?? "");

/** A listener's address as a URL. `localhost` on another machine becomes that machine's name, unless
 *  `local`: its localhost is this computer's too (WSL forwards its localhost to Windows). */
export const portUrl = (p, machine, local = false) => `http://${p.host === "localhost" && machine && !local ? machine : p.host}:${p.port}`;

/** `gh pr list --json number,headRefName,state,isDraft,url,title,reviewDecision,statusCheckRollup` output as branch -> the newest PR from it
 *  ({ number, state, draft, url }); closed-unmerged ones are left out. */
export function prsByBranch(json, previous = new Map(), now = Date.now()) {
  const out = new Map();
  let list = [];
  try { list = JSON.parse(json ?? "[]"); } catch {}
  for (const p of Array.isArray(list) ? list : []) {
    if (!p?.headRefName || out.has(p.headRefName) || p.state === "CLOSED") continue;
    const pr = { number: p.number, state: p.state, draft: Boolean(p.isDraft), url: p.url, title: p.title ?? "", review: p.reviewDecision ?? "" };
    if (Array.isArray(p.statusCheckRollup)) {
      const old = previous.get(p.headRefName);
      pr.checks = p.statusCheckRollup.map(c => {
        if (c.status !== "QUEUED" && c.state !== "PENDING") return c;
        const key = c.detailsUrl || c.targetUrl || c.name || c.context;
        const prior = old?.number === p.number && old.checks?.find(x => (x.detailsUrl || x.targetUrl || x.name || x.context) === key && (x.status === "QUEUED" || x.state === "PENDING"));
        // shortcut: gh omits check creation time, count from first observation until it exposes one.
        const date = Date.parse(c.createdAt || c.startedAt);
        return { ...c, queuedSince: date > 0 && date <= now ? date : prior?.queuedSince ?? now };
      });
    }
    out.set(p.headRefName, pr);
  }
  return out;
}

const FAILED = ["FAILURE", "ERROR", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE", "STALE"];

export function ciStatus(checks, now = Date.now()) {
  const failed = (checks ?? []).filter(c => FAILED.includes(c.conclusion || c.state));
  if (failed.length) return { tone: "error", text: `Failed: ${failed.map(c => c.name || c.context || "check").join(", ")}` };
  const ages = (checks ?? []).filter(c => c.status === "QUEUED" || c.state === "PENDING")
    .map(c => now - (c.queuedSince ?? Date.parse(c.createdAt || c.startedAt))).filter(age => age > 45 * 60000);
  return ages.length ? { tone: "warning", text: `queued ${Math.floor(Math.max(...ages) / 60000)}m` } : null;
}

export const offlineTimes = (machines, previous, now = Date.now()) => Object.fromEntries(
  machines.filter(m => m.state !== "connected").map(m => [m.name, previous[m.name] ?? now]),
);

// A machine name or ssh target that is safe to pass as an argument: no leading "-", so it can't be
// read as an option.
export const SAFE_MACHINE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** How login.exp ended, from its exit code, which it keeps above hc's own: "ok"; "network" when the
 *  machine's ssh port can't be reached, with the reason as `why`; "denied" when the SSH agent refused
 *  to sign, such as a Deny in 1Password; "typing" when it asks for a password, a passphrase, a code or
 *  a sign-in link; "unanswered" after 40 s of nothing, mostly a Touch ID prompt nobody answered;
 *  "tailscale" when Tailscale SSH wants a login in the browser, with its link as `url`; "agent" when the
 *  SSH agent isn't running, with `onePassword` when it's 1Password's. Any other failure is hc's own:
 *  read from its output, or "network" with its last line. */
export function loginOutcome(code, out) {
  const lines = String(out ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !/^spawn /.test(l));
  if (code === 0) return { kind: "ok" };
  if (code === 91) return { kind: "denied" };
  if (code === 92) return { kind: "typing" };
  if (code === 93) return { kind: "unanswered" };
  const text = lines.join("\n");
  const url = text.match(/authenticate, visit:\s*(https:\/\/\S+)/)?.[1] ?? (code === 95 ? lines.findLast((l) => /^https:\/\/\S+$/.test(l)) : null);
  if (url && code !== 90) return { kind: "tailscale", url };
  if (code === 95) return { kind: "typing" };
  if (code === 96) return { kind: "agent", onePassword: /1password/i.test(text) };
  if (code !== 90 && /agent refused operation/i.test(text)) return { kind: "denied" };
  if (code !== 90 && /[Pp]assword:|passphrase for|[Vv]erification code|one-time/.test(text)) return { kind: "typing" };
  const why = lines.find((l) => /^can't reach|^ssh:|could not|timed out|refused|unreachable|no route/i.test(l)) ?? lines.at(-1) ?? "the login failed";
  return { kind: "network", why: why.replace(/^ssh:\s*/, "").replace(/^error:\s*/, "") };
}

// Seconds until herdr-core tries a refused login again: 2 minutes after the refusal, 5 more,
// then every 10. It doesn't report its timer or the refusal's time, so `since` is when the card
// first saw the machine needing a login.
export function nextLoginTry(since, now = Date.now()) {
  const gone = (now - since) / 1000;
  let at = 120, step = 300;
  while (at <= gone) { at += step; step = 600; }
  return Math.max(0, Math.round(at - gone));
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const age = (ms) => (ms < 60000 ? `${Math.floor(ms / 1000)} s` : duration(ms));

/** What a machine's card says about its connection: `kind` picks the dot and icon, `action` the
 *  one button. Null when it's connected and no login is under way. A drop shorter than a minute
 *  is "reconnecting": herdr-core redials on its own then. `login` is the card's own login, if any:
 *  { phase: "waiting" | "failed" | "denied" | "unanswered" | "typing" | "terminal" | "tailscale" | "agent" }. `refused`: when the card first saw it need a login. */
export function connection(machine, since, login, name = machine?.name, now = Date.now(), refused = null) {
  if (login?.phase === "waiting") {
    return { kind: "logging", text: "logging in…", action: "cancel",
      tooltip: `Logging in to ${name}: the network first, then the key. If 1Password asks, approve it there.\nIt gives up after 40 s.\nCancel hides it; the login itself still runs until it ends.` };
  }
  if (!machine || machine.state === "connected") return null;
  if (login?.phase === "failed" && machine.state !== "needs_login") {
    const from = machine.since_ms ?? since ?? now;
    return { kind: "unreachable", text: `still not reachable · ${age(Math.max(0, now - from))}`, action: "retry",
      tooltip: `Retry couldn't reach ${name}: ${login.why}\nCheck the VPN or Tailscale, then retry.` };
  }
  if (login?.phase === "denied" && machine.state !== "connected") {
    return { kind: "login", text: "login refused", action: "login",
      tooltip: `The SSH agent refused to use the key for ${name}: denied in 1Password, or its prompt timed out.\nLog in asks again.` };
  }
  if (login?.phase === "unanswered" && machine.state !== "connected") {
    return { kind: "login", text: "login not answered", action: "login",
      tooltip: `Nothing answered the login to ${name} in 40 s, mostly a Touch ID prompt left waiting.\nLog in asks again.` };
  }
  if (login?.phase === "tailscale" && login.url) {
    return { kind: "login", text: "Tailscale needs login", action: "link",
      tooltip: `Tailscale SSH wants you to log in again in the browser.\nOpen link opens it; ${name} reconnects on its own once you're in.` };
  }
  if (login?.phase === "agent") {
    return login.onePassword
      ? { kind: "login", text: "1Password closed", action: "open1p",
          tooltip: `ssh uses 1Password's SSH agent for ${name}, and 1Password isn't running.\nOpen starts it; then Log in.` }
      : { kind: "login", text: "SSH agent not running", action: "login",
          tooltip: `The SSH agent ssh uses for ${name} isn't answering.\nStart it, then Log in.` };
  }
  if (login?.phase === "typing") {
    return { kind: "typing", text: "login wants typing", action: "terminal",
      tooltip: `The login to ${name} asks for a password, a code or a sign-in link.\nOpen terminal runs hc machine login ${name} in a new space; it closes once ${name} is back.` };
  }
  if (login?.phase === "terminal") {
    return { kind: "typing", text: "logging in, in a terminal", action: "close",
      tooltip: `Finish the login in the "login ${name}" space. It closes once ${name} is back.\nClose ends it and closes that space.` };
  }
  const from = machine.since_ms ?? since ?? now;
  const gone = Math.max(0, now - from);
  const why = machine.why || "";
  if (machine.state === "needs_login") {
    return { kind: "login", text: `needs a login · next try ${clock(nextLoginTry(refused ?? now, now))}`, action: "login",
      tooltip: `${name} refused the SSH login: Touch ID went unanswered, or the key or its agent was locked.\nherdr-core tries again on its own after 2 min, 5 min, then every 10 min.` };
  }
  if (machine.state === "connecting" || (machine.state === "unreachable" && gone < 60000)) {
    return { kind: "reconnecting", text: `reconnecting · ${age(gone)}`, action: null,
      tooltip: `${why || `Dialing ${name} again`}\nherdr-core retries on its own, every 30 s at most.` };
  }
  // herdr-core waits 20 s for the other side's hello. Past the network, that's mostly ssh waiting on
  // its agent: 1Password asking to use the key.
  if (machine.state === "unreachable" && /no answer within/i.test(why)) {
    return { kind: "unreachable", text: `no answer · ${age(gone)}`, action: "retry",
      tooltip: `${why}\nIt answered too slowly: often an SSH agent such as 1Password still asking to use the key.\nApprove it, or press Retry and approve the new request.` };
  }
  if (machine.state === "unreachable") {
    const reason = /host key|remote host identification/i.test(why) ? "host key"
      : /refused/i.test(why) ? "connection refused"
      : /timed? ?out|timeout|unreachable|no route|resolve|nodename|network is down|closed|broken pipe/i.test(why) ? "not reachable"
      : "not connected";
    return { kind: "unreachable", text: `${reason} · ${age(gone)}`, action: "retry",
      tooltip: `${why || "Not connected"}\nNot connected for ${age(gone)}. Retry logs in now instead of waiting for the next try.` };
  }
  return { kind: "unreachable", text: machine.state.replace(/_/g, " "), action: null, tooltip: why || machine.state };
}

/** /proc/stat's first line as [busy, total] jiffies, or null. */
export function cpuTimes(stat) {
  const f = stat?.match(/^cpu\s+(.+)$/m)?.[1].trim().split(/\s+/).slice(0, 8).map(Number);
  if (!f || f.length < 4 || f.some((n) => !Number.isFinite(n))) return null;
  const total = f.reduce((a, b) => a + b, 0);
  return [total - f[3] - (f[4] || 0), total];
}

export function cpuPercent(prev, now) {
  if (!prev || !now || now[1] <= prev[1]) return null;
  return Math.max(0, Math.min(100, Math.round((100 * (now[0] - prev[0])) / (now[1] - prev[1]))));
}

/** Memory in use, % of total, from /proc/meminfo, or null. */
export function memPercent(meminfo) {
  const kib = (key) => Number(meminfo?.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1]);
  const total = kib("MemTotal");
  const avail = kib("MemAvailable");
  return total > 0 && avail >= 0 && avail <= total ? Math.round((100 * (total - avail)) / total) : null;
}

/** The pull request badge's hover card: state and review pills, then each check, failed first;
 *  more than 8 checks fold the passed ones into "+N passed". tone is a theme key. */
export function prCard(pr, now = Date.now()) {
  const state = pr.state === "MERGED" ? ["merged", "ansi5"] : pr.draft ? ["draft", "dim"] : ["open", "ansi2"];
  const review = { APPROVED: ["approved", "ansi2"], CHANGES_REQUESTED: ["changes requested", "ansi1"], REVIEW_REQUIRED: ["review required", "ansi3"] }[pr.review];
  const since = (d) => { const t = Date.parse(d); return t > 0 ? duration(Math.max(0, now - t)) : ""; };
  const took = (c) => { const a = Date.parse(c.startedAt), b = Date.parse(c.completedAt); return a > 0 && b >= a ? duration(b - a) : ""; };
  const rows = (pr.checks ?? []).map((c) => {
    const name = c.name || c.context || "check", s = c.conclusion || c.state;
    if (FAILED.includes(s)) return { kind: 0, mark: "✗", tone: "ansi1", name, right: ["failed", took(c)].filter(Boolean).join(" · ") };
    if (c.status === "IN_PROGRESS") return { kind: 1, mark: "●", tone: "ansi3", name, right: `running ${since(c.startedAt)}`.trim() };
    if (c.status === "QUEUED" || c.status === "PENDING" || c.status === "WAITING" || c.state === "PENDING" || c.state === "EXPECTED")
      return { kind: 2, mark: "○", tone: "ansi3", name, right: `queued ${c.queuedSince ? duration(Math.max(0, now - c.queuedSince)) : since(c.createdAt || c.startedAt)}`.trim() };
    return { kind: 3, mark: "✓", tone: "ansi2", name, right: took(c) };
  }).sort((a, b) => a.kind - b.kind);
  const count = (k) => rows.filter((r) => r.kind === k).length;
  const summary = [[0, "failed"], [1, "running"], [2, "queued"], [3, "passed"]].filter(([k]) => count(k)).map(([k, w]) => `${count(k)} ${w}`).join(", ");
  const shown = rows.length > 8 ? rows.filter((r, i) => r.kind < 3 || i < 8) : rows;
  return { state, review, summary, rows: shown, more: rows.length - shown.length };
}

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

// ---- machine order: the person's, by dragging a machine's header ----
// Keys are machine names, "" for this computer. Saved in shared "machines.order".

/** The machines in the saved order; any not saved yet follow, this computer first, then by name. */
export function machineOrder(keys, saved) {
  const known = new Set(keys);
  const first = (Array.isArray(saved) ? saved : []).filter((k, i, a) => known.has(k) && a.indexOf(k) === i);
  const rest = keys.filter((k) => !first.includes(k)).sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  return [...first, ...rest];
}

/** `order` with `from` dropped on `to`: after it when dragged down, before it when dragged up. */
export function moveMachine(order, from, to) {
  const a = order.indexOf(from), b = order.indexOf(to);
  if (a < 0 || b < 0 || a === b) return order;
  const out = order.filter((k) => k !== from);
  out.splice(out.indexOf(to) + (a < b ? 1 : 0), 0, from);
  return out;
}
