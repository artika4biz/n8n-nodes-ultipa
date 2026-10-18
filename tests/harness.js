'use strict';

/**
 * Minimal assertion helpers for the suite.
 *
 * Deliberately dependency-free: this package ships three devDependencies and
 * `npm run lint` already fails for want of a fourth, so the tests earn their
 * keep only if running them needs nothing installed.
 */

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function fail(message) {
  throw new AssertionError(message);
}

function show(value) {
  if (typeof value === 'bigint') return `${value}n`;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const assert = {
  ok(cond, message = 'expected a truthy value') {
    if (!cond) fail(message);
  },

  equal(actual, expected, message) {
    if (actual !== expected) {
      fail(message || `expected ${show(expected)}, got ${show(actual)}`);
    }
  },

  deepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) fail(message || `expected ${e}, got ${a}`);
  },

  /**
   * The suite leans on this a lot: several driver fields must be ABSENT rather
   * than zero-filled, because "absent" and "zero" mean different things
   * (an absent dmlStats means "not a DML query", not "changed nothing").
   */
  absent(obj, key, message) {
    if (key in obj) {
      fail(message || `expected key "${key}" to be absent, got ${show(obj[key])}`);
    }
  },

  present(obj, key, message) {
    if (!(key in obj)) fail(message || `expected key "${key}" to be present`);
  },

  async rejects(fn, match, message) {
    let threw = false;
    try {
      await fn();
    } catch (err) {
      threw = true;
      if (match && !String(err && err.message).match(match)) {
        fail(message || `error did not match ${match}: ${err && err.message}`);
      }
    }
    if (!threw) fail(message || 'expected the call to reject');
  },
};

/** Collect the test cases a file declares. */
function suite(name, register) {
  const cases = [];
  register((title, fn) => cases.push({ title, fn }));
  return { name, cases };
}

module.exports = { suite, assert, AssertionError };
