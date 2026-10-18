'use strict';

/**
 * collectExport() — the JSON Lines reassembly and completeness reporting.
 *
 * This is the package's own logic rather than a driver passthrough, so it is
 * the part most worth testing. Two properties matter:
 *
 *   - The driver splits the stream by size and guarantees only that a chunk
 *     ends on a UTF-8 character boundary. A JSON Lines *record* can still
 *     straddle two chunks, so parsing per chunk would corrupt data. The tests
 *     sweep chunk sizes down to one byte, where almost every record is split.
 *   - A server too old to report completeness sends zeros, which must NOT be
 *     reported as a clean export.
 */

const { suite, assert } = require('./harness');
const { generic, chunkedExport, exportStats } = require('./helpers/stubs');

const RECORDS = [
  { id: 'n1', labels: ['Person'], properties: { name: 'Ada' } },
  // A multi-byte name, so a chunk boundary can land mid-character.
  { id: 'n2', labels: ['Person'], properties: { name: 'Grace Hopper éè€' } },
  { id: 'n3', labels: ['Person'], properties: { name: 'Alan', tags: ['a', 'b'] } },
];
const JSONL = RECORDS.map((r) => JSON.stringify(r)).join('\n');

function clientWith(exportImpl) {
  return { export: exportImpl };
}

async function collect(text, chunkSize, limit = 0, stats = exportStats()) {
  return generic.collectExport(
    clientWith(chunkedExport(text, chunkSize, stats)),
    { graphName: 'g' },
    limit,
  );
}

