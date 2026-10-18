/**
 * Copies only the compiled output of @ultipa-graph/ultipa-driver into
 * vendor/ultipa-driver/ so that npm pack produces a self-contained tarball
 * with no source code from the sibling nodejs/ directory.
 *
 * What is copied:
 *   nodejs/dist/        → vendor/ultipa-driver/dist/
 *   nodejs/package.json → vendor/ultipa-driver/package.json   (fields only needed at runtime)
 *
 * What is NOT copied:
 *   nodejs/src/         (TypeScript source)
 *   nodejs/tests/       (test suite)
 *   nodejs/node_modules (resolved at install time from vendor/ultipa-driver/package.json)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Where the driver checkout lives. Resolution order:
 *
 *   1. $ULTIPA_DRIVER_ROOT, for a checkout anywhere on disk
 *   2. the sibling gqldb-drivers/nodejs next to this repo, which is the
 *      layout the README's Quick Start describes
 *
 * This used to be a hardcoded absolute path, which meant the vendor step only
 * ever worked on one machine — and silently published that path.
 */
const DEFAULT_DRIVER_ROOT = path.resolve(__dirname, '../../../gqldb-drivers/nodejs');
const DRIVER_ROOT  = process.env.ULTIPA_DRIVER_ROOT
  ? path.resolve(process.env.ULTIPA_DRIVER_ROOT)
  : DEFAULT_DRIVER_ROOT;
const VENDOR_ROOT  = path.resolve(__dirname, '../vendor/ultipa-driver');
const DRIVER_DIST  = path.join(DRIVER_ROOT, 'dist');
const VENDOR_DIST  = path.join(VENDOR_ROOT, 'dist');

// ── Guards ────────────────────────────────────────────────────────────────────

if (!fs.existsSync(DRIVER_ROOT)) {
  console.error(
    `\n[vendor-driver] ERROR: no driver checkout at\n  ${DRIVER_ROOT}\n\n`
    + (process.env.ULTIPA_DRIVER_ROOT
      ? 'That path came from $ULTIPA_DRIVER_ROOT.\n'
      : 'Expected it beside this repo. Point $ULTIPA_DRIVER_ROOT at your checkout:\n'
        + '  ULTIPA_DRIVER_ROOT=/path/to/gqldb-drivers/nodejs npm run vendor\n')
  );
  process.exit(1);
}

if (!fs.existsSync(DRIVER_DIST)) {
  console.error(
    `\n[vendor-driver] ERROR: ${DRIVER_DIST} does not exist.\n`
    + `The driver is present but not built. Run:\n`
    + `  cd ${DRIVER_ROOT} && npm run build\n`
  );
  process.exit(1);
}

console.log(`[vendor-driver] driver: ${DRIVER_ROOT}`);

// ── Clean previous vendor copy ────────────────────────────────────────────────

if (fs.existsSync(VENDOR_ROOT)) {
  fs.rmSync(VENDOR_ROOT, { recursive: true, force: true });
}
fs.mkdirSync(VENDOR_ROOT, { recursive: true });

// ── Copy dist/ recursively ────────────────────────────────────────────────────

copyDir(DRIVER_DIST, VENDOR_DIST);

// ── Write a trimmed package.json (runtime fields only) ────────────────────────

const driverPkg = JSON.parse(
  fs.readFileSync(path.join(DRIVER_ROOT, 'package.json'), 'utf8')
);

const vendorPkg = {
  name:         driverPkg.name,
  version:      driverPkg.version,
  description:  driverPkg.description,
  main:         driverPkg.main,
  types:        driverPkg.types,
  license:      driverPkg.license,
  engines:      driverPkg.engines,
  dependencies: driverPkg.dependencies,   // grpc-js, proto-loader, google-protobuf
};

fs.writeFileSync(
  path.join(VENDOR_ROOT, 'package.json'),
  JSON.stringify(vendorPkg, null, 2) + '\n'
);

console.log(`[vendor-driver] Done — copied dist/ to ${VENDOR_ROOT}`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
