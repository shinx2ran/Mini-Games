#!/usr/bin/env node
/* Run every test.
 *
 *   node tests/run.js              each game on its own page, then the full page
 *   node tests/run.js hide twins   only these tests
 *   MG_PAGE=dist/pocket-playroom.html node tests/run.js   everything against the bundle
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const only = process.argv.slice(2);
const files = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !only.length || only.includes(f.replace('.test.js', '')))
  .sort();

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} of ${files.length} test files FAILED` : `\nall ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