module.exports = suite('export (JSON Lines)', (test) => {
  // ── reassembly across chunk boundaries ───────────────────────────────────
  for (const size of [1, 2, 3, 7, 13, 64, 4096]) {
    test(`records survive a ${size}-byte chunk split`, async () => {
      const out = await collect(JSONL, size);
      assert.deepEqual(out.records, RECORDS,
        `reassembly failed at chunk size ${size}`);
      assert.deepEqual(out.malformed, [], 'nothing should be unparseable');
      assert.equal(out.truncated, false);
    });
  }

  test('a trailing newline does not produce a phantom record', async () => {
    const out = await collect(`${JSONL}\n`, 9);
    assert.equal(out.records.length, 3);
    assert.deepEqual(out.malformed, []);
  });

  test('CRLF line endings are handled', async () => {
    const out = await collect(RECORDS.map((r) => JSON.stringify(r)).join('\r\n'), 11);
    assert.deepEqual(out.records, RECORDS);
    assert.deepEqual(out.malformed, []);
  });

  test('blank lines are skipped', async () => {
    const out = await collect('{"id":"a"}\n\n\n{"id":"b"}\n', 3);
    assert.deepEqual(out.records, [{ id: 'a' }, { id: 'b' }]);
  });

  test('an empty export yields no records and does not throw', async () => {
    const out = await collect('', 10);
    assert.deepEqual(out.records, []);
    assert.equal(out.truncated, false);
  });

  test('a single record with no trailing newline is still emitted', async () => {
    const out = await collect('{"id":"only"}', 2);
    assert.deepEqual(out.records, [{ id: 'only' }]);
  });

  test('multi-byte characters survive a boundary intact', async () => {
    const out = await collect(JSON.stringify({ s: 'éè€你好' }), 1);
    assert.deepEqual(out.records, [{ s: 'éè€你好' }]);
  });

  // ── limit (applied client-side) ──────────────────────────────────────────
  test('a limit keeps the first N records and flags truncation', async () => {
    const out = await collect(JSONL, 5, 2);
    assert.equal(out.records.length, 2);
    assert.deepEqual(out.records, RECORDS.slice(0, 2));
    assert.equal(out.truncated, true);
  });

  test('a limit equal to the record count does not claim truncation', async () => {
    const out = await collect(JSONL, 5, 3);
    assert.equal(out.records.length, 3);
    assert.equal(out.truncated, false, 'nothing was actually cut');
  });

  test('a limit above the record count does not claim truncation', async () => {
    const out = await collect(JSONL, 5, 99);
    assert.equal(out.records.length, 3);
    assert.equal(out.truncated, false);
  });

  test('limit 0 means no limit', async () => {
    const out = await collect(JSONL, 5, 0);
    assert.equal(out.records.length, 3);
    assert.equal(out.truncated, false);
  });

  // ── malformed input ──────────────────────────────────────────────────────
  test('an unparseable line is isolated, not fatal', async () => {
    const out = await generic.collectExport(
      clientWith(async (_c, cb) => {
        cb({ data: Buffer.from('{"id":"a"}\nnot json\n{"id":"b"}', 'utf8'), isFinal: true });
      }),
      { graphName: 'g' }, 0,
    );
    assert.deepEqual(out.records, [{ id: 'a' }, { id: 'b' }],
      'valid records must still come through');
    assert.deepEqual(out.malformed, ['not json'], 'the bad line is kept verbatim');
  });

  test('a stream that ends without a final marker still emits its last line', async () => {
    const out = await generic.collectExport(
      clientWith(async (_c, cb) => {
        cb({ data: Buffer.from('{"id":"a"}\n{"id":"b"}', 'utf8'), isFinal: false });
      }),
      { graphName: 'g' }, 0,
    );
    assert.deepEqual(out.records, [{ id: 'a' }, { id: 'b' }]);
  });

  test('a chunk carrying only held-back bytes (empty data) is harmless', async () => {
    const out = await generic.collectExport(
      clientWith(async (_c, cb) => {
        cb({ data: Buffer.alloc(0), isFinal: false });
        cb({ data: Buffer.from('{"id":"a"}', 'utf8'), isFinal: true });
      }),
      { graphName: 'g' }, 0,
    );
    assert.deepEqual(out.records, [{ id: 'a' }]);
  });

  // ── completeness reporting ───────────────────────────────────────────────
  test('a clean export from a reporting server is complete', async () => {
    const out = await collect(JSONL, 10, 0, exportStats({
      nodesExported: 3, nodesExpected: 3, bytesWritten: JSONL.length, durationMs: 7,
    }));
    assert.equal(out.stats.completenessReported, true);
    assert.equal(out.stats.complete, true);
    assert.deepEqual(out.stats.warnings, []);
  });

  test('skipped records make an export incomplete', async () => {
    const out = await collect(JSONL, 10, 0, exportStats({
      nodesExported: 3, nodesExpected: 5, nodesSkipped: 2,
      warnings: ['count mismatch: 3 of 5'],
    }));
    assert.equal(out.stats.complete, false);
    assert.equal(out.stats.nodesSkipped, 2);
    assert.deepEqual(out.stats.warnings, ['count mismatch: 3 of 5']);
  });

  test('a warning alone makes an export incomplete', async () => {
    const out = await collect(JSONL, 10, 0, exportStats({
      nodesExported: 3, nodesExpected: 3, warnings: ['a corrupt record was skipped'],
    }));
    assert.equal(out.stats.completenessReported, true);
    assert.equal(out.stats.complete, false);
  });

  test('an older server is not reported as complete', async () => {
    // All-zero completeness fields are indistinguishable from a clean export,
    // so claiming complete:true here would be a lie.
    const out = await collect(JSONL, 10, 0, exportStats({
      nodesExported: 3, bytesWritten: 120, durationMs: 4,
    }));
    assert.equal(out.stats.completenessReported, false);
    assert.equal(out.stats.complete, undefined,
      'complete must be withheld, not guessed, when the server does not report it');
  });

  test('edge-side completeness is read too', async () => {
    const out = await collect('{"id":"e1"}', 4, 0, exportStats({
      edgesExported: 1, edgesExpected: 4, edgesSkipped: 3, warnings: ['skipped 3'],
    }));
    assert.equal(out.stats.complete, false);
    assert.equal(out.stats.edgesSkipped, 3);
  });

  test('stats are absent when the stream carried none', async () => {
    const out = await generic.collectExport(
      clientWith(async (_c, cb) => {
        cb({ data: Buffer.from('{"id":"a"}', 'utf8'), isFinal: true });
      }),
      { graphName: 'g' }, 0,
    );
    assert.equal(out.stats, undefined);
  });

  test('the config reaches the driver untouched', async () => {
    let seen;
    const config = {
      graphName: 'g', exportNodes: true, exportEdges: false,
      nodeLabels: ['Person'], includeMetadata: false,
    };
    await generic.collectExport(
      clientWith(async (c, cb) => {
        seen = c;
        cb({ data: Buffer.alloc(0), isFinal: true });
      }),
      config, 0,
    );
    assert.deepEqual(seen, config);
  });
});
