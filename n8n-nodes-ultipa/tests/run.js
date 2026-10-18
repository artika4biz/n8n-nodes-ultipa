#!/usr/bin/env node
'use strict';

/**
 * Test runner for n8n-nodes-ultipa.
 *
 * Runs every tests/*.test.js against the compiled output in dist/ and the
 * driver vendored under node_modules, so `npm test` needs no server and no
 * installed test framework. Exits non-zero on the first failing suite's
 * completion so CI fails loudly.
 *
 * Usage:
 *   npm test                 # all suites
 *   node tests/run.js export # only suites whose file name contains "export"
 */

const fs = require('fs');
const path = require('path');
const { AssertionError } = require('./harness');

const TESTS_DIR = __dirname;
const ROOT = path.resolve(__dirname, '..');
const filter = process.argv[2];

function preflight() {
  const needed = [
    ['dist/nodes/Ultipa/Ultipa.node.js', 'run `npm run build` first'],
    ['node_modules/@ultipa-graph/ultipa-driver/dist/index.js',
      'run `npm run vendor` (after building the driver) first'],
  ];
  const missing = needed.filter(([rel]) => !fs.existsSync(path.join(ROOT, rel)));
  if (missing.length) {
    console.error('Cannot run tests:');
    for (const [rel, hint] of missing) {
      if (!fs.existsSync(path.join(ROOT, rel))) console.error(`  missing ${rel} — ${hint}`);
    }
    process.exit(2);
  }
}

async function main() {
  preflight();

  const files = fs
    .readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !filter || f.includes(filter))
    .sort();

  if (files.length === 0) {
    console.error(filter ? `No suites match "${filter}".` : 'No test suites found.');
    process.exit(2);
  }

  let passed = 0;
  const failures = [];

  for (const file of files) {
    const { name, cases } = require(path.join(TESTS_DIR, file));
    console.log(`\n${name}`);

    for (const { title, fn } of cases) {
      try {
        await fn();
        passed++;
        console.log(`  ok   ${title}`);
      } catch (err) {
        failures.push({ suite: name, title, err });
        console.log(`  FAIL ${title}`);
        console.log(`       ${err && err.message}`);
      }
    }
  }

  const total = passed + failures.length;
  console.log(`\n${passed}/${total} passed`);

  if (failures.length) {
    console.log('\nFailures:');
    for (const { suite, title, err } of failures) {
      console.log(`\n  ${suite} › ${title}`);
      console.log(`    ${err && err.message}`);
      // An assertion failure's stack is the harness, not the defect; a real
      // crash's stack is what you actually need.
      if (!(err instanceof AssertionError) && err && err.stack) {
        console.log(
          err.stack.split('\n').slice(1, 5).map((l) => `    ${l.trim()}`).join('\n'),
        );
      }
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nRunner crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});
