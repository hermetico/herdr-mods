// Markdown, HTML and PDF file paths in terminal text, newest (lowest on screen) first, each once.
// Relative and ~ paths are kept as written; the machine resolves them (see main.js).
export function mdPaths(text) {
  const found = String(text ?? '').match(/(?<![\w.~/-])(?:~\/|\.{1,2}\/|\/)?[\w.@+~-]+(?:\/+[\w.@+~-]+)*\.(?:md|markdown|html?|pdf)(?![\w/-])/gi) ?? [];
  return [...new Set(found.map(p => p.replace(/\/{2,}/g, '/')).reverse())].slice(0, 200);
}

// Prints the machine's home, then the paths that are files there, made absolute: relative ones against
// the terminal's folder, ~/ against home. Paths travel as arguments, never as script.
export const RESOLVE = 'printf "%s\\n" "$HOME"; cd -- "$1" 2>/dev/null || cd; shift; for f; do case $f in "~/"*) f=$HOME/${f#"~/"};; /*) ;; *) f=$PWD/$f;; esac; [ -f "$f" ] && printf "%s\\n" "$f"; done; :';

// The path a Ctrl/Cmd-clicked link names, from Herdr's resolved path or else the clicked text: a
// file: URI decoded, a :line or :line:col suffix dropped. Null when it isn't markdown.
export function clickedPath(path, raw) {
  let p = path ?? String(raw ?? '').trim();
  if (/^file:\/\//i.test(p)) {
    try { p = decodeURIComponent(p.replace(/^file:\/\/[^/]*/i, '')); } catch { return null; }
  }
  p = p.replace(/(?::\d+){1,2}$/, '');
  return p && !p.startsWith('-') && isMarkdown(p) ? p : null;
}

// Markdown opens in the editor; HTML and PDF go to whatever the system opens files with.
export const isMarkdown = path => /\.(?:md|markdown)$/i.test(path);

// "machine/t7" (another machine's terminal) or "t7" (this computer's).
export function splitAddress(terminal) {
  const at = String(terminal ?? '').lastIndexOf('/');
  return at < 0 ? { machine: null, address: terminal } : { machine: terminal.slice(0, at), address: terminal.slice(at + 1) };
}
