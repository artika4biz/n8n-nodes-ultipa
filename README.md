# n8n Integration for Ultipa GQLDB graph database



An [n8n](https://n8n.io) community node package that connects n8n workflows to the **Ultipa Graph Database** via its GQL interface.

---

<img src="ultipa_n8n_project_logo.png" width="300" height="300" alt="Ultipa n8n Node"/>

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Upgrading to 0.2.0](#upgrading-to-020)
4. [Repository Layout](#repository-layout)
5. [Quick Start](#quick-start)
6. [Credential Configuration](#credential-configuration)
7. [Resources and Operations](#resources-and-operations)
   - [Query](#query)
   - [Node](#node)
   - [Edge](#edge)
   - [Graph](#graph)
   - [Schema](#schema)
   - [Admin](#admin)
8. [Output Shape](#output-shape)
9. [Developer Guide](#developer-guide)
   - [Project Structure](#project-structure)
   - [Building](#building)
   - [Tests](#tests)
   - [Key Design Decisions](#key-design-decisions)
   - [Adding a New Operation](#adding-a-new-operation)
   - [Adding a New Resource](#adding-a-new-resource)
10. [Driver Dependency Notes](#driver-dependency-notes)
11. [Release](#release)
12. [Troubleshooting](#troubleshooting)

---

## Overview

`n8n-nodes-ultipa` exposes **six resources** (Query, Node, Edge, Graph, Schema, Admin) each with multiple operations, covering the full surface area of the Ultipa GQLDB API:

| Resource | What it does |
|---|---|
| **Query** | Execute, explain, or profile arbitrary GQL queries |
| **Node** | Insert, delete, or stream-export graph nodes |
| **Edge** | Insert, delete, or stream-export graph edges |
| **Graph** | List, create, drop, use, truncate, rename graphs; get stats |
| **Schema** | Manage labels, properties, indexes, and fulltext indexes |
| **Admin** | Health checks, statistics, system metrics, cache, tasks, running queries |

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| n8n | ≥ 1.0.0 |
| `@ultipa-graph/ultipa-driver` | 6.x — built from `gqldb-drivers/nodejs` and vendored at pack time |
| Ultipa GQLDB server | any version that supports gRPC on port 9000 |

---

## Upgrading to 0.2.0

This release tracks the 6.x driver. Three changes affect existing workflows:

1. **`Node › Delete` and `Edge › Delete` return a different shape.** The driver
   replaced `deleteNodes()` / `deleteEdges()` with GQL-emitting calls that
   return a full query response. Output is now `{ columns, rows, rowsAffected, … }`
   with one row per deleted entity, instead of `{ deletedCount }`. Read
   `rowsAffected` where you read `deletedCount`.
2. **A delete with no IDs, no label and no WHERE clause is now refused** unless
   **Allow Delete All** is enabled. Previously such a step deleted the whole
   graph. This is a safety latch in the driver, not a behaviour this node adds.
3. **`Insert Mode › Overwrite` actually takes effect now.** It was silently
   ignored and every insert ran as a plain `INSERT`, so a duplicate `_id`
   failed instead of overwriting. If a workflow relied on that failure, note
   that `overwrite` **replaces** the entity and drops properties absent from
   the write — `upsert` is probably what you want.

`Node › Export` and `Edge › Export` keep their `{ nodes | edges, count }` keys
and gain `truncated` and `stats`. They also work again: they called RPCs the
server no longer serves.

---

## Repository Layout

This repository **is** the package — its root is `package.json`, not a
subfolder. The Ultipa driver lives in a separate repository
([ultipa/gqldb-drivers](https://github.com/ultipa/gqldb-drivers)) and is
compiled into `vendor/` at build time, so it is not part of this tree.

```
n8n-nodes-ultipa/                    ← repository root = this package
├── src/
│   ├── credentials/
│   │   └── UltipaApi.credentials.ts
│   └── nodes/Ultipa/
│       ├── Ultipa.node.ts           ← main node + execute() logic
│       ├── GenericFunctions.ts      ← connection helpers + serialisation
│       └── descriptions/            ← per-resource INodeProperties definitions
│           ├── QueryDescription.ts
│           ├── NodeDescription.ts
│           ├── EdgeDescription.ts
│           ├── GraphDescription.ts
│           ├── SchemaDescription.ts
│           └── AdminDescription.ts
├── tests/                           ← see "Tests"; plain Node, no framework
├── scripts/vendor-driver.js         ← copies the built driver into vendor/
├── package.json
└── tsconfig.json

generated, not in git:
├── dist/                            ← `npm run build` output; what n8n loads
└── vendor/ultipa-driver/            ← `npm run vendor` output; the driver's dist/
```

---

## Quick Start

This package depends on the Ultipa Node.js driver through
`file:./vendor/ultipa-driver`, and `vendor/` is **not** in the repository. The
driver therefore has to be built and copied in before `npm install` can resolve
anything. Clone it beside this repo:

```
<workspace>/
├── gqldb-drivers/        github.com/ultipa/gqldb-drivers
└── n8n-nodes-ultipa/     this repo
```

```bash
# 1. Build the driver (this package links to its compiled dist/)
cd ../gqldb-drivers/nodejs
npm install && npm run build

# 2. Copy the built driver into vendor/, then install
cd -                    # back to n8n-nodes-ultipa
npm run vendor          # must precede npm install: it creates vendor/
npm install
npm run build
npm test                # optional: 192 cases, no server needed

# 3. Install into your n8n instance's custom nodes directory
#    (typically ~/.n8n/custom or the path set via N8N_CUSTOM_EXTENSIONS)
npm install /absolute/path/to/n8n-nodes-ultipa

# 4. Restart n8n — the "Ultipa" node will appear in the node palette
```

`npm run vendor` searches upward from the package root for
`gqldb-drivers/nodejs`, so it works whether the driver is a direct sibling or a
level or two away in a wider workspace, and prints which checkout it used. If
it lives elsewhere, name it explicitly:

```bash
ULTIPA_DRIVER_ROOT=/path/to/gqldb-drivers/nodejs npm run vendor
```

---

## Credential Configuration

Create a new credential of type **Ultipa API** in n8n with the following fields:

| Field | Description | Default |
|---|---|---|
| **Host** | Server address as `host:port`. Use comma-separated values for multiple hosts: `host1:9000,host2:9000` | `localhost:9000` |
| **Username** | Database username | — |
| **Password** | Database password (stored encrypted) | — |
| **Default Graph** | Graph name automatically selected after login. Can be overridden per-node. | — |
| **Timeout (ms)** | Per-request query timeout in milliseconds | `30000` |
| **Use TLS** | Enable TLS/SSL for the gRPC connection | `false` |
| **Max Receive Size (MB)** | Largest gRPC message the client accepts. Raise it when large result sets or exports fail with a message-size error. `0` = driver default (64 MB) | `0` |
| **Connection Pool Size** | Connections kept per host. `0` = driver default (10) | `0` |
| **Health Check Interval (ms)** | How often the driver health-checks hosts. `0` = driver default (30000) | `0` |
| **Read Retry Count** | Retries for a **read-only** query while a fulltext index is still loading (engine code `5020`). Writes are never retried. `0` disables it. | `3` |
| **Read Retry Delay (ms)** | First wait before such a retry; doubles each attempt, capped at 2 s. `0` = driver default (100) | `0` |
| **Reject USE in Queries** | Reject queries whose leading keyword is `USE`, which would switch the session graph. Worth enabling when workflows interpolate expressions into GQL. **Defence-in-depth only** — it inspects query text and is not a tenant boundary; use per-tenant users and RBAC for that. | `false` |

The credential is consumed by `GenericFunctions.ts → getClient()`, which:
1. Splits the `host` field on commas to build the `hosts` array.
2. Creates a `GqldbClient` instance.
3. Calls `client.login(username, password)`.
4. If **Default Graph** is set, calls `client.useGraph(defaultGraph)`.

---

## Resources and Operations

### Query

Executes GQL against the database. Graph context is set per-call; an empty **Graph Name** field uses the credential's **Default Graph**.

#### Execute GQL

Run an arbitrary GQL statement and receive tabular results.

| Parameter | Type | Description |
|---|---|---|
| GQL Query | string | The GQL to execute |
| Graph Name | string | Override the active graph for this call |
| Query Parameters | JSON object | Named parameters passed with the query |
| Timeout (ms) | number | Per-query override (0 = credential default) |
| Read Only | boolean | Mark the query as read-only |
| Max Path Results | number | Cap returned paths (0 = unlimited) |

**Output shape:**
```json
{
  "columns": ["n"],
  "rows": [{ "n": { "id": "...", "labels": ["Person"], "properties": { "name": "Alice" } } }],
  "rowsAffected": 0,
  "hasMore": false,
  "rowCount": 1
}
```

The driver also reports these when the server sends them. Each key is **omitted**
rather than zero-filled when absent, because "absent" and "zero" differ:

| Key | Meaning |
|---|---|
| `warnings` | Server warnings explaining a partial or adjusted result |
| `currentGraph` | The session's graph after the statement ran (empty on an older server) |
| `timeCostNs` / `timeCostMs` | Server-side wall-clock time. Omitted when not reported — `0` would read as "took no time" |
| `diskCostNs` / `computeCostNs` | Storage and compute-engine portions of that time |
| `dmlStats` | Per-category counts (`insertedNodes`, `deletedEdges`, …). Absent means "not a data-modifying query", **not** "changed nothing" |

**Example GQL:**
```gql
MATCH (n:Person WHERE n.age > 30) RETURN n LIMIT 10
```

#### Explain

Returns the execution plan for a query without running it. Output: `{ "plan": "<plan string>" }`.

#### Profile

Executes the query with profiling enabled. Output: `{ "stats": "<profile string>" }`.

---

### Node

#### Insert

Inserts one or more nodes using the GQL `INSERT` statement.

| Parameter | Type | Description |
|---|---|---|
| Graph Name | string | Target graph |
| Nodes (JSON Array) | JSON | Array of `{ labels, properties, id? }` objects |
| Insert Mode | select | `normal`, `overwrite` or `upsert` — see below |

**Node object schema:**
```json
{
  "labels": ["Person"],
  "properties": { "name": "Alice", "age": 30 },
  "id": "alice-001"
}
```
`id` is optional. When provided it becomes the `_id` property in the GQL INSERT statement.

**Insert modes** — all three concern what happens on a duplicate `_id`:

| Mode | GQL | On a duplicate `_id` |
|---|---|---|
| `normal` | `INSERT` | Fails |
| `overwrite` | `INSERT OVERWRITE` | **Replaces** the entity wholesale — properties absent from this write are **lost** |
| `upsert` | `UPSERT` | **Merges** — properties absent from this write are preserved, those present overwrite. Falls back to a plain insert when no `_id` matches |

Choose `upsert` for partial updates, `overwrite` for a known-clean re-ingest of
an entity's full state.

#### Delete

Deletes nodes matched by ID list, or by label and/or WHERE clause. An ID list
takes precedence over the label/WHERE filter.

| Parameter | Type | Description |
|---|---|---|
| Graph Name | string | Target graph |
| Node IDs | string | Comma-separated IDs (e.g. `id1,id2`) |
| Labels | string | Comma-separated label names |
| Where Clause | string | Filter expression (e.g. `n.age > 50`) |
| Limit | number | Max nodes to delete (0 = no limit). Applies to the label/WHERE filter only |
| Return Deleted | boolean | Return the full data of each deleted node. Turn off on large bulk deletes to save bandwidth; `rowsAffected` is still reported. Default `true` |
| Allow Delete All | boolean | Safety latch. With no IDs, no label and no WHERE clause the operation would delete **every** node in the graph, and the driver refuses unless this is enabled. Default `false` |

Deleting nodes emits `DETACH DELETE`, so a node's edges go with it.

**Output:** The same shape as a query response — one row per deleted node under
column `n`, plus `rowsAffected`.

#### Export

Streams matching nodes from the graph and returns them as an array.

| Parameter | Type | Description |
|---|---|---|
| Graph Name | string | Source graph |
| Labels to Export | string | Comma-separated label filter (blank = all) |
| Limit | number | Max nodes to keep (0 = no limit). Applied **client-side** — see below |

**Output:**
```json
{
  "nodes": [...],
  "count": 3,
  "truncated": false,
  "stats": {
    "nodesExported": 3, "edgesExported": 0,
    "bytesWritten": 412, "durationMs": 7,
    "nodesExpected": 3, "edgesExpected": 0,
    "nodesSkipped": 0, "edgesSkipped": 0,
    "warnings": [],
    "completenessReported": true,
    "complete": true
  }
}
```

`stats` tells a complete export from one with gaps: `nodesSkipped` counts stored
records the server could not read, and `warnings` explains any shortfall. A
server too old to report completeness leaves those at `0`/empty, which is
indistinguishable from a clean export — `completenessReported: false` says so,
and `complete` is then omitted.

`truncated: true` means **Limit** cut the result short. The limit is applied
client-side: the underlying `Export` stream takes no limit, so a limit saves
memory but not time.

---

### Edge

#### Insert

Inserts edges using GQL `MATCH … INSERT`. Each edge is inserted individually via a MATCH on its source and destination node IDs.

| Parameter | Type | Description |
|---|---|---|
| Graph Name | string | Target graph |
| Edges (JSON Array) | JSON | Array of edge objects |
| Insert Mode | select | `normal`, `overwrite` or `upsert` — same semantics as [Node → Insert](#insert-1) |

**Edge object schema:**
```json
{
  "label": "KNOWS",
  "fromNodeId": "alice-001",
  "toNodeId": "bob-002",
  "properties": { "since": 2020 },
  "id": "knows-001"
}
```
`id` is optional and requires `EDGE_ID ENABLED` on the target graph.

#### Delete

Deletes edges by ID list, or by label and/or WHERE clause. An ID list takes
precedence over the label/WHERE filter.

| Parameter | Type | Description |
|---|---|---|
| Graph Name | string | Target graph |
| Edge IDs | string | Comma-separated IDs |
| Label | string | Edge label |
| Where Clause | string | Filter expression |
| Limit | number | Max edges to delete (0 = no limit). Applies to the label/WHERE filter only |
| Return Deleted | boolean | Return the full data of each deleted edge. Default `true` |
| Allow Delete All | boolean | Safety latch, as for nodes. Default `false` |

Deleting **by ID** requires `EDGE_ID ENABLED` on the graph. Without it the
server answers `[5017]` with an `ALTER GRAPH <g> SET EDGE_ID ENABLED` hint; the
driver deliberately does not fall back to `internal_id(e)`. Deleting by
label/WHERE has no such requirement.

**Output:** The same shape as a query response — one row per deleted edge under
column `e`, plus `rowsAffected`.

#### Export

Streams edges from the graph.

| Parameter | Type | Description |
|---|---|---|
| Graph Name | string | Source graph |
| Labels to Export | string | Comma-separated label filter |
| Limit | number | Max edges to keep (0 = no limit), applied client-side |

**Output:** `{ "edges": [...], "count": N, "truncated": false, "stats": { … } }` —
same `stats` and `truncated` semantics as [Node → Export](#export-1).

---

### Graph

| Operation | Key Parameters | Description |
|---|---|---|
| **List Graphs** | — | Returns all graphs with name, type, node/edge counts |
| **Get Info** | Graph Name | Returns details for a single graph |
| **Create** | Graph Name, Graph Type, Description, Create If Not Exists | Creates a new graph; type: `open`, `closed`, `ontology` |
| **Drop** | Graph Name, Drop If Exists | Deletes a graph and all its data |
| **Use** | Graph Name | Sets the active graph for the client session |
| **Truncate** | Graph Name | Removes all data while keeping schema |
| **Rename** | Graph Name, New Name | Renames a graph |
| **Stats** | Graph Name | Returns node/edge counts via `db.stats()` |

**Create output:**
```json
{ "created": true, "graphName": "my_graph" }
```
When **Create If Not Exists** is enabled, `created` is `false` if the graph already existed.

---

### Schema

Schema operations apply to the **current graph**. Set **Graph Name** to switch context before applying the operation.

#### Label Operations

| Operation | Parameters | Description |
|---|---|---|
| Show Labels | Graph Name | Lists all node and edge labels |
| Show Node Types | Graph Name | Lists node labels with their property definitions |
| Show Edge Types | Graph Name | Lists edge labels with their property definitions |
| Create Node Label | Label Name, Properties JSON | Creates a node label with optional properties |
| Create Edge Label | Label Name, Properties JSON | Creates an edge label with optional properties |
| Drop Node Label | Label Name | Removes a node label |
| Drop Edge Label | Label Name | Removes an edge label |

**Properties JSON array format:**
```json
[
  { "name": "name",  "type": "STRING" },
  { "name": "age",   "type": "INT64"  },
  { "name": "score", "type": "DOUBLE" }
]
```

Supported GQL type strings: `STRING`, `INT32`, `INT64`, `UINT32`, `UINT64`, `FLOAT`, `DOUBLE`, `BOOL`, `TIMESTAMP`, `DATE`, `TEXT`, `BLOB`, `POINT`, `DECIMAL`.

#### Property Operations

| Operation | Parameters | Description |
|---|---|---|
| Create Node Property | Label Name, Properties JSON | Adds properties to a node label |
| Create Edge Property | Label Name, Properties JSON | Adds properties to an edge label |
| Drop Node Property | Label Name, Property Names (CSV) | Removes properties from a node label |
| Drop Edge Property | Label Name, Property Names (CSV) | Removes properties from an edge label |

#### Index Operations

| Operation | Parameters | Description |
|---|---|---|
| Show Index | Graph Name | Lists all indexes |
| Create Node Index | Index Name, Label Name, Index Properties JSON | Creates a node property index |
| Create Edge Index | Index Name, Label Name, Index Properties JSON | Creates an edge property index |
| Drop Node Index | Index Name | Drops a node index |
| Drop Edge Index | Index Name | Drops an edge index |

**Index Properties JSON:**
```json
[
  { "name": "name" },
  { "name": "email", "prefixLength": 20 }
]
```
`prefixLength` applies only to `STRING` properties and creates a prefix index.

#### Fulltext Index Operations

| Operation | Parameters | Description |
|---|---|---|
| Show Fulltext | Graph Name | Lists all fulltext indexes |
| Create Node Fulltext | Index Name, Label Name, Fulltext Properties (CSV) | Creates a node fulltext index |
| Create Edge Fulltext | Index Name, Label Name, Fulltext Properties (CSV) | Creates an edge fulltext index |
| Drop Node Fulltext | Index Name | Drops a node fulltext index |
| Drop Edge Fulltext | Index Name | Drops an edge fulltext index |

---

### Admin

| Operation | Key Parameters | Description |
|---|---|---|
| **Health Check** | Service Name | Returns health status (`SERVING`, `NOT_SERVING`, etc.) |
| **Get Statistics** | Graph Name | Node/edge counts and label statistics |
| **Get System Metrics** | — | CPU, memory, disk I/O, storage, network metrics |
| **Get Cache Stats** | Cache Type | AST/plan cache hit rates, sizes, evictions |
| **Clear Cache** | Cache Type | Flushes the specified cache (`all`, `ast`, `plan`) |
| **Compact** | — | Triggers manual storage compaction |
| **Warmup Parser** | Parser Count | Pre-allocates parser instances for faster first queries |
| **Show Tasks** | — | Lists all background tasks in the current graph |
| **Stop Task** | Task ID | Stops a running background task |
| **Delete Task** | Task ID | Deletes a completed or stopped task record |
| **List Running Queries (Top)** | — | Returns currently executing queries |
| **Kill Query** | Query ID | Terminates a running query by ID |
| **List Transactions** | — | Returns all active transactions |
| **Ping** | — | Round-trip latency check; returns `{ latencyNs, latencyMs }` |

---

## Output Shape

Every operation produces one n8n item per input item. The `json` field of each output item contains the operation result.

### GQL Response (Query › Execute)

```json
{
  "columns": ["n", "r"],
  "rows": [
    {
      "n": { "id": "1", "labels": ["Person"], "properties": { "name": "Alice" } },
      "r": { "id": "10", "label": "KNOWS", "fromNodeId": "1", "toNodeId": "2", "properties": {} }
    }
  ],
  "rowsAffected": 0,
  "hasMore": false,
  "rowCount": 1
}
```

`BigInt` values are serialised to strings. Nested node, edge, and path objects are recursively flattened to plain JSON.

### Error Handling

If **Continue On Fail** is enabled on the node, errors are caught and returned
as an item rather than stopping the workflow. When disabled (default), the
workflow stops and the error is surfaced in n8n's execution log.

A driver error carries more than a message, and all of it is passed through:

```json
{
  "error": "fulltext index is still loading",
  "errorType": "QueryFailedError",
  "code": 9,
  "engineCode": 5020,
  "reason": "FULLTEXT_INDEX_LOADING"
}
```

| Key | Meaning |
|---|---|
| `code` | The **gRPC status** (16 UNAUTHENTICATED, 14 UNAVAILABLE, 9 FAILED_PRECONDITION, …). For a write conflict it is `3011` |
| `engineCode` | The **engine's own** code from the server's structured detail, e.g. `5020`. Omitted when the server attached none (older server, or an error the driver raised itself) |
| `reason` | The server's stable reason name, e.g. `FULLTEXT_INDEX_LOADING`. Omitted when absent |

Branch on `engineCode` / `reason` rather than on message text — the codes are
stable, the wording is not. Note that `code` and `engineCode` are **different
numbers**: driver 6.x keeps the gRPC status on `code` and moved the engine code
to `engineCode`.

---

## Developer Guide

### Project Structure

```
src/
├── credentials/
│   └── UltipaApi.credentials.ts    ICredentialType — connection + driver tuning fields
└── nodes/Ultipa/
    ├── Ultipa.node.ts              INodeType — description + execute()
    ├── GenericFunctions.ts         Connection + serialisation helpers
    └── descriptions/               INodeProperties split per resource
        ├── QueryDescription.ts     queryOperations, queryFields
        ├── NodeDescription.ts      nodeOperations, nodeFields
        ├── EdgeDescription.ts      edgeOperations, edgeFields
        ├── GraphDescription.ts     graphOperations, graphFields
        ├── SchemaDescription.ts    schemaOperations, schemaFields
        └── AdminDescription.ts     adminOperations, adminFields

tests/                              see "Tests" below — plain Node, no framework
├── run.js                          runner: node tests/run.js [suite-filter]
├── harness.js                      assertions (incl. absent/present)
├── helpers/stubs.js                recording client + fake IExecuteFunctions
├── driver-contract.test.js         the driver API this package is pinned to
├── node-dispatch.test.js           what execute() asks the driver to do
├── export.test.js                  JSON Lines reassembly + completeness
├── response.test.js                response/error mapping
└── credentials-and-ui.test.js      buildConfig + n8n descriptions
```

Each description file exports two arrays:
- `*Operations` — the `operation` options dropdown, displayed only for its resource.
- `*Fields` — all parameters for those operations, each guarded by `displayOptions.show`.

`Ultipa.node.ts` spreads all six pairs into `description.properties`. The `execute()` method dispatches on `resource` then `operation`, reading parameters with `this.getNodeParameter()`.

### Building

```bash
# Full rebuild (driver → vendor → n8n node), from n8n-nodes-ultipa/
(cd ../gqldb-drivers/nodejs && npm install && npm run build)
npm run vendor && npm install && npm run build

# Watch mode during development
npm run dev
```

Re-run `npm run vendor` after every driver rebuild. `npm pack` does so
automatically via `prepack`, but a plain `npm run build` does not, so a stale
`vendor/` is the usual reason a driver change seems to have no effect.

### Local Development (zero-install workflow)

For a locally installed n8n (via `npm install -g n8n`), symlink the package into `~/.n8n/custom` once — n8n loads it automatically on every restart, no tgz or reinstall needed:

```bash
mkdir -p ~/.n8n/custom
ln -sf /absolute/path/to/n8n-nodes-ultipa ~/.n8n/custom/n8n-nodes-ultipa
```

After that, the full iteration cycle is:

```bash
# 1. Make your changes in src/
npm run build        # at the repository root
# 2. Restart n8n — the updated node is live
```

The `build` script:
1. Runs `tsc` — compiles `src/` → `dist/`.
2. Runs `copy-icons` — copies `src/nodes/Ultipa/ultipa.svg` to `dist/nodes/Ultipa/`.

### Tests

```bash
npm test                  # builds, then runs every suite
node tests/run.js export   # one suite, against the current dist/
```

No test framework is installed and none is needed — `tests/run.js` is a plain
Node runner, so the suite costs nothing to run in CI. It needs no database:
every suite works against the vendored driver and stub clients.

| Suite | Guards |
|---|---|
| `driver-contract` | The driver API this package is pinned to — method existence, `InsertType` members, the error model, and which types are still un-exported |
| `node-dispatch` | What `execute()` actually asks the driver to do, via a recording client |
| `export` | JSON Lines reassembly across chunk boundaries, the client-side limit, and completeness reporting |
| `response` | `responseToJson` / `serializeValue` / `errorToJson`, especially absent-vs-zero fields |
| `credentials-and-ui` | `buildConfig` mapping and the n8n property descriptions |

**Why these exist.** A clean `tsc` is weak evidence against driver drift. The
April 2026 build compiled perfectly while three things were broken: a removed
method, an enum that had gained a member, and a parameter that had changed from
an enum to a config object. Each failure mode now has a test, and each was
verified by reintroducing the bug and watching the suite go red.

Two suites are worth understanding before you change them:

- **`driver-contract` fails when the driver moves, which is the point.** A red
  test here means "go reconcile", not "the test is wrong". It also asserts that
  `deleteNodes` / `deleteEdges` stay *absent* and that the mirrored types stay
  un-exported, so either changing is noticed rather than silently depended on.
- **`node-dispatch` asserts on the call, not the result.** It patches
  `getClient` to return a recording proxy, so every dispatch decision in
  `execute()` runs for real. This is the layer where a wrong argument is
  invisible: the broken insert mode type-checked, ran, and quietly wrote the
  wrong thing.

**What they do not cover.** Everything runs against stubs, so nothing here
proves the server behaves as expected. In particular the export's JSON Lines
*record schema* is server-defined and unverified — the parser is deliberately
tolerant and returns unparseable lines under `malformed`. After a driver or
server upgrade, still run a real `Query › Execute GQL` and `Node › Export`.

### Key Design Decisions

**Connection lifecycle per execution**

The driver does not maintain a persistent connection pool across n8n node executions. `getClient()` creates a new `GqldbClient`, logs in, and optionally calls `useGraph()` on every trigger. `closeClient()` runs in the `finally` block to guarantee cleanup. This is the correct pattern for stateless workflow nodes.

**Single client for all input items**

The client is created once at the top of `execute()`, then reused across all input items in the batch. This avoids repeated TCP + TLS handshakes when a workflow sends many items to the same node.

**Driver convenience types not re-exported**

`InsertType` **is** exported from the driver's public API as of 6.x and is
imported from the package — never redeclared. Redeclaring it was actively
unsafe once the driver added a third member (`Upsert = 2`): a local
`const enum { Normal, Overwrite }` still compiled and silently could not
express the new mode.

What is still not re-exported, and so is mirrored locally, is listed under
[Driver Dependency Notes](#driver-dependency-notes). A mirrored type is a
liability: nothing checks it against the driver, so changes there are silent.

**Per-call `graphName` over `useGraph()`**

Schema and graph-statistics operations pass `{ graphName }` in the per-call
config instead of calling `client.useGraph()` first. One client is shared
across a batch, so switching the session graph would leak across items that
address different graphs. The driver documents a per-call config as the
thread-safe way to target a graph. `Graph › Use` still calls `useGraph()` —
switching the session graph is that operation's purpose.

**JSON-safe serialisation**

`serializeValue()` in `GenericFunctions.ts` recursively walks any value and converts `BigInt` to string, so query results containing large integer IDs are safely passed through n8n's JSON pipeline without loss.

**`displayOptions.show` guards**

Every field in a description file declares the exact `resource` and `operation` values under which it is shown. This prevents unrelated parameters from appearing in the n8n UI and avoids accidental parameter collisions across resources.

### Adding a New Operation

**Step 1 — Add the option to the operations dropdown** in the relevant `descriptions/*Description.ts`:

```typescript
// descriptions/NodeDescription.ts
export const nodeOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    // ...
    options: [
      // existing options …
      {
        name: 'Upsert',
        value: 'upsert',
        description: 'Insert or update a node by ID',
        action: 'Upsert a node',
      },
    ],
  },
];
```

**Step 2 — Add the parameter fields** to the `*Fields` array in the same file:

```typescript
export const nodeFields: INodeProperties[] = [
  // existing fields …
  {
    displayName: 'Node ID',
    name: 'upsertId',
    type: 'string',
    required: true,
    default: '',
    description: 'ID of the node to upsert',
    displayOptions: { show: { resource: ['node'], operation: ['upsert'] } },
  },
];
```

**Step 3 — Handle the operation in `execute()`** inside `Ultipa.node.ts`:

```typescript
// inside: } else if (resource === 'node') {
} else if (operation === 'upsert') {
  const nodeId = this.getNodeParameter('upsertId', i) as string;
  // call the appropriate driver method …
  result = { upserted: true, nodeId };
}
```

**Step 4 — Rebuild:**

```bash
npm run build
```

### Adding a New Resource

1. Create `src/nodes/Ultipa/descriptions/MyResource.ts` exporting `myResourceOperations` and `myResourceFields`.
2. Import both arrays in `Ultipa.node.ts` and spread them into `description.properties`.
3. Add the resource option to the **Resource** selector dropdown in `Ultipa.node.ts`.
4. Add a new `else if (resource === 'myResource')` block in `execute()`.

---

## Driver Dependency Notes

The `@ultipa-graph/ultipa-driver` package is vendored at build time. The `prepack` script runs `scripts/vendor-driver.js`, which copies only the compiled `nodejs/dist/` into `vendor/ultipa-driver/`. The package then declares a local file dependency on that copy:

```json
"dependencies": {
  "@ultipa-graph/ultipa-driver": "file:./vendor/ultipa-driver"
},
"bundledDependencies": ["@ultipa-graph/ultipa-driver"]
```

This means:
- **No TypeScript source** from the driver is ever included in the published tarball.
- The `nodejs/dist/` folder must exist before running `npm pack`. Always run `npm run build` in `nodejs/` first.

If you update the driver source, rebuild it and then repack this package:

```bash
cd nodejs && npm run build
cd ../n8n-nodes-ultipa && npm run build && npm pack
```

**Types not exported from the driver's public API**

The following types are used internally by the driver but not re-exported from its `index.ts`:

| Type | Location in driver | How this package handles it |
|---|---|---|
| `ConvPropertyDef` | `src/types/convenience.ts` | Mirrored as `interface { name: string; type: string }` in `Ultipa.node.ts` |
| `IndexProperty` | `src/types/convenience.ts` | Mirrored as `interface { name: string; prefixLength?: number }` in `Ultipa.node.ts` |
| `ExportConfig` | `src/response.ts` | Mirrored in `GenericFunctions.ts` — it is the parameter type of the public `client.export()` |
| `ExportChunk`, `ExportStats` | `src/response.ts` | Mirrored in `GenericFunctions.ts` — the callback and stats types of `client.export()` |
| `DBType` | `src/types/convenience.ts` | Not needed in this package's current implementation |

`InsertType` is **no longer** in this table: the driver exports it, and it is
imported rather than mirrored.

A mirrored type is only structurally checked, so a change to its shape in the
driver produces no error here. After a driver update, diff these against the
driver source. The highest-risk case is an **enum gaining a member**, which a
mirrored copy cannot express and the compiler cannot flag.

**Checked at build time instead**

These are imported from the driver, so `npm run build` catches any change:
`GqldbClient`, `GqldbConfig`, `QueryConfig`, `InsertConfig`, `DeleteConfig`,
`InsertType`, `GraphType`, `CacheType`, `NodeData`, `EdgeData`, `Response`,
`GqldbError`.

**Not checked anywhere**

`responseToJson()` reads `Response` fields by name and `collectExport()` parses
the export's JSON Lines records. A change to either shape produces wrong or
empty output at runtime with no build error. After a driver update, run a
`Query › Execute GQL` and a `Node › Export` and confirm the output is
populated.

---

## Release

This section covers how to produce a deployment-ready package that contains **no TypeScript source code** — only compiled JavaScript.

### What gets packaged

| Included | Excluded |
|---|---|
| `dist/` — compiled JS for the n8n node | `src/` — TypeScript source |
| `vendor/ultipa-driver/dist/` — compiled JS for the driver | `nodejs/src/` — driver TypeScript source |
| Bundled runtime deps (gRPC, proto-loader, protobufjs, …) | `node_modules/` root folder |
| `package.json` | `tests/`, `scripts/`, `*.ts` files |

The `vendor/` folder is populated automatically before packing by `scripts/vendor-driver.js`, which copies only the built `dist/` of the sibling driver — not its source.

### Step-by-step

**1. Build the driver** (must be done first — the vendor script reads its `dist/`)

```bash
cd ../gqldb-drivers/nodejs
npm install
npm run build
```

**2. Build the n8n node**

```bash
cd -                    # back to the repository root
npm install
npm run build
```

**3. Pack**

```bash
npm pack
```

`npm pack` automatically runs `prepack` → `vendor` before creating the archive. The output file is created in the same directory:

```
./n8n-nodes-ultipa-0.2.0.tgz
```

To bump the version before packing, edit the `version` field in `package.json` first.

### Installing on the n8n server

Copy the `.tgz` file to the n8n server.

#### systemd / pm2

```bash
# Choose the custom nodes directory — typically one of:
#   ~/.n8n/custom   or   /home/<user>/.n8n/custom-nodes
cd /home/<user>/.n8n/custom-nodes

# Install — --legacy-peer-deps prevents npm from pulling in n8n-workflow
# and its heavy transitive deps (isolated-vm, etc.) which n8n already provides
npm install --legacy-peer-deps /path/to/n8n-nodes-ultipa-0.2.0.tgz

# Restart n8n
sudo systemctl restart n8n   # systemd
pm2 restart n8n              # pm2
```

#### Docker

The custom nodes directory must be inside the volume that is mounted into the container, and the `N8N_CUSTOM_EXTENSIONS` environment variable must point to it **inside the container**.

```bash
# 1. Install the package on the host into the mounted volume
cd /home/<user>/.n8n/custom-nodes
npm install --legacy-peer-deps /path/to/n8n-nodes-ultipa-0.2.0.tgz

# 2. Recreate the container with N8N_CUSTOM_EXTENSIONS set
#    (docker restart does NOT pick up new environment variables)
docker stop n8n && docker rm n8n
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -v /home/<user>/.n8n:/home/node/.n8n \
  -e N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom-nodes \
  n8nio/n8n
```

> **Note:** The volume maps the host path (`/home/<user>/.n8n`) to the container path (`/home/node/.n8n`). `N8N_CUSTOM_EXTENSIONS` must use the **container-side** path.

The **Ultipa** node will appear in the n8n node palette under the **Transform** group after restart.

---

## Troubleshooting

**Node does not appear in n8n**

- Confirm `dist/` was generated (`npm run build` completed without errors).
- Verify the `n8n.nodes` path in `package.json` points to the correct compiled file: `dist/nodes/Ultipa/Ultipa.node.js`.
- Restart n8n after installing.

**`Login failed` error at runtime**

- Check the **Host** credential field — it must include the port (`localhost:9000`).
- Verify the username and password.
- If using TLS, ensure **Use TLS** is enabled and the server certificate is trusted.

**`Cannot connect to host` / gRPC errors**

- Confirm the Ultipa server is running and reachable from the n8n host.
- Check firewalls and network routing on port 9000.
- For multi-host setups, all hosts in the comma-separated list must be reachable.

**`ECONNREFUSED 127.0.0.1:...` when n8n runs in Docker**

`localhost` inside a Docker container refers to the container itself, not the host machine. If the Ultipa server runs on the Docker host, use `host.docker.internal` as the hostname instead of `localhost`, and add `--add-host=host.docker.internal:host-gateway` to the `docker run` command (required on Linux):

```bash
docker run -d \
  --name n8n \
  -p 5678:5678 \
  --add-host=host.docker.internal:host-gateway \
  -v /home/<user>/.n8n:/home/node/.n8n \
  -e N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom-nodes \
  n8nio/n8n
```

Then set the **Host** credential field to `host.docker.internal:<port>`.

**Credential "test" shows "Invalid URL"**

The Ultipa credential uses a gRPC host (`host:port`), not an HTTP URL. There is no HTTP test endpoint — credentials are validated on first use when a workflow runs. Ignore any "test connection" prompt, or save the credential directly.

**`Unknown operation` error**

This means `execute()` received a `resource`/`operation` combination that has no handler. This should not happen with the UI, but can occur if the node JSON is edited manually. Check that both the `displayOptions` in the description file and the `if/else` chain in `execute()` use identical string values.

**BigInt serialisation**

Ultipa returns some IDs and counters as 64-bit integers. The driver converts these to JavaScript `BigInt`. The `serializeValue()` function in `GenericFunctions.ts` stringifies `BigInt` values automatically so they pass through n8n's JSON pipeline without throwing `TypeError: Do not know how to serialize a BigInt`.
