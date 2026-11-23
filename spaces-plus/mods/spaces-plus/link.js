import { exec, hc, notify, run, spaces } from "herdr";
import { SAFE_MACHINE, localLink, sshHost } from "./extras.mjs";

// Ctrl/Cmd-click on a localhost link printed in another machine's terminal. localhost there isn't
// localhost here, so: the machine's own address when the port answers on it, else an SSH tunnel in a
// space of its own, "tunnel <machine>:<port>", which you close when you're done. A local terminal's
// link goes on to Herdr's usual opener.
export async function handleLink({ link, source }) {
  const m = source.machine;
  const plain = m && link.kind === "url" ? localLink(link.url) : null;
  if (!plain || !SAFE_MACHINE.test(m)) return "pass";
  const open = (url) => exec("open", [url]).then((r) => r, () => exec("xdg-open", [url]));

  // A tunnel already up for this port: open through it.
  const name = `tunnel ${m}:${plain.port}`;
  if (spaces().some((w) => !w.machine && w.name === name) && await answers("localhost", plain.port, 1)) {
    await open(plain.url);
    return "handled";
  }

  // Where ssh would go, read without connecting; no network or 1Password here.
  const listed = JSON.parse((await hc(["machine", "ls", "--json"])).stdout || "{}").machines ?? [];
  const target = listed.find((x) => x.name === m)?.target;
  if (!target || !SAFE_MACHINE.test(target)) return "pass";
  const host = sshHost((await exec("ssh", ["-G", "--", target])).stdout);
  if (host && host !== "localhost" && await answers(host, plain.port, 2)) {
    await open(localLink(link.url, host).url);
    return "handled";
  }

  // Not reachable from here, mostly a server listening on localhost only: tunnel it.
  if (await answers("localhost", plain.port, 1)) {
    notify({ title: `Port ${plain.port} is taken here`, body: `Something on this computer already listens on ${plain.port}, so ${m}'s can't be tunneled to it.`, level: "warning" });
    return "handled";
  }
  run("space.new", { name, machine: "", argv: ["ssh", "-N", "-o", "ExitOnForwardFailure=yes", "-L", `${plain.port}:localhost:${plain.port}`, "--", target], focus: false });
  // Herdr gives a handler 30 s; a Touch ID prompt for the tunnel fits in about 20.
  for (let i = 0; i < 20; i++) {
    await exec("sleep", ["1"]);
    if (await answers("localhost", plain.port, 1)) { await open(plain.url); return "handled"; }
  }
  return "handled"; // the tunnel's space shows why: a prompt, or ssh's error
}

// macOS nc: -G is the connect timeout. Without nc, nothing answers and the tunnel is the way.
const answers = async (host, port, seconds) =>
  (await exec("nc", ["-z", "-G", String(seconds), host, String(port)]).catch(() => ({ code: 1 }))).code === 0;
