'use strict';

/**
 * Stubs for driving the node's real execute() without a server.
 *
 * The compiled node calls `GenericFunctions_1.getClient(this)` — a property
 * read at call time — so replacing that export swaps in a recording client
 * while leaving every dispatch decision in execute() untouched. That matters:
 * the three regressions this suite guards against all lived in the dispatch,
 * not in the driver.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const driver = require(path.join(ROOT, 'node_modules/@ultipa-graph/ultipa-driver'));
const generic = require(path.join(ROOT, 'dist/nodes/Ultipa/GenericFunctions.js'));
const { Ultipa } = require(path.join(ROOT, 'dist/nodes/Ultipa/Ultipa.node.js'));
const { UltipaApi } = require(path.join(ROOT, 'dist/credentials/UltipaApi.credentials.js'));

const { Response, Row } = driver;

/** An empty-but-valid driver Response, as a no-op write would return. */
function emptyResponse() {
  return new Response([], [], 0, false, [], 0);
}

/** A one-row Response, enough for responseToJson() to chew on. */
function rowResponse(columns = ['n'], values = [{ _id: 'n1' }], rowsAffected = 1) {
  return new Response(columns, [new Row(values)], 1, false, [], rowsAffected);
}

/**
 * A GqldbClient stand-in that records every call instead of making one.
 *
 * `returns` maps a method name to a value or a function; anything not listed
 * answers with an empty Response, which is valid for the write-shaped calls.
 */
function recordingClient(returns = {}) {
  const calls = [];

  const handler = {
    get(_target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'callsTo') {
        return (name) => calls.filter((c) => c.method === name);
      }
      if (prop === 'only') {
        return (name) => {
          const hits = calls.filter((c) => c.method === name);
          if (hits.length !== 1) {
            throw new Error(
              `expected exactly one call to ${name}, got ${hits.length}`
                + ` (calls: ${calls.map((c) => c.method).join(', ') || 'none'})`,
            );
          }
          return hits[0];
        };
      }
      if (prop === 'then') return undefined; // not a thenable

      return async (...args) => {
        calls.push({ method: String(prop), args });
        const canned = returns[prop];
        if (typeof canned === 'function') return canned(...args);
        if (canned !== undefined) return canned;
        return emptyResponse();
      };
    },
  };

  return new Proxy({}, handler);
}

/**
 * Run the node's execute() with a stubbed client.
 *
 * @param params   node parameters, as { name: value } or an array of such
 *                 objects (one per input item)
 * @param returns  canned return values keyed by client method name
 * @returns { items, client, error }
 */
async function runNode(params, returns = {}, options = {}) {
  const perItem = Array.isArray(params) ? params : [params];
  const client = recordingClient(returns);

  const realGetClient = generic.getClient;
  generic.getClient = async () => client;

  const ctx = {
    getInputData: () => perItem.map(() => ({ json: {} })),
    getNodeParameter(name, index, fallback) {
      const bag = perItem[index] || {};
      if (name in bag) return bag[name];
      if (fallback !== undefined) return fallback;
      throw new Error(`test did not supply the node parameter "${name}" for item ${index}`);
    },
    continueOnFail: () => options.continueOnFail === true,
    getNode: () => ({ name: 'Ultipa', type: 'ultipa' }),
    getCredentials: async () => ({}),
  };

  try {
    const items = await new Ultipa().execute.call(ctx);
    return { items: items[0], client, error: undefined };
  } catch (error) {
    return { items: undefined, client, error };
  } finally {
    generic.getClient = realGetClient;
  }
}

/**
 * An export() stand-in that hands `text` over in fixed-size slices.
 *
 * Slices stay on a UTF-8 character boundary, as the driver guarantees, but a
 * JSON Lines *record* is free to straddle two of them — which is the case the
 * node's reassembly has to survive.
 */
function chunkedExport(text, chunkSize, stats) {
  const whole = Buffer.from(text, 'utf8');
  return async (_config, cb) => {
    if (whole.length === 0) {
      cb({ data: Buffer.alloc(0), isFinal: true, stats });
      return;
    }
    let off = 0;
    while (off < whole.length) {
      let end = Math.min(off + chunkSize, whole.length);
      while (end < whole.length && (whole[end] & 0xc0) === 0x80) end++;
      const isFinal = end >= whole.length;
      cb({
        data: whole.subarray(off, end),
        isFinal,
        stats: isFinal ? stats : undefined,
      });
      off = end;
    }
  };
}

/** ExportStats as a server that reports completeness would send them. */
function exportStats(over = {}) {
  return {
    nodesExported: 0,
    edgesExported: 0,
    bytesWritten: 0,
    durationMs: 0,
    nodesExpected: 0,
    edgesExpected: 0,
    nodesSkipped: 0,
    edgesSkipped: 0,
    warnings: [],
    ...over,
  };
}

module.exports = {
  ROOT,
  driver,
  generic,
  Ultipa,
  UltipaApi,
  Response,
  Row,
  emptyResponse,
  rowResponse,
  recordingClient,
  runNode,
  chunkedExport,
  exportStats,
};
