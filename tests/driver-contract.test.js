'use strict';

/**
 * The driver API this package is pinned to.
 *
 * These are the checks a clean `tsc` does NOT give you. The April 2026 build
 * compiled perfectly while three things were broken, and each failure mode has
 * a test here:
 *
 *   1. a method was removed from the driver        -> "is gone" cases below
 *   2. an enum gained a member                     -> InsertType cases
 *   3. a parameter changed from an enum to an object -> see node-dispatch suite
 *
 * A failure here means the vendored driver moved. Read it as "go reconcile",
 * not "the test is wrong" — then update this file deliberately.
 */

const { suite, assert } = require('./harness');
const { driver, generic } = require('./helpers/stubs');

module.exports = suite('driver contract', (test) => {
  // ── InsertType ───────────────────────────────────────────────────────────
  // Mirroring this enum locally is what hid Upsert: a local
  // `const enum { Normal, Overwrite }` compiled fine and simply could not
  // express the third mode.
  test('InsertType is exported from the driver (not mirrored locally)', () => {
    assert.ok(driver.InsertType, 'driver must export InsertType');
  });

  test('InsertType values are Normal=0, Overwrite=1, Upsert=2', () => {
    assert.equal(driver.InsertType.Normal, 0, 'Normal must be 0');
    assert.equal(driver.InsertType.Overwrite, 1, 'Overwrite must be 1');
    assert.equal(driver.InsertType.Upsert, 2, 'Upsert must be 2');
  });

  test('InsertType has exactly three modes (a new one needs UI work)', () => {
    const names = Object.keys(driver.InsertType).filter((k) => Number.isNaN(Number(k)));
    assert.deepEqual(names.sort(), ['Normal', 'Overwrite', 'Upsert'],
      'a new InsertType member must also be offered in NodeDescription/EdgeDescription');
  });

  // ── methods the node calls ───────────────────────────────────────────────
  const required = [
    'login', 'close', 'useGraph', 'gql', 'explain', 'profile',
    'insertNodes', 'insertEdges',
    'deleteNodesByIds', 'deleteNodesByCondition',
    'deleteEdgesByIds', 'deleteEdgesByCondition',
    'export',
    'listGraphs', 'getGraphInfo', 'createGraph', 'createGraphIfNotExist',
    'dropGraph', 'truncate', 'alterGraph', 'stats',
    'showLabels', 'showNodeTypes', 'showEdgeTypes',
    'createNodeLabel', 'createEdgeLabel', 'dropNodeLabel', 'dropEdgeLabel',
    'createNodeProperty', 'createEdgeProperty', 'dropNodeProperty', 'dropEdgeProperty',
    'showIndex', 'createNodeIndex', 'createEdgeIndex', 'dropNodeIndex', 'dropEdgeIndex',
    'showFulltext', 'createNodeFulltext', 'createEdgeFulltext',
    'dropNodeFulltext', 'dropEdgeFulltext',
    'healthCheck', 'getStatistics', 'getSystemMetrics',
    'getCacheStats', 'clearCache', 'compact', 'warmupParser',
    'showTasks', 'stopTask', 'deleteTask', 'top', 'kill',
    'listTransactions', 'ping',
  ];

  for (const method of required) {
    test(`client.${method}() exists`, () => {
      assert.equal(typeof driver.GqldbClient.prototype[method], 'function',
        `the node calls client.${method}(), which the driver no longer provides`);
    });
  }

  // ── methods that must stay gone ──────────────────────────────────────────
  // Driver 6.x replaced these with the byIds/byCondition pair. If they come
  // back, that is a deliberate API decision worth noticing rather than
  // silently depending on.
  for (const method of ['deleteNodes', 'deleteEdges']) {
    test(`client.${method}() is still absent`, () => {
      assert.equal(driver.GqldbClient.prototype[method], undefined,
        `${method}() reappeared — reconcile before using it`);
    });
  }

  // exportNodes/exportEdges still exist on the client but are deprecated AND
  // their RPCs are gone from the proto, so they fail against a live server.
  // The node must not call them.
  test('the node calls neither deprecated export method', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'dist', 'nodes', 'Ultipa', 'Ultipa.node.js'), 'utf8');
    assert.ok(!/\.exportNodes\(|\.exportEdges\(/.test(src),
      'exportNodes/exportEdges RPCs were removed server-side; use export()');
  });

  test('the node calls neither removed delete method', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'dist', 'nodes', 'Ultipa', 'Ultipa.node.js'), 'utf8');
    assert.ok(!/\.deleteNodes\(|\.deleteEdges\(/.test(src),
      'the node references a delete method the driver removed');
  });

  // ── error model ──────────────────────────────────────────────────────────
  // 6.x kept the gRPC status on .code and moved the engine code to
  // .engineCode. errorToJson() reports both, so a swap would be silent.
  test('GqldbError carries code, engineCode and reason', () => {
    const err = new driver.GqldbError('boom', 9);
    assert.equal(err.code, 9, '.code must stay the gRPC status');
    assert.equal(err.engineCode, 0, '.engineCode is 0 without server detail');
    assert.equal(err.reason, '', '.reason is empty without server detail');
  });

  test('WriteConflictError keeps its shipped 3011 code', () => {
    assert.equal(driver.WRITE_CONFLICT_CODE, 3011);
    assert.equal(new driver.WriteConflictError('conflict').code, 3011);
  });

  test('the engine codes the retry config refers to are still exported', () => {
    assert.ok(driver.EngineCode, 'EngineCode must be exported');
    assert.equal(typeof driver.errorDetail, 'function');
    assert.equal(typeof driver.partlyStored, 'function');
  });

  // ── types mirrored in this package ───────────────────────────────────────
  // Mirrored only because the driver does not re-export them. If any starts
  // being exported, drop the local copy — a mirror is unchecked.
  for (const name of ['ExportConfig', 'ExportChunk', 'ExportStats',
    'ConvPropertyDef', 'IndexProperty']) {
    test(`${name} is still not exported by the driver (mirror stays justified)`, () => {
      assert.equal(driver[name], undefined,
        `${name} is exported now — import it instead of mirroring it`);
    });
  }

  // ── config ───────────────────────────────────────────────────────────────
  test('the driver accepts the config buildConfig() produces', () => {
    const config = generic.buildConfig({
      host: 'h:9000', username: 'u', password: 'p', timeout: 30000,
    });
    driver.validateConfig(config); // throws on a rejected config
  });

  test('DEFAULT_CONFIG still documents the defaults the credentials cite', () => {
    const d = driver.DEFAULT_CONFIG;
    assert.equal(d.timeout, 30000, 'credential help text says 30000');
    assert.equal(d.maxRecvSize, 64 * 1024 * 1024, 'credential help text says 64 MB');
    assert.equal(d.poolSize, 10, 'credential help text says 10');
    assert.equal(d.healthCheckInterval, 30000, 'credential help text says 30000');
    assert.equal(d.retryCount, 3, 'credential default for Read Retry Count is 3');
    assert.equal(d.retryDelay, 100, 'credential help text says 100');
  });
});
