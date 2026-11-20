// Self-check for spaces-plus' pure helpers (no window needed): node mods/spaces-plus/test_logic.mjs
import assert from "node:assert/strict";
import * as extras from "./extras.mjs";
import { machineOrder, moveMachine, assignPorts, changedCount, cpuPercent, macLoad, portsOf, spaceFolders, cpuTimes, duration, isWsl, memPercent, parseListeners, portUrl, prsByBranch, tabLabel, tilde } from "./extras.mjs";

assert.equal(tilde("/home/alex/code/x"), "~/code/x");
assert.equal(changedCount("# branch.head main\n1 .M N... a b\n? new.txt\nu UU x\n2 R. y\n# branch.ab +0 -0\n"), 4);
assert.equal(changedCount("# branch.head main\n"), 0);
assert.equal(duration(90 * 60000), "1h");

const ps = [{ tab: "t1", terminal: "t1n", title: "⠋ Open herdr-app session", program: { name: "Hermes", agent: true } }];
assert.equal(tabLabel({ id: "t1", index: 1, name: "1", named: false }, ps), "1 · Open herdr-app session");
assert.equal(tabLabel({ id: "t1", index: 1, name: "fix", named: true }, ps), "fix");
assert.equal(tabLabel({ id: "t2", index: 2, name: "2", named: false }, ps), "2");

// Ports: what PORTS_SCRIPT prints (ss on Linux; lsof on macOS prints the same shape).
const out = [
  "127.0.0.1:5173\t11\tnode\t/home/alex/code/web",
  "[::1]:5173\t11\tnode\t/home/alex/code/web",               // the same server on IPv6: once
  "*:8000\t12\tuvicorn\t/home/alex/code/api/.worktrees/fix",  // a worktree inside the checkout
  "0.0.0.0:3000\t13\tnode\t/home/alex/code/api/web",
  "100.64.0.2%tailscale0:9000\t14\tpython3\t/home/alex/code/api",
  "127.0.0.1:41234\t15\tnode\t/home/alex/code/web",            // ephemeral: left out
  "127.0.0.1:4096\t16\topencode\t/home/alex/code/web",         // an agent's own server: left out
  "127.0.0.1:2222\t17\tsshd-ish\t/home/alex",                  // under home only: no space
  "garbage",
].join("\n");
const listeners = parseListeners(out);
assert.equal(listeners.length, 6);
assert.deepEqual(listeners[4], { host: "100.64.0.2", port: 9000, pid: 14, name: "python3", cwd: "/home/alex/code/api" });
const ports = assignPorts(listeners, ["/home/alex/code/web", "/home/alex/code/api", "/home/alex/code/api/.worktrees/fix/", "/home/alex", null]);
assert.deepEqual(ports.get("/home/alex/code/web"), [{ host: "localhost", port: 5173, name: "node" }]);
assert.deepEqual(ports.get("/home/alex/code/api").map((p) => p.port), [3000, 9000]);   // web/ is inside api
assert.deepEqual(ports.get("/home/alex/code/api/.worktrees/fix").map((p) => p.port), [8000]); // the closest folder wins
assert.equal(ports.get("/home/alex"), undefined);
assert.equal(portUrl({ host: "localhost", port: 5173 }, null), "http://localhost:5173");
assert.equal(portUrl({ host: "localhost", port: 5173 }, "vps"), "http://vps:5173");
assert.equal(portUrl({ host: "100.64.0.2", port: 9000 }, "vps"), "http://100.64.0.2:9000");
// A WSL machine seen from a Windows app: its localhost is forwarded, its Herdr name resolves nowhere.
assert.equal(portUrl({ host: "localhost", port: 5173 }, "dev", true), "http://localhost:5173");
assert.equal(portUrl({ host: "172.20.1.5", port: 5173 }, "dev", true), "http://172.20.1.5:5173");
assert.equal(isWsl("6.6.87.2-microsoft-standard-WSL2\n"), true);
assert.equal(isWsl("4.4.0-19041-Microsoft\n"), true); // WSL1
assert.equal(isWsl("6.8.0-45-generic\n"), false);
assert.equal(isWsl(null), false);

