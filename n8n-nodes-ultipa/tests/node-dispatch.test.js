'use strict';

/**
 * What the node actually asks the driver to do.
 *
 * These run the real execute() against a recording client, so they assert on
 * the call the driver would have received. This is the layer where the
 * silently-broken insert mode lived: `insertNodes(nodes, InsertType.Overwrite)`
 * type-checked against the (graphName, nodes, config) overload, so the mode
 * reached the driver as a positional argument it read as a config object, and
 * every insert ran as a plain INSERT. Nothing failed; the data was just wrong.
 */

const { suite, assert } = require('./harness');
const { driver, runNode, rowResponse, chunkedExport, exportStats } = require('./helpers/stubs');

const { InsertType } = driver;

const NODES = [{ labels: ['Person'], properties: { name: 'Ada' } }];
const EDGES = [{ label: 'KNOWS', fromNodeId: 'a', toNodeId: 'b', properties: {} }];

module.exports = suite('node dispatch', (test) => {
  // ── insert: the mode must travel inside the config object ────────────────
  const modes = [
    ['normal', InsertType.Normal],
    ['overwrite', InsertType.Overwrite],
    ['upsert', InsertType.Upsert],
  ];

  for (const [uiValue, expected] of modes) {
    test(`node insert "${uiValue}" sends insertType ${expected} in the config`, async () => {
      const { client, error } = await runNode({
        resource: 'node', operation: 'insert', graphName: 'g',
        nodesJson: JSON.stringify(NODES), insertMode: uiValue,
      });
      assert.ok(!error, `execute threw: ${error && error.message}`);

      const call = client.only('insertNodes');
      assert.deepEqual(call.args[0], NODES, 'nodes are the first argument');

      const config = call.args[1];
      assert.equal(typeof config, 'object',
        'the second argument must be an InsertConfig object, never a bare enum');
      assert.equal(config.insertType, expected);
      assert.equal(config.graphName, 'g', 'the graph travels in the config too');
    });

    test(`edge insert "${uiValue}" sends insertType ${expected} in the config`, async () => {
      const { client, error } = await runNode({
        resource: 'edge', operation: 'insert', graphName: 'g',
        edgesJson: JSON.stringify(EDGES), insertMode: uiValue,
      });
      assert.ok(!error, `execute threw: ${error && error.message}`);

      const config = client.only('insertEdges').args[1];
      assert.equal(typeof config, 'object', 'must be an InsertConfig object');
      assert.equal(config.insertType, expected);
      assert.equal(config.graphName, 'g');
    });
  }

  test('insert targets the graph per call rather than switching the session', async () => {
    const { client } = await runNode({
      resource: 'node', operation: 'insert', graphName: 'g',
      nodesJson: JSON.stringify(NODES), insertMode: 'normal',
    });
    assert.equal(client.callsTo('useGraph').length, 0,
      'insert must not call useGraph(): one client serves a whole batch');
  });

  test('two items may insert into different graphs', async () => {
    const { client } = await runNode([
      { resource: 'node', operation: 'insert', graphName: 'alpha',
        nodesJson: JSON.stringify(NODES), insertMode: 'normal' },
      { resource: 'node', operation: 'insert', graphName: 'beta',
        nodesJson: JSON.stringify(NODES), insertMode: 'upsert' },
    ]);
    const calls = client.callsTo('insertNodes');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args[1].graphName, 'alpha');
    assert.equal(calls[1].args[1].graphName, 'beta');
    assert.equal(calls[1].args[1].insertType, InsertType.Upsert);
  });

  // ── delete: routing between the byIds and byCondition entry points ───────
  test('node delete with IDs routes to deleteNodesByIds', async () => {
    const { client } = await runNode({
      resource: 'node', operation: 'delete', graphName: 'g',
      nodeIds: 'a, b ,c', labels: '', whereClause: '',
      deleteLimit: 0, returnDeleted: true, allowDeleteAll: false,
    });
    const call = client.only('deleteNodesByIds');
    assert.deepEqual(call.args[0], ['a', 'b', 'c'], 'IDs are split and trimmed');
    assert.equal(call.args[1].graphName, 'g');
    assert.equal(client.callsTo('deleteNodesByCondition').length, 0);
  });

  test('node delete without IDs routes to deleteNodesByCondition', async () => {
    const { client } = await runNode({
      resource: 'node', operation: 'delete', graphName: 'g',
      nodeIds: '', labels: 'Person,Company', whereClause: 'n.age > 30',
      deleteLimit: 50, returnDeleted: false, allowDeleteAll: false,
    });
    const call = client.only('deleteNodesByCondition');
    assert.deepEqual(call.args[0], ['Person', 'Company'], 'labels');
    assert.equal(call.args[1], 'n.age > 30', 'where clause');
    assert.equal(call.args[2], 50, 'limit');
    assert.equal(call.args[3].returnDeleted, false);
    assert.equal(client.callsTo('deleteNodesByIds').length, 0);
  });

  test('an ID list wins over a label/where filter', async () => {
    const { client } = await runNode({
      resource: 'node', operation: 'delete', graphName: 'g',
      nodeIds: 'x', labels: 'Person', whereClause: 'n.age > 30',
      deleteLimit: 0, returnDeleted: true, allowDeleteAll: false,
    });
    assert.equal(client.callsTo('deleteNodesByIds').length, 1);
    assert.equal(client.callsTo('deleteNodesByCondition').length, 0);
  });

  test('edge delete with IDs routes to deleteEdgesByIds', async () => {
    const { client } = await runNode({
      resource: 'edge', operation: 'delete', graphName: 'g',
      edgeIds: 'e1,e2', label: '', whereClause: '',
      deleteLimit: 0, returnDeleted: true, allowDeleteAll: false,
    });
    assert.deepEqual(client.only('deleteEdgesByIds').args[0], ['e1', 'e2']);
  });

  test('edge delete without IDs routes to deleteEdgesByCondition', async () => {
    const { client } = await runNode({
      resource: 'edge', operation: 'delete', graphName: 'g',
      edgeIds: '', label: 'KNOWS', whereClause: 'e.since < 2020',
      deleteLimit: 0, returnDeleted: true, allowDeleteAll: false,
    });
    const call = client.only('deleteEdgesByCondition');
    assert.equal(call.args[0], 'KNOWS');
    assert.equal(call.args[1], 'e.since < 2020');
    assert.equal(call.args[2], undefined, 'limit 0 is sent as undefined, not 0');
  });

  test('the allowDeleteAll latch is forwarded, defaulting to off', async () => {
    const off = await runNode({
      resource: 'node', operation: 'delete', graphName: 'g',
      nodeIds: '', labels: '', whereClause: '',
      deleteLimit: 0, returnDeleted: true, allowDeleteAll: false,
    });
    assert.equal(off.client.only('deleteNodesByCondition').args[3].allowDeleteAll, false,
      'a filterless delete must reach the driver with the latch off, so it refuses');

    const on = await runNode({
      resource: 'node', operation: 'delete', graphName: 'g',
      nodeIds: '', labels: '', whereClause: '',
      deleteLimit: 0, returnDeleted: true, allowDeleteAll: true,
    });
    assert.equal(on.client.only('deleteNodesByCondition').args[3].allowDeleteAll, true);
  });

  test('delete output is a query response, not the old deletedCount shape', async () => {
    const { items } = await runNode(
      { resource: 'node', operation: 'delete', graphName: 'g',
        nodeIds: 'a', labels: '', whereClause: '',
        deleteLimit: 0, returnDeleted: true, allowDeleteAll: false },
      { deleteNodesByIds: rowResponse(['n'], [{ _id: 'a' }], 1) },
    );
    const out = items[0].json;
    assert.equal(out.rowsAffected, 1, 'read rowsAffected where deletedCount used to be');
    assert.deepEqual(out.columns, ['n']);
    assert.equal(out.rows.length, 1);
    assert.absent(out, 'deletedCount');
  });

  // ── export: one pass per resource, limit applied client-side ─────────────
  test('node export asks for nodes only, with no metadata header', async () => {
    const jsonl = '{"id":"n1"}\n{"id":"n2"}';
    const { client, items } = await runNode(
      { resource: 'node', operation: 'export', graphName: 'g',
        exportLabels: 'Person', exportLimit: 0 },
      { export: chunkedExport(jsonl, 5, exportStats({ nodesExported: 2, nodesExpected: 2 })) },
    );
    const config = client.only('export').args[0];
    assert.equal(config.graphName, 'g');
    assert.equal(config.exportNodes, true);
    assert.equal(config.exportEdges, false, 'a node export must not stream edges too');
    assert.deepEqual(config.nodeLabels, ['Person']);
    assert.equal(config.includeMetadata, false,
      'the metadata header would otherwise land among the records');
    assert.equal(items[0].json.count, 2);
  });

  test('edge export asks for edges only', async () => {
    const { client, items } = await runNode(
      { resource: 'edge', operation: 'export', graphName: 'g',
        exportLabels: 'KNOWS', exportLimit: 0 },
      { export: chunkedExport('{"id":"e1"}', 4, exportStats({ edgesExported: 1 })) },
    );
    const config = client.only('export').args[0];
    assert.equal(config.exportNodes, false);
    assert.equal(config.exportEdges, true);
    assert.deepEqual(config.edgeLabels, ['KNOWS']);
    assert.equal(items[0].json.count, 1);
    assert.present(items[0].json, 'edges');
  });

  test('a blank label filter exports everything', async () => {
    const { client } = await runNode(
      { resource: 'node', operation: 'export', graphName: 'g',
        exportLabels: '', exportLimit: 0 },
      { export: chunkedExport('{"id":"n1"}', 50, exportStats()) },
    );
    assert.equal(client.only('export').args[0].nodeLabels, undefined,
      'no filter must mean "all labels", not an empty allow-list');
  });

  // ── query ────────────────────────────────────────────────────────────────
  test('query passes parameters, timeout, readOnly and maxPathResults', async () => {
    const { client } = await runNode(
      { resource: 'query', operation: 'execute', query: 'MATCH (n) RETURN n',
        graphName: 'g', parameters: '{"min":30}', queryTimeout: 5000,
        readOnly: true, maxPathResults: 10 },
      { gql: rowResponse() },
    );
    const [gql, config] = client.only('gql').args;
    assert.equal(gql, 'MATCH (n) RETURN n');
    assert.deepEqual(config.parameters, { min: 30 });
    assert.equal(config.timeout, 5000);
    assert.equal(config.readOnly, true);
    assert.equal(config.maxPathResults, 10);
    assert.equal(config.graphName, 'g');
  });

  test('query omits the optional knobs when they are left at zero/false', async () => {
    const { client } = await runNode(
      { resource: 'query', operation: 'execute', query: 'MATCH (n) RETURN n',
        graphName: '', parameters: '{}', queryTimeout: 0,
        readOnly: false, maxPathResults: 0 },
      { gql: rowResponse() },
    );
    const config = client.only('gql').args[1];
    for (const key of ['graphName', 'parameters', 'timeout', 'readOnly', 'maxPathResults']) {
      assert.equal(config[key], undefined, `${key} must be undefined, not 0/false/''`);
    }
  });

  // ── schema / graph: per-call graphName, not a session switch ─────────────
  test('schema operations target the graph per call', async () => {
    const { client } = await runNode(
      { resource: 'schema', operation: 'showNodeTypes', graphName: 'g' },
      { showNodeTypes: [] },
    );
    assert.equal(client.callsTo('useGraph').length, 0, 'must not switch the session graph');
    assert.deepEqual(client.only('showNodeTypes').args[0], { graphName: 'g' });
  });

  test('a schema operation with no graph sends no config at all', async () => {
    const { client } = await runNode(
      { resource: 'schema', operation: 'showNodeTypes', graphName: '' },
      { showNodeTypes: [] },
    );
    assert.equal(client.only('showNodeTypes').args[0], undefined);
  });

  test('graph stats asks for the graph per call', async () => {
    const { client } = await runNode(
      { resource: 'graph', operation: 'stats', graphName: 'g' },
      { stats: { graphName: 'g', nodeCount: 1, edgeCount: 0 } },
    );
    assert.equal(client.callsTo('useGraph').length, 0);
    assert.deepEqual(client.only('stats').args[0], { graphName: 'g' });
  });

  test('graph "use" still switches the session graph — that is its purpose', async () => {
    const { client } = await runNode(
      { resource: 'graph', operation: 'use', graphName: 'g' },
      { useGraph: undefined },
    );
    assert.equal(client.only('useGraph').args[0], 'g');
  });

  test('a variadic drop-property call still carries the config last', async () => {
    const { client } = await runNode(
      { resource: 'schema', operation: 'dropNodeProperty', graphName: 'g',
        labelName: 'Person', propertyNames: 'age, nickname' },
      { dropNodeProperty: rowResponse() },
    );
    const args = client.only('dropNodeProperty').args;
    assert.equal(args[0], 'Person');
    assert.equal(args[1], 'age');
    assert.equal(args[2], 'nickname');
    assert.deepEqual(args[args.length - 1], { graphName: 'g' },
      'the driver reads a trailing non-string as the config');
  });

  // ── lifecycle & errors ───────────────────────────────────────────────────
  test('the client is closed even when an operation throws', async () => {
    const boom = new driver.GqldbError('boom', 9);
    const { client, error } = await runNode(
      { resource: 'query', operation: 'execute', query: 'X', graphName: '',
        parameters: '{}', queryTimeout: 0, readOnly: false, maxPathResults: 0 },
      { gql: () => { throw boom; } },
    );
    assert.ok(error, 'the error must surface when continueOnFail is off');
    assert.equal(client.callsTo('close').length, 1, 'close() runs in the finally block');
  });

  test('continueOnFail reports the driver error fields instead of throwing', async () => {
    const { items, error } = await runNode(
      { resource: 'query', operation: 'execute', query: 'X', graphName: '',
        parameters: '{}', queryTimeout: 0, readOnly: false, maxPathResults: 0 },
      { gql: () => { throw new driver.GqldbError('fulltext loading', 9); } },
      { continueOnFail: true },
    );
    assert.ok(!error, 'continueOnFail must swallow the error');
    assert.equal(items[0].json.error, 'fulltext loading');
    assert.equal(items[0].json.code, 9);
    assert.equal(items[0].json.errorType, 'GqldbError');
  });

  test('an unknown operation is rejected rather than returning nothing', async () => {
    const { error } = await runNode({ resource: 'query', operation: 'nope', query: 'X' });
    assert.ok(error, 'an unhandled operation must raise');
    assert.ok(/nope/.test(error.message), `message should name the operation: ${error.message}`);
  });

  test('every input item produces exactly one output item', async () => {
    const item = {
      resource: 'query', operation: 'execute', query: 'MATCH (n) RETURN n',
      graphName: '', parameters: '{}', queryTimeout: 0,
      readOnly: false, maxPathResults: 0,
    };
    const { items } = await runNode([item, item, item], { gql: rowResponse() });
    assert.equal(items.length, 3);
    assert.equal(client0(items), 1);
    function client0(list) { return list[0].json.rows.length; }
  });
});
