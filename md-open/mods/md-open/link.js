import { exec, run } from 'herdr';
import { RESOLVE, clickedPath } from './logic.mjs';

// Ctrl/Cmd-click on a markdown path in any terminal, on any machine: opens it in `fresh` in a split
// beside that terminal, as the picker does. Anything that isn't a file there goes to the next handler.
export async function handleLink({ link, source }) {
  const path = clickedPath(link.path, link.raw);
  if (!path) return 'pass';
  const on = source.machine ?? null;
  const r = await exec('sh', ['-c', RESOLVE, 'sh', source.cwd ?? '', path], { on });
  const file = r.code === 0 ? r.stdout.split('\n')[1] : '';
  if (!file) return 'pass';
  const argv = ['fresh', file];
  if (source.pane) run('pane.split', { direction: 'right', pane: source.pane, argv });
  else run('tab.new', { argv, space: source.space ?? undefined });
  return 'handled';
}
