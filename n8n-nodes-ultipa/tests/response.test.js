'use strict';

/**
 * responseToJson(), serializeValue() and errorToJson().
 *
 * These read driver fields by name, so a rename in the driver produces wrong
 * or empty workflow output with no build error — the one coupling point the
 * compiler cannot help with.
 *
 * The recurring theme is absent-vs-zero. Several driver fields mean different
 * things when missing than when zero, so the node omits the key rather than
 * zero-filling it, and these tests pin that down.
 */

const { suite, assert } = require('./harness');
const { driver, generic, Response, Row } = require('./helpers/stubs');

// Response(columns, rows, rowCount, hasMore, warnings, rowsAffected,
//          currentGraph, timeCostNs, diskCostNs, computeCostNs, dmlStats)
const DML = {
  insertedNodes: 2, insertedEdges: 1, deletedNodes: 0,
  deletedEdges: 0, setNodes: 0, setEdges: 0,
};

module.exports = suite('response & error mapping', (test) => {
  // ── rows and columns ─────────────────────────────────────────────────────
  test('rows are keyed by column name', () => {
    const out = generic.responseToJson(
      new Response(['name', 'age'], [new Row(['Ada', 36])], 1, false, [], 0));
    assert.deepEqual(out.columns, ['name', 'age']);
    assert.deepEqual(out.rows, [{ name: 'Ada', age: 36 }]);
    assert.equal(out.rowCount, 1);
  });

  test('a node value keeps its nested structure', () => {
    const node = { _id: 'n1', labels: ['Person'], properties: { name: 'Ada' } };
    const out = generic.responseToJson(
      new Response(['n'], [new Row([node])], 1, false, [], 0));
    assert.deepEqual(out.rows[0].n, node);
  });

  test('an empty response is handled without throwing', () => {
    const out = generic.responseToJson(new Response([], [], 0, false, [], 0));
    assert.deepEqual(out.rows, []);
    assert.equal(out.rowCount, 0);
    assert.equal(out.rowsAffected, 0);
    assert.equal(out.hasMore, false);
  });

  test('rowsAffected and hasMore are reported', () => {
    const out = generic.responseToJson(new Response(['x'], [], 0, true, [], 42));
    assert.equal(out.rowsAffected, 42);
    assert.equal(out.hasMore, true);
  });

  test('multiple rows keep their order', () => {
    const out = generic.responseToJson(new Response(
      ['i'], [new Row([1]), new Row([2]), new Row([3])], 3, false, [], 0));
    assert.deepEqual(out.rows.map((r) => r.i), [1, 2, 3]);
  });

  // ── 6.x additions, present ───────────────────────────────────────────────
  test('server warnings, currentGraph, timings and dmlStats are surfaced', () => {
    const out = generic.responseToJson(new Response(
      ['n'], [new Row(['x'])], 1, false, ['heads up'], 3,
      'myGraph', 5_000_000, 1234, 99, DML));
    assert.deepEqual(out.warnings, ['heads up']);
    assert.equal(out.currentGraph, 'myGraph');
    assert.equal(out.timeCostNs, 5_000_000);
    assert.equal(out.timeCostMs, 5, 'ms is offered alongside ns for convenience');
    assert.equal(out.diskCostNs, 1234);
    assert.equal(out.computeCostNs, 99);
    assert.deepEqual(out.dmlStats, DML);
  });

  // ── 6.x additions, absent (the important half) ───────────────────────────
  test('dmlStats is omitted for a pure read', () => {
    // Absent means "not a data-modifying query" — NOT "changed nothing".
    // Zero-filling it would invent a claim the server never made.
    const out = generic.responseToJson(new Response(['x'], [new Row([1])], 1, false, [], 0));
    assert.absent(out, 'dmlStats');
  });

  test('warnings is omitted when there are none', () => {
    const out = generic.responseToJson(new Response(['x'], [], 0, false, [], 0));
    assert.absent(out, 'warnings');
  });

  test('timings are omitted when the server did not report them', () => {
    // 0 means "not reported", not "took no time".
    const out = generic.responseToJson(new Response(['x'], [], 0, false, [], 0));
    assert.absent(out, 'timeCostNs');
    assert.absent(out, 'timeCostMs');
    assert.absent(out, 'diskCostNs');
    assert.absent(out, 'computeCostNs');
  });

  test('currentGraph is omitted on a server that does not report it', () => {
    const out = generic.responseToJson(new Response(['x'], [], 0, false, [], 0, ''));
    assert.absent(out, 'currentGraph');
  });

  test('a zero dmlStats is still reported when the server sent one', () => {
    const zeroed = {
      insertedNodes: 0, insertedEdges: 0, deletedNodes: 0,
      deletedEdges: 0, setNodes: 0, setEdges: 0,
    };
    const out = generic.responseToJson(new Response(
      ['x'], [], 0, false, [], 0, '', 0, 0, 0, zeroed));
    assert.present(out, 'dmlStats', 'a DML query that changed nothing is not the same as a read');
    assert.deepEqual(out.dmlStats, zeroed);
  });

  // ── JSON safety ──────────────────────────────────────────────────────────
  test('BigInt becomes a string so JSON.stringify cannot throw', () => {
    const out = generic.responseToJson(new Response(
      ['id'], [new Row([9007199254740993n])], 1, false, [], 0));
    assert.equal(out.rows[0].id, '9007199254740993');
    JSON.stringify(out); // would throw on a raw BigInt
  });

  test('nested BigInt inside a node is stringified too', () => {
    const out = generic.responseToJson(new Response(
      ['n'], [new Row([{ _id: 'n1', properties: { count: 123n } }])], 1, false, [], 0));
    assert.equal(out.rows[0].n.properties.count, '123');
    JSON.stringify(out);
  });

  test('null and undefined both become null', () => {
    assert.equal(generic.serializeValue(null), null);
    assert.equal(generic.serializeValue(undefined), null);
  });

  test('arrays are walked recursively', () => {
    assert.deepEqual(generic.serializeValue([1n, [2n], { a: 3n }]), ['1', ['2'], { a: '3' }]);
  });

  test('a Date becomes an ISO string', () => {
    assert.equal(
      generic.serializeValue(new Date('2026-10-18T12:00:00.000Z')),
      '2026-10-18T12:00:00.000Z');
  });

  test('a Buffer becomes base64 rather than a byte-array object', () => {
    assert.equal(generic.serializeValue(Buffer.from('hi', 'utf8')), 'aGk=');
  });

  test('a Map becomes a plain object', () => {
    assert.deepEqual(generic.serializeValue(new Map([['a', 1n]])), { a: '1' });
  });

  test('primitives pass through untouched', () => {
    assert.equal(generic.serializeValue('s'), 's');
    assert.equal(generic.serializeValue(7), 7);
    assert.equal(generic.serializeValue(false), false);
  });

  // ── errors ───────────────────────────────────────────────────────────────
  test('a driver error reports message, type and gRPC status', () => {
    const out = generic.errorToJson(new driver.GqldbError('boom', 9));
    assert.equal(out.error, 'boom');
    assert.equal(out.errorType, 'GqldbError');
    assert.equal(out.code, 9, '.code is the gRPC status in 6.x');
  });

  test('engineCode and reason are omitted when the server attached no detail', () => {
    const out = generic.errorToJson(new driver.GqldbError('boom', 9));
    assert.absent(out, 'engineCode');
    assert.absent(out, 'reason');
  });

  test('a subclass reports its own type', () => {
    const out = generic.errorToJson(new driver.QueryFailedError('query boom'));
    assert.equal(out.errorType, 'QueryFailedError');
    assert.equal(out.error, 'query boom');
  });

  test('a write conflict reports 3011', () => {
    assert.equal(generic.errorToJson(new driver.WriteConflictError('conflict')).code, 3011);
  });

  test('a plain Error carries no invented driver fields', () => {
    const out = generic.errorToJson(new Error('plain'));
    assert.equal(out.error, 'plain');
    assert.equal(out.errorType, 'Error');
    assert.absent(out, 'code');
    assert.absent(out, 'engineCode');
  });

  test('a non-Error throwable is stringified rather than dropped', () => {
    assert.equal(generic.errorToJson('just a string').error, 'just a string');
  });

  test('error output is JSON-serialisable', () => {
    JSON.stringify(generic.errorToJson(new driver.GqldbError('boom', 9)));
  });
});