// Pull requests: the newest per branch; closed-unmerged ones go.
const prs = prsByBranch(JSON.stringify([
  { number: 12, headRefName: "fix", state: "OPEN", isDraft: true, url: "https://github.com/o/r/pull/12" },
  { number: 9, headRefName: "fix", state: "MERGED", isDraft: false, url: "u9" },
  { number: 8, headRefName: "old", state: "CLOSED", isDraft: false, url: "u8" },
  { number: 7, headRefName: "done", state: "MERGED", isDraft: false, url: "u7" },
]));
assert.deepEqual(prs.get("fix"), { number: 12, state: "OPEN", draft: true, url: "https://github.com/o/r/pull/12", title: "", review: "" });
assert.equal(prs.get("old"), undefined);
assert.equal(prs.get("done").state, "MERGED");
assert.equal(prsByBranch("not json").size, 0);

// CI: failures beat stuck queues; no alert for normal running or passing checks.
assert.equal(typeof extras.ciStatus, "function");
{
  const now = Date.parse("2030-01-01T01:00:00Z");
  const card = extras.prCard({ number: 5, state: "OPEN", draft: false, review: "CHANGES_REQUESTED", checks: [
    { name: "lint", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:02:00Z" },
    { name: "test", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2030-01-01T00:00:00Z", completedAt: "2030-01-01T00:04:00Z" },
    { name: "build", status: "IN_PROGRESS", startedAt: "2030-01-01T00:55:00Z" },
    { name: "deploy", status: "QUEUED", queuedSince: now - 6 * 60000 },
  ] }, now);
  assert.deepEqual(card.state, ["open", "ansi2"]);
  assert.deepEqual(card.review, ["changes requested", "ansi1"]);
  assert.equal(card.summary, "1 failed, 1 running, 1 queued, 1 passed");
  assert.deepEqual(card.rows.map((r) => [r.mark, r.name, r.right]), [["✗", "test", "failed · 4m"], ["●", "build", "running 5m"], ["○", "deploy", "queued 6m"], ["✓", "lint", "2m"]]);
  const many = extras.prCard({ state: "MERGED", checks: [{ name: "x", conclusion: "FAILURE" }, ...Array.from({ length: 10 }, (_, i) => ({ name: `ok${i}`, conclusion: "SUCCESS" }))] });
  assert.equal(many.rows.length, 8);
  assert.equal(many.more, 3);
  assert.equal(many.rows[0].name, "x");
}
assert.deepEqual(extras.ciStatus([{ name: "tests", status: "COMPLETED", conclusion: "FAILURE" }], 1), { tone: "error", text: "Failed: tests" });
const minute = 60000, now = Date.parse("2026-01-01T01:00:00Z");
const check = (status, time) => ({ name: "build", status, startedAt: time });
assert.equal(extras.ciStatus([check("IN_PROGRESS", "2026-01-01T00:00:00Z")], now), null);
assert.equal(extras.ciStatus([check("QUEUED", "2026-01-01T00:15:00Z")], now), null);
assert.deepEqual(extras.ciStatus([check("QUEUED", "2026-01-01T00:08:00Z")], now), { tone: "warning", text: "queued 52m" });
assert.deepEqual(extras.ciStatus([{ context: "lint", state: "ERROR" }, check("QUEUED", "2026-01-01T00:00:00Z")], now), { tone: "error", text: "Failed: lint" });
const queueJson = JSON.stringify([{ number: 42, headRefName: "work", state: "OPEN", statusCheckRollup: [{ name: "build", status: "QUEUED", startedAt: "0001-01-01T00:00:00Z", detailsUrl: "https://example.com/job/1" }] }]);
const firstQueue = prsByBranch(queueJson, new Map(), now);
assert.equal(extras.ciStatus(firstQueue.get("work").checks, now), null);
const stillQueued = prsByBranch(queueJson, firstQueue, now + 52 * minute);
assert.deepEqual(extras.ciStatus(stillQueued.get("work").checks, now + 52 * minute), { tone: "warning", text: "queued 52m" });
const changedRun = prsByBranch(queueJson.replace("job/1", "job/2"), stillQueued, now + 52 * minute);
assert.equal(extras.ciStatus(changedRun.get("work").checks, now + 52 * minute), null);
assert.equal(extras.ciStatus([{ status: "COMPLETED", conclusion: "SKIPPED" }, { status: "COMPLETED", conclusion: "SUCCESS" }], now), null);
assert.deepEqual(extras.ciStatus([{ name: "build", conclusion: "FAILURE" }, { context: "lint", state: "FAILURE" }], now), { tone: "error", text: "Failed: build, lint" });

// Disconnected state uses the first observed outage, and resets on reconnect.
assert.equal(typeof extras.offlineTimes, "function");
assert.deepEqual(extras.offlineTimes([{ name: "box", state: "unreachable" }], {}, now), { box: now });
assert.deepEqual(extras.offlineTimes([{ name: "box", state: "unreachable" }], { box: now }, now + minute), { box: now });
assert.deepEqual(extras.offlineTimes([{ name: "box", state: "connected" }], { box: now }, now + minute), {});
assert.deepEqual(extras.offlineTimes([], { box: now }, now + minute), {});

// Machine load.
const a = cpuTimes("cpu  100 0 100 700 100 0 0 0\n");
assert.equal(cpuPercent(a, cpuTimes("cpu  150 0 150 750 150 0 0 0\n")), 50);
assert.equal(cpuPercent(null, a), null);
assert.equal(memPercent("MemTotal: 1000 kB\nMemAvailable: 250 kB\n"), 75);
assert.equal(memPercent(null), null);
// macLoad: a made-up 8-core, 16 GiB Mac with 16 KiB pages.
const mac = "8\n17179869184\n200.5\nMach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:  1000.\nPages wired down:  65536.\nPages purgeable:  1024.\nAnonymous pages:  263168.\nPages occupied by compressor:  65536.\n";
assert.deepEqual(macLoad(mac), { cpu: 25, used: 16384 * (263168 - 1024 + 65536 + 65536), total: 17179869184 });
assert.equal(macLoad("8\n17179869184\n900\n" + mac.split("\n").slice(3).join("\n")).cpu, 100);
assert.equal(macLoad("garbage"), null);
assert.equal(macLoad(null), null);
// A space at home with a tab in a repo: the repo's server shows on it, once.
const homeSpace = spaceFolders("/home/alex", ["/home/alex", "/home/alex/acme/web", "/home/alex/acme/web"]);
assert.deepEqual(homeSpace, ["/home/alex", "/home/alex/acme/web"]);
// Keyed as main.js keeps it: [machine, folder].
const portMap = new Map([...assignPorts([
  { host: "localhost", port: 5173, pid: 1, name: "node", cwd: "/home/alex/acme/web" },
  { host: "localhost", port: 8000, pid: 2, name: "python3", cwd: "/home/alex/other" },
], homeSpace)].map(([f, list]) => [JSON.stringify([null, f]), list]));
assert.deepEqual(portsOf(portMap, null, homeSpace).map((p) => p.port), [5173]);
assert.deepEqual(portsOf(portMap, "devbox", homeSpace), []);
// Machine order: saved first, the rest after with this computer leading; a drag moves one.
assert.deepEqual(machineOrder(["", "devbox", "alpha"], null), ["", "alpha", "devbox"]);
assert.deepEqual(machineOrder(["", "devbox", "alpha"], ["devbox", "gone", ""]), ["devbox", "", "alpha"]);
assert.deepEqual(moveMachine(["", "alpha", "devbox"], "", "devbox"), ["alpha", "devbox", ""]);
assert.deepEqual(moveMachine(["", "alpha", "devbox"], "devbox", ""), ["devbox", "", "alpha"]);
assert.deepEqual(moveMachine(["", "alpha"], "alpha", "alpha"), ["", "alpha"]);

// Connection states on a machine's card.
{
  const now = 10_000_000, s = 1000, min = 60 * s;
  const { connection, nextLoginTry, SAFE_MACHINE } = extras;
  assert.equal(nextLoginTry(now - 20 * s, now), 100);
  assert.equal(nextLoginTry(now - 3 * min, now), 240);
  assert.equal(nextLoginTry(now - 10 * min, now), 420);
  assert.equal(nextLoginTry(now - 20 * min, now), 420);
  assert.equal(connection({ name: "box", state: "connected" }, null, null, "box", now), null);
  assert.equal(connection({ name: "box", state: "connected" }, null, { phase: "terminal" }, "box", now), null);
  assert.equal(connection({ name: "box", state: "connecting" }, now - 12 * s, null, "box", now).text, "reconnecting · 12 s");
  const blip = connection({ name: "box", state: "unreachable", why: "no answer within 20 s", since_ms: now - 30 * s }, null, null, "box", now);
  assert.deepEqual([blip.kind, blip.action], ["reconnecting", null]);
  const down = connection({ name: "box", state: "unreachable", why: "cannot reach box: ssh: connect to host box port 22: Operation timed out", since_ms: now - 4 * min }, null, null, "box", now);
  assert.deepEqual([down.kind, down.text, down.action], ["unreachable", "not reachable · 4m", "retry"]);
  assert.equal(connection({ name: "box", state: "unreachable", why: "Connection refused", since_ms: now - 4 * min }, null, null, "box", now).text, "connection refused · 4m");
  const login = connection({ name: "box", state: "needs_login", since_ms: now - 9 * min }, null, null, "box", now, now - 20 * s);
  assert.deepEqual([login.kind, login.text, login.action], ["login", "needs a login · next try 1:40", "login"]);
  assert.deepEqual(connection({ name: "box", state: "needs_login" }, now, { phase: "waiting" }, "box", now).action, "cancel");
  assert.deepEqual(connection({ name: "box", state: "needs_login" }, now, { phase: "typing" }, "box", now).action, "terminal");
  assert.equal(connection({ name: "box", state: "needs_update" }, now, null, "box", now).text, "needs update");
  assert.ok(SAFE_MACHINE.test("acme-gpu") && !SAFE_MACHINE.test("box; rm -rf ~"));
}

// What login.exp's exit code and output mean.
{
  const { loginOutcome, connection } = extras;
  assert.deepEqual(loginOutcome(0, "spawn hc machine login box\nlogged in to box: connected"), { kind: "ok" });
  assert.deepEqual(loginOutcome(0, "logged in to box: unreachable"), { kind: "ok" }); // logged in; the card reads the line's state itself
  assert.deepEqual(loginOutcome(90, "can't reach 100.64.0.9 port 22"), { kind: "network", why: "can't reach 100.64.0.9 port 22" });
  assert.deepEqual(loginOutcome(91, "anything"), { kind: "denied" });
  assert.deepEqual(loginOutcome(92, "anything"), { kind: "typing" });
  assert.deepEqual(loginOutcome(93, ""), { kind: "unanswered" });
  // 94: hc's own failure, read from its output.
  assert.deepEqual(loginOutcome(94, "spawn hc machine login box\nssh: Could not resolve hostname box: nodename nor servname provided, or not known\nerror: logging in to box failed\nhint: ssh said why, above"),
    { kind: "network", why: "Could not resolve hostname box: nodename nor servname provided, or not known" });
  assert.equal(loginOutcome(94, "alex@box's password: \nPermission denied (publickey,password).").kind, "typing");
  assert.equal(loginOutcome(94, "# To authenticate, visit: https://login.tailscale.com/a/abc").kind, "typing");
  // A banner naming 1Password or a URL is not a prompt.
  assert.equal(loginOutcome(94, "Welcome! Keys live in 1Password, see https://wiki.example.com\nerror: logging in to box failed").kind, "network");
  // hc's own exit codes 3, 4 and 5 are failures, not the script's results.
  assert.equal(loginOutcome(5, "error: the core is unavailable").kind, "network");
  const failed = connection({ name: "box", state: "unreachable", since_ms: 10_000_000 - 3 * 60000 }, null, { phase: "failed", why: "can't reach box port 22" }, "box", 10_000_000);
  assert.deepEqual([failed.kind, failed.text, failed.action], ["unreachable", "still not reachable · 3m", "retry"]);
  const unanswered = connection({ name: "box", state: "needs_login" }, null, { phase: "unanswered" }, "box");
  assert.deepEqual([unanswered.text, unanswered.action], ["login not answered", "login"]);
  assert.equal(connection({ name: "box", state: "needs_login" }, null, { phase: "terminal" }, "box").action, "close");
  assert.ok(!extras.SAFE_MACHINE.test("-h") && !extras.SAFE_MACHINE.test("-oProxyCommand=x"));
}

// A machine that answered too slowly, often its SSH agent still asking.
{
  const now = 10_000_000;
  const slow = extras.connection({ name: "box", state: "unreachable", why: "cannot reach box: no answer within 20 s", since_ms: now - 3 * 60000 }, null, null, "box", now);
  assert.deepEqual([slow.text, slow.action], ["no answer · 3m", "retry"]);
  assert.match(slow.tooltip, /1Password/);
}

// A Deny in the SSH agent is a refusal, not something to type.
{
  const out = 'sign_and_send_pubkey: signing failed for RSA "/home/alex/.ssh/key" from agent: agent refused operation\nalex@10.0.0.2\'s password: ';
  assert.deepEqual(extras.loginOutcome(91, out), { kind: "denied" });
  assert.deepEqual(extras.loginOutcome(94, out), { kind: "denied" });
  const denied = extras.connection({ name: "box", state: "needs_login" }, null, { phase: "denied" }, "box");
  assert.deepEqual([denied.kind, denied.text, denied.action], ["login", "login refused", "login"]);
}

console.log("ok");
