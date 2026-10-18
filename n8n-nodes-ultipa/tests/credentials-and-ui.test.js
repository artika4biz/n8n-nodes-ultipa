'use strict';

/**
 * buildConfig() and the n8n descriptions.
 *
 * buildConfig() has one non-obvious rule: a blank or zero credential is sent
 * as `undefined` so the driver's own DEFAULT_CONFIG applies, rather than being
 * passed through as 0 and overriding it. `retryCount` is the deliberate
 * exception, because 0 there means "disable the retry".
 *
 * The description tests exist because a malformed INodeProperties entry breaks
 * the node in the n8n UI with no build error at all.
 */

const { suite, assert } = require('./harness');
const { generic, Ultipa, UltipaApi } = require('./helpers/stubs');

const properties = new Ultipa().description.properties;
const credentialFields = new UltipaApi().properties;

const byName = (name) => properties.filter((p) => p.name === name);

module.exports = suite('credentials & UI descriptions', (test) => {
  // ── buildConfig: hosts ───────────────────────────────────────────────────
  test('a single host becomes a one-element array', () => {
    assert.deepEqual(generic.buildConfig({ host: 'localhost:9000' }).hosts, ['localhost:9000']);
  });

  test('comma-separated hosts are split and trimmed', () => {
    assert.deepEqual(
      generic.buildConfig({ host: ' a:1 , b:2,c:3 ' }).hosts,
      ['a:1', 'b:2', 'c:3']);
  });

  test('a blank host falls back to localhost:9000', () => {
    assert.deepEqual(generic.buildConfig({}).hosts, ['localhost:9000']);
  });

  test('empty entries in the host list are dropped', () => {
    assert.deepEqual(generic.buildConfig({ host: 'a:1,,b:2,' }).hosts, ['a:1', 'b:2']);
  });

  // ── buildConfig: defaults left to the driver ─────────────────────────────
  test('unset tuning knobs stay undefined so driver defaults apply', () => {
    const c = generic.buildConfig({ host: 'h:1' });
    for (const key of ['maxRecvSize', 'poolSize', 'healthCheckInterval',
      'retryDelay', 'disableUseGraph', 'tlsOptions']) {
      assert.equal(c[key], undefined, `${key} must not be forced`);
    }
  });

  test('timeout defaults to 30000 but honours an explicit 0', () => {
    assert.equal(generic.buildConfig({ host: 'h:1' }).timeout, 30000);
    assert.equal(generic.buildConfig({ host: 'h:1', timeout: 0 }).timeout, 0);
  });

  test('megabytes are converted to bytes', () => {
    assert.equal(
      generic.buildConfig({ host: 'h:1', maxRecvSizeMb: 256 }).maxRecvSize,
      256 * 1024 * 1024);
  });

  test('0 MB means "use the driver default", not "zero bytes"', () => {
    assert.equal(generic.buildConfig({ host: 'h:1', maxRecvSizeMb: 0 }).maxRecvSize, undefined);
  });

  test('retryCount 0 is passed through to disable the retry', () => {
    // The other knobs treat 0 as "unset"; this one must not, or the retry
    // could never be turned off from the UI.
    assert.equal(generic.buildConfig({ host: 'h:1', retryCount: 0 }).retryCount, 0);
  });

  test('an unset retryCount leaves the driver default in place', () => {
    assert.equal(generic.buildConfig({ host: 'h:1' }).retryCount, undefined);
  });

  test('pool, health interval, retry delay and the USE guard pass through', () => {
    const c = generic.buildConfig({
      host: 'h:1', poolSize: 4, healthCheckInterval: 5000,
      retryDelay: 50, disableUseGraph: true,
    });
    assert.equal(c.poolSize, 4);
    assert.equal(c.healthCheckInterval, 5000);
    assert.equal(c.retryDelay, 50);
    assert.equal(c.disableUseGraph, true);
  });

  test('TLS off leaves tlsOptions undefined; TLS on sets it', () => {
    assert.equal(generic.buildConfig({ host: 'h:1', useTls: false }).tlsOptions, undefined);
    assert.ok(generic.buildConfig({ host: 'h:1', useTls: true }).tlsOptions !== undefined);
  });

  test('blank credentials become undefined rather than empty strings', () => {
    const c = generic.buildConfig({ host: 'h:1', username: '', password: '', defaultGraph: '' });
    assert.equal(c.username, undefined);
    assert.equal(c.password, undefined);
    assert.equal(c.defaultGraph, undefined);
  });

  // ── credential fields ────────────────────────────────────────────────────
  const expectedCredentials = [
    'host', 'username', 'password', 'defaultGraph', 'timeout', 'useTls',
    'maxRecvSizeMb', 'poolSize', 'healthCheckInterval',
    'retryCount', 'retryDelay', 'disableUseGraph',
  ];

  for (const name of expectedCredentials) {
    test(`credential field "${name}" is declared`, () => {
      assert.equal(credentialFields.filter((f) => f.name === name).length, 1);
    });
  }

  test('every credential field has a displayName and a default', () => {
    for (const f of credentialFields) {
      assert.ok(f.displayName, `${f.name} needs a displayName`);
      assert.ok(f.default !== undefined, `${f.name} needs a default`);
    }
  });

  test('the password field is masked', () => {
    const pw = credentialFields.find((f) => f.name === 'password');
    assert.equal(pw.typeOptions && pw.typeOptions.password, true,
      'the password must not be shown in clear text');
  });

  test('every credential buildConfig reads is actually offered in the UI', () => {
    const declared = new Set(credentialFields.map((f) => f.name));
    for (const name of expectedCredentials) {
      assert.ok(declared.has(name), `buildConfig reads "${name}" but the UI never collects it`);
    }
  });

  // ── node description ─────────────────────────────────────────────────────
  test('the node declares its resources', () => {
    const resource = byName('resource')[0];
    assert.ok(resource, 'a resource selector must exist');
    assert.deepEqual(
      resource.options.map((o) => o.value),
      ['query', 'node', 'edge', 'graph', 'schema', 'admin']);
  });

  test('every property has name, displayName and a default', () => {
    const bad = properties.filter((p) => !p.name || !p.displayName || p.default === undefined);
    assert.deepEqual(bad.map((p) => p.name || '(unnamed)'), [],
      'n8n needs all three on every property');
  });

  test('every non-resource property is scoped with displayOptions.show', () => {
    // Without this an unrelated field leaks into other resources' UI.
    const unscoped = properties
      .filter((p) => p.name !== 'resource')
      .filter((p) => !(p.displayOptions && p.displayOptions.show
        && p.displayOptions.show.resource));
    assert.deepEqual(unscoped.map((p) => p.name), []);
  });

  test('insert mode offers all three driver modes on both resources', () => {
    const modes = byName('insertMode');
    assert.equal(modes.length, 2, 'node and edge each need one');
    for (const m of modes) {
      assert.deepEqual(m.options.map((o) => o.value), ['normal', 'overwrite', 'upsert']);
      for (const o of m.options) {
        assert.ok(o.description, `insert mode "${o.value}" needs a description`);
      }
    }
  });

  test('the delete knobs exist on both node and edge', () => {
    for (const name of ['deleteLimit', 'returnDeleted', 'allowDeleteAll']) {
      assert.equal(byName(name).length, 2, `${name} must cover node and edge`);
    }
  });

  test('allowDeleteAll defaults to off and returnDeleted to on', () => {
    for (const p of byName('allowDeleteAll')) {
      assert.equal(p.default, false, 'the safety latch must default to off');
    }
    for (const p of byName('returnDeleted')) {
      assert.equal(p.default, true);
    }
  });

  test('every operation selector has a default among its own options', () => {
    for (const p of properties.filter((x) => x.name === 'operation')) {
      const values = p.options.map((o) => o.value);
      assert.ok(values.includes(p.default),
        `default "${p.default}" is not one of: ${values.join(', ')}`);
    }
  });

  test('each operation option carries an action label for the n8n UI', () => {
    for (const p of properties.filter((x) => x.name === 'operation')) {
      for (const o of p.options) {
        assert.ok(o.action, `operation "${o.value}" needs an action label`);
      }
    }
  });

  test('the node is wired to the ultipaApi credential', () => {
    const d = new Ultipa().description;
    assert.deepEqual(d.credentials, [{ name: 'ultipaApi', required: true }]);
    assert.equal(new UltipaApi().name, 'ultipaApi', 'the credential name must match');
  });
});
