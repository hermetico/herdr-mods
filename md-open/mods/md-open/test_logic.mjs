import assert from 'node:assert/strict';
import { clickedPath, isMarkdown, mdPaths, splitAddress } from './logic.mjs';
const screen = `Recommendation written: /home/alex/acme/.hermes/plans/2026-11-09-plan.md
see README.md:12 and (docs/setup.md), also ~/notes/todo.markdown.
diff a//home/alex/acme/CHANGELOG.md, not a.mdx or https://x.md/page or foo.md5
report: ~/Documents/Reports/q3.html and invoice.PDF, not https://acme.test/page.html or x.htmlx
again: /home/alex/acme/.hermes/plans/2026-11-09-plan.md`;
assert.deepEqual(mdPaths(screen), [
  '/home/alex/acme/.hermes/plans/2026-11-09-plan.md',
  'invoice.PDF',
  '~/Documents/Reports/q3.html',
  'a/home/alex/acme/CHANGELOG.md',
  '~/notes/todo.markdown',
  'docs/setup.md',
  'README.md',
]);
assert.deepEqual(mdPaths(null), []);
assert.equal(isMarkdown('/a/b.MD'), true);
assert.equal(isMarkdown('/a/b.html'), false);
assert.equal(isMarkdown('/a/b.pdf'), false);
assert.equal(clickedPath('/home/alex/acme/README.md', 'README.md'), '/home/alex/acme/README.md');
assert.equal(clickedPath(null, 'docs/plan.md:42'), 'docs/plan.md');
assert.equal(clickedPath(null, 'docs/plan.md:42:7'), 'docs/plan.md');
assert.equal(clickedPath(null, 'file:///home/alex/My%20Notes.md'), '/home/alex/My Notes.md');
assert.equal(clickedPath(null, 'file://acme-box/home/alex/a.md'), '/home/alex/a.md');
assert.equal(clickedPath(null, 'file:///home/alex/%E0%A4%A.md'), null);
assert.equal(clickedPath(null, 'src/main.rs'), null);
assert.equal(clickedPath(null, '--help.md'), null);
assert.deepEqual(splitAddress('t7'), { machine: null, address: 't7' });
assert.deepEqual(splitAddress('box/t7'), { machine: 'box', address: 't7' });
console.log('md-open logic ok');
