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

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const VENDOR_ROOT  = path.join(PACKAGE_ROOT, 'vendor/ultipa-driver');
const VENDOR_DIST  = path.join(VENDOR_ROOT, 'dist');

/** How far up to look for the driver before giving up. */
const MAX_LEVELS = 5;

/**
 * Locate the driver checkout.
 *
 * $ULTIPA_DRIVER_ROOT wins when set. Otherwise walk up from the package root
 * looking for gqldb-drivers/nodejs, which finds it whether this package sits
 * directly beside the driver (a fresh clone) or a level or two deeper inside a
 * workspace. A fixed relative depth cannot cover both, and the absolute path
 * this once hardcoded covered only the machine it was written on.
 */
function findDriverRoot() {
  if (process.env.ULTIPA_DRIVER_ROOT) {
    return { root: path.resolve(process.env.ULTIPA_DRIVER_ROOT), from: '$ULTIPA_DRIVER_ROOT' };
  }

  let dir = PACKAGE_ROOT;
  const tried = [];
  for (let level = 0; level < MAX_LEVELS; level++) {
    const candidate = path.join(dir, 'gqldb-drivers', 'nodejs');
    tried.push(candidate);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return { root: candidate, from: 'found beside the package' };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // hit the filesystem root
    dir = parent;
  }
  return { root: null, tried };
}

const found = findDriverRoot();

// ── Guards ────────────────────────────────────────────────────────────────────

if (!found.root) {
  console.error(
    '\n[vendor-driver] ERROR: no gqldb-drivers/nodejs checkout found.\n\n'
    + 'Looked in:\n'
    + found.tried.map((p) => `  ${p}\n`).join('')
    + '\nPoint $ULTIPA_DRIVER_ROOT at your checkout:\n'
    + '  ULTIPA_DRIVER_ROOT=/path/to/gqldb-drivers/nodejs npm run vendor\n'
  );
  process.exit(1);
}

const DRIVER_ROOT = found.root;
const DRIVER_DIST = path.join(DRIVER_ROOT, 'dist');

if (!fs.existsSync(DRIVER_ROOT)) {
  console.error(
    `\n[vendor-driver] ERROR: no driver checkout at\n  ${DRIVER_ROOT}\n`
    + `That path came from ${found.from}.\n`
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

console.log(`[vendor-driver] driver: ${DRIVER_ROOT} (${found.from})`);

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
