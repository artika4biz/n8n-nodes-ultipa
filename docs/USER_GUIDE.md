# Ultipa for n8n — User Guide

A practical guide to using the Ultipa graph database from your n8n workflows.
No programming required: everything here is done in the n8n editor.

> **One node, not many.** The connector installs a single node called
> **Ultipa**. Inside it you pick a **Resource** (what kind of thing you are
> working with) and then an **Operation** (what to do with it) — 6 resources
> and 52 operations in total. So "which Ultipa node do I use?" is really
> "which resource and operation do I pick?", and that is what this guide
> answers.

---

## Contents

1. [Before you start](#before-you-start)
2. [Step 1 — Connect to your database](#step-1--connect-to-your-database)
3. [Step 2 — Add the node to a workflow](#step-2--add-the-node-to-a-workflow)
4. [Reading what comes back](#reading-what-comes-back)
5. [Resource: Query](#resource-query) — run GQL
6. [Resource: Node](#resource-node) — add, remove, extract nodes
7. [Resource: Edge](#resource-edge) — add, remove, extract relationships
8. [Resource: Graph](#resource-graph) — manage whole graphs
9. [Resource: Schema](#resource-schema) — labels, properties, indexes
10. [Resource: Admin](#resource-admin) — health, metrics, running queries
11. [Three things that can bite you](#three-things-that-can-bite-you)
12. [When something goes wrong](#when-something-goes-wrong)
13. [Common recipes](#common-recipes)
14. [Troubleshooting](#troubleshooting)

---

## Before you start

You need:

- An **n8n instance** with the Ultipa connector installed (ask whoever
  administers your n8n if the **Ultipa** node does not appear in the node
  palette).
- An **Ultipa server address**, usually in the form `hostname:9000`.
- A **username and password** for that server.
- The **name of the graph** you will be working with. If you do not know it,
  the `Graph › List Graphs` operation will tell you.

A note on vocabulary, in case graph databases are new to you:

| Term | What it means |
|---|---|
| **Graph** | A self-contained database. Like a schema in SQL. |
| **Node** | One record — a person, a product, an account. |
| **Edge** | A relationship between two nodes — *knows*, *bought*, *belongs to*. |
| **Label** | The type of a node or edge, e.g. `Person`, `KNOWS`. |
| **Property** | A field on a node or edge, e.g. `name`, `age`. |
| **GQL** | The query language, an ISO standard. Similar in spirit to SQL. |
| **`_id`** | The unique identifier of a node or edge. |

---

## Step 1 — Connect to your database

In n8n go to **Credentials → New → Ultipa API** and fill in the first four
fields. Everything below them has a sensible default and can be left alone.

### The fields you need

| Field | What to put in it |
|---|---|
| **Host** | `hostname:9000`. For a cluster, list several separated by commas: `host1:9000,host2:9000`. |
| **Username** | Your database user. |
| **Password** | Your password. Stored encrypted by n8n and never shown again. |
| **Default Graph** | The graph to use when a node does not name one. Optional but recommended — it saves typing the graph name in every step. |

### The fields you can usually ignore

Leave these as they are unless you hit the specific problem described.

| Field | Default | Change it when… |
|---|---|---|
| **Timeout (ms)** | `30000` | Your queries legitimately take longer than 30 seconds. |
| **Use TLS** | off | Your server requires an encrypted connection. |
| **Max Receive Size (MB)** | `0` (= 64 MB) | A large query or export fails complaining about message size. Try `256`. |
| **Connection Pool Size** | `0` (= 10) | Advised to by your database administrator. |
| **Health Check Interval (ms)** | `0` (= 30000) | Advised to by your database administrator. |
| **Read Retry Count** | `3` | You want to switch off the automatic retry described below. |
| **Read Retry Delay (ms)** | `0` (= 100) | Advised to by your database administrator. |
| **Reject USE in Queries** | off | See the security note below. |

**About Read Retry.** When a full-text index is still loading, the server
temporarily refuses reads. Rather than failing your workflow, the connector
waits and tries again, up to 3 times. This only ever applies to queries you
have marked **Read Only** — a write is never retried, so nothing can be
applied twice.

**Security note — Reject USE in Queries.** Turn this on if your workflow builds
query text out of data that comes from somewhere else (a form, a webhook, an
email). It blocks queries that begin with `USE`, which would switch to a
different graph. Treat it as a seatbelt, not a lock: it inspects query text and
is not a substitute for giving each user their own database account with the
right permissions.

### Check it works

Add an Ultipa node, choose **Resource: Admin → Operation: Ping**, and click
**Execute step**. A round-trip time means you are connected.

---

## Step 2 — Add the node to a workflow

1. Click **+** in the editor and search for **Ultipa**.
2. Pick your credential.
3. Pick a **Resource** — *Query, Node, Edge, Graph, Schema* or *Admin*.
4. Pick an **Operation** — the list changes to suit the resource.
5. Fill in the fields that appear, and run the step.

The node shows `resource: operation` under its name on the canvas, so you can
read a workflow at a glance without opening each step.

### How items flow through

The node runs **once per incoming item** and produces **one output item for
each**. So 50 items arriving at an Ultipa node means 50 operations and 50
results, in the same order.

This is what makes the node useful in a loop: feed it 50 rows from a
spreadsheet and set *Graph Name* to an expression, and each row can go to a
different graph.

---

## Reading what comes back

Most operations return the same shape — a **result table**, the same thing you
would get from running a query by hand:

```json
{
  "columns": ["n"],
  "rows": [
    { "n": { "_id": "alice-001", "labels": ["Person"],
             "properties": { "name": "Alice", "age": 30 } } }
  ],
  "rowCount": 1,
  "rowsAffected": 0,
  "hasMore": false
}
```

| Field | Meaning |
|---|---|
| `columns` | The column names your query returned. |
| `rows` | One entry per result row, keyed by column name. |
| `rowCount` | How many rows came back. |
| `rowsAffected` | How many records were created, changed or deleted. `0` for a read. |
| `hasMore` | `true` if the server has more results than it sent. |

Some extra fields appear **only when the server reports them**. If a field is
missing, that means "not reported" — which is not the same as zero:

| Field | Meaning |
|---|---|
| `warnings` | The server has something to tell you about this result. **Worth checking.** |
| `currentGraph` | Which graph was active when the statement ran. |
| `timeCostMs` / `timeCostNs` | How long the server itself took. Excludes network time. |
| `dmlStats` | A breakdown of what changed: `insertedNodes`, `deletedEdges`, and so on. Absent means the operation was not a write at all. |

To use a value in a later step, reference it the usual n8n way, for example
`{{ $json.rows[0].n.properties.name }}`.

Operations that are not queries return something simpler and self-explanatory —
each is described in its own section below.

---

## Resource: Query

Run GQL directly. This is the most flexible resource and the one most workflows
spend their time in.

### Execute GQL

Runs a query and returns its results.

| Field | Notes |
|---|---|
| **GQL Query** | The statement to run. Required. |
| **Graph Name** | Which graph to run against. Leave blank to use the credential's Default Graph. |
| **Query Parameters (JSON)** | Values to inject into the query. **Use this** — see below. |
| **Timeout (ms)** | Override the credential timeout for this one query. `0` = use the credential's. |
| **Read Only** | Tick for queries that do not write. Enables the automatic retry. |
| **Max Path Results** | Cap how many paths a path-finding query returns. `0` = no cap. |

**Always use Query Parameters for values that come from your data.** Write the
query with placeholders and pass the values separately:

```
GQL Query:          MATCH (n:Person WHERE n.age > $minAge) RETURN n
Query Parameters:   { "minAge": 30 }
```

Pasting values straight into the query text instead — by building the string
with an expression — invites two problems: a name containing an apostrophe
breaks the query, and text that arrives from outside your workflow can change
what the query does. Parameters avoid both.

### Explain

Returns the server's execution plan **without running the query**. Use it to
understand why something is slow, or to check a query is safe before running
it. Returns `{ "plan": "..." }`.

### Profile

Runs the query **and** returns timing statistics. Use it to measure a slow
query rather than guess. Returns `{ "stats": "..." }`.

---

## Resource: Node

Add, remove and extract nodes. **Graph Name is required** for all three
operations.

### Insert

Adds one or more nodes.

| Field | Notes |
|---|---|
| **Graph Name** | Required. |
| **Nodes (JSON Array)** | The nodes to add. |
| **Insert Mode** | What to do if a node already exists — see the table below. |

```json
[
  { "labels": ["Person"], "properties": { "name": "Alice", "age": 30 } },
  { "labels": ["Person"], "properties": { "name": "Bob" }, "id": "bob-002" }
]
```

`labels` and `properties` are required; `id` is optional and becomes the node's
`_id` when you want to choose it yourself rather than let the server generate
one.

**Insert Mode** decides what happens when a node with the same `_id` already
exists. The difference between the last two matters:

| Mode | If the `_id` already exists |
|---|---|
| **Normal** | Fails. Use when a duplicate means something is wrong. |
| **Overwrite** | **Replaces** the node. Properties you did not include are **deleted**. |
| **Upsert** | **Merges** into the node. Properties you did not include are kept; the ones you did include are updated. Inserts normally when there is no match. |

Pick **Upsert** for partial updates — syncing a changed email address, for
instance. Pick **Overwrite** only when you are deliberately rewriting the
node's full state and want leftover fields gone.

### Delete

Removes nodes, in one of two ways.

| Field | Notes |
|---|---|
| **Graph Name** | Required. |
| **Node IDs** | Comma-separated `_id` values. |
| **Labels** | Comma-separated labels, e.g. `Person,Company`. |
| **Where Clause** | A filter, e.g. `n.age > 65`. |
| **Limit** | Most nodes to delete. `0` = no limit. Applies to the Labels/Where filter only. |
| **Return Deleted** | On by default, returns the full data of everything deleted. Turn **off** for big deletions to save bandwidth — you still get the count. |
| **Allow Delete All** | Safety latch, off by default. See below. |

If you fill in **Node IDs**, those are deleted and the Labels/Where fields are
ignored. Otherwise the Labels and Where Clause are combined into a filter.

**Deleting a node also deletes its edges.** A node cannot keep a relationship
to something that no longer exists, so the edges go with it. There is no
separate step and no warning.

**The safety latch.** With no IDs, no labels *and* no Where Clause, the
operation would match every node in the graph. The connector refuses unless you
explicitly tick **Allow Delete All**. If you see that error, it has just saved
you — check your filter is actually filled in before overriding it.

Returns a result table with one row per deleted node, plus `rowsAffected`.

### Export

Streams nodes out of the graph, for backup or for moving data elsewhere.

| Field | Notes |
|---|---|
| **Graph Name** | Required. |
| **Labels to Export** | Comma-separated label filter. Blank = everything. |
| **Limit** | Most nodes to keep. `0` = no limit. See the caveat below. |

```json
{
  "nodes": [ /* … */ ],
  "count": 1200,
  "truncated": false,
  "stats": {
    "nodesExported": 1200,
    "nodesExpected": 1200,
    "nodesSkipped": 0,
    "warnings": [],
    "completenessReported": true,
    "complete": true
  }
}
```

**Check `stats` before trusting an export.** This is the point of it:

- `complete: true` — the server confirmed the export is whole.
- `complete: false` — something is missing. `nodesSkipped` counts records the
  server could not read, and `warnings` explains the gap. **Do not treat this
  as a good backup.**
- `completenessReported: false` — the server is too old to report completeness,
  so `complete` is omitted rather than guessed. The export may well be fine;
  it simply cannot be confirmed.

**About Limit.** It is applied after the data arrives, not by the server. The
server still streams the whole export; `truncated: true` tells you the result
was cut. So Limit saves memory, not time. For a quick peek at a large graph, a
`Query › Execute GQL` with `LIMIT` in the GQL is faster.

---

## Resource: Edge

The same three operations, for relationships. **Graph Name is required.**

### Insert

| Field | Notes |
|---|---|
| **Graph Name** | Required. |
| **Edges (JSON Array)** | The edges to add. |
| **Insert Mode** | Normal / Overwrite / Upsert, exactly as for nodes. |

```json
[
  { "label": "KNOWS", "fromNodeId": "alice-001", "toNodeId": "bob-002",
    "properties": { "since": 2020 } }
]
```

`fromNodeId` and `toNodeId` are the `_id` values of nodes that **must already
exist** — insert your nodes before the edges that connect them. An optional
`id` sets the edge's own `_id`, which requires `EDGE_ID` to be enabled on the
graph.

### Delete

| Field | Notes |
|---|---|
| **Graph Name** | Required. |
| **Edge IDs** | Comma-separated edge `_id` values. |
| **Label** | A single edge label, e.g. `KNOWS`. |
| **Where Clause** | A filter, e.g. `e.since < 2020`. |
| **Limit**, **Return Deleted**, **Allow Delete All** | As for nodes. |

As with nodes, Edge IDs take priority over the Label/Where filter, and the
Allow Delete All latch applies.

**Deleting edges by ID needs `EDGE_ID` enabled on the graph.** If it is not,
the server replies with error `5017` and tells you the command to enable it.
Deleting by Label or Where Clause works either way — so if you hit `5017` and
cannot change the graph, delete by filter instead.

Deleting an edge leaves both nodes in place. Only the relationship goes.

### Export

Same fields, same output as node export, with `edges` in place of `nodes` and
`edgesExported` / `edgesSkipped` in the stats.

---

## Resource: Graph

Manage whole graphs. Most workflows never need this; it is for setup, teardown
and reporting.

| Operation | What it does | Returns |
|---|---|---|
| **List Graphs** | Every graph you can see. **Start here if you do not know your graph's name.** | `{ graphs, count }` |
| **Get Info** | Details of one graph. | the graph's details |
| **Create** | Makes a new graph. | `{ created, graphName }` |
| **Drop** | **Deletes a graph and everything in it.** | `{ dropped, graphName }` |
| **Use** | Sets the active graph for the rest of the session. | `{ graphName, active }` |
| **Truncate** | **Deletes all data** but keeps the structure. | result table |
| **Rename** | Changes a graph's name. | result table |
| **Stats** | Node and edge counts per label. | the statistics |

Every operation here takes a **Graph Name**. Two take one more field:

| Operation | Extra field | Notes |
|---|---|---|
| **Create** | **Description** | Free text describing the graph. Optional. |
| **Rename** | **New Name** | The graph's new name. Required. |

**Create** also takes a **Graph Type**, which decides how strict the graph is:

| Type | Behaviour |
|---|---|
| **Open (Schema-less)** | Any labels and properties, no setup. Easiest to start with. |
| **Closed (Schema-enforced)** | Labels and properties must be declared first, via the Schema resource. Catches typos and bad data. |
| **Ontology** | Driven by a formal ontology. |

Tick **Create If Not Exists** to make the step safe to re-run — without it,
creating an existing graph is an error. **Drop If Exists** does the same for
deletion.

> **Drop and Truncate destroy data and cannot be undone.** There is no
> Allow-Delete-All style latch on these two. Before putting either in a live
> workflow, double-check the graph name — especially if it comes from an
> expression.

---

## Resource: Schema

Define and inspect the structure of a graph: which labels exist, what properties
they have, and which indexes make queries fast. **Graph Name is optional** here
— leave it blank to use the credential's Default Graph.

Mostly needed for **Closed** graphs, where structure must be declared before
data can be inserted, and for adding indexes to any graph.

### Looking at the structure

| Operation | Returns |
|---|---|
| **Show Labels** | Every node and edge label. `{ labels, count }` |
| **Show Node Types** | Node labels with their property definitions. `{ nodeTypes, count }` |
| **Show Edge Types** | Edge labels with their property definitions. `{ edgeTypes, count }` |
| **Show Index** | Every index, with its build status. `{ indexes, count }` |
| **Show Fulltext** | Every full-text index. `{ fulltexts, count }` |

### Labels and properties

| Operation | Fields |
|---|---|
| **Create Node Label** / **Create Edge Label** | *Label Name*, *Properties (JSON Array)* |
| **Drop Node Label** / **Drop Edge Label** | *Label Name* |
| **Create Node Property** / **Create Edge Property** | *Label Name*, *Properties (JSON Array)* |
| **Drop Node Property** / **Drop Edge Property** | *Label Name*, *Property Names* (comma-separated) |

Properties are given as a JSON array of name and type:

```json
[ { "name": "name", "type": "STRING" }, { "name": "age", "type": "INT64" } ]
```

Commonly used types:

| Group | Types |
|---|---|
| Text | `STRING`, `TEXT` (long text, for full-text indexing) |
| Whole numbers | `INT32`, `INT64`, `UINT32`, `UINT64` |
| Decimals | `FLOAT`, `DOUBLE`, `DECIMAL` (exact — use for money) |
| True/false | `BOOL` |
| Dates and times | `DATE`, `DATETIME`, `TIMESTAMP`, `LOCAL_DATETIME`, `ZONED_DATETIME` |
| Geographic | `POINT`, `POINT3D` |
| Collections | `LIST`, `SET`, `MAP` |
| AI / search | `VECTOR` (embeddings) |

Use `DECIMAL` rather than `DOUBLE` for amounts of money: `DOUBLE` is
approximate and will lose precision on sums.

> Dropping a label or a property **deletes the data stored in it**, across every
> node or edge that used it. This cannot be undone.

### Indexes — making queries fast

An index speeds up looking things up by a property. If a query filtering on
`n.email` is slow, an index on `email` is usually the fix.

| Operation | Fields |
|---|---|
| **Create Node Index** / **Create Edge Index** | *Index Name*, *Label Name*, *Index Properties (JSON Array)* |
| **Drop Node Index** / **Drop Edge Index** | *Index Name* |

```json
[ { "name": "email" }, { "name": "description", "prefixLength": 10 } ]
```

`prefixLength` indexes only the first N characters of a long text property —
smaller and faster, at the cost of being less precise.

### Full-text indexes — searching inside text

A normal index finds exact values. A full-text index finds **words inside**
longer text, which is what you want for searching descriptions or comments.

| Operation | Fields |
|---|---|
| **Create Node Fulltext** / **Create Edge Fulltext** | *Index Name*, *Label Name*, *Fulltext Properties* (comma-separated) |
| **Drop Node Fulltext** / **Drop Edge Fulltext** | *Index Name* |

A full-text index takes time to build after creation, and queries against it
are refused while it loads. That is exactly the situation the credential's
**Read Retry** setting handles for you, as long as the query is marked
**Read Only**.

---

## Resource: Admin

Monitoring and housekeeping. Useful for health-check and alerting workflows.
Several of these affect the whole server, so check with your database
administrator before scheduling them.

### Safe to run any time

| Operation | What it tells you | Returns |
|---|---|---|
| **Ping** | The connection works, and how fast. **Best first test.** | `{ latencyNs, latencyMs }` |
| **Health Check** | Whether the service is healthy. Optional *Service Name*. | `{ status, statusValue }` |
| **Get Statistics** | Node and edge counts. Optional *Graph Name*. | the statistics |
| **Get System Metrics** | CPU, memory, disk I/O, storage, network. | the metrics |
| **Get Cache Stats** | Cache effectiveness. *Cache Type*: All, AST or Plan. | the statistics |
| **Show Tasks** | Background tasks, e.g. an index being built. | `{ tasks, count }` |
| **List Running Queries (Top)** | What is executing right now. **Start here when the database feels slow.** | `{ processes, count }` |
| **List Transactions** | Open transactions. | `{ transactions, count }` |

### Affects the server — check first

| Operation | What it does | Returns |
|---|---|---|
| **Clear Cache** | Empties the cache. Queries are slower until it refills. | `{ cleared, cacheType }` |
| **Compact** | Reclaims disk space. Can be heavy and long-running. | the result |
| **Warmup Parser** | Pre-allocates parsers. *Parser Count*, default 4. | `{ warmedUp, count }` |
| **Stop Task** | Stops a running task. *Task ID* from Show Tasks. | result table |
| **Delete Task** | Removes a finished task's record. *Task ID*. | result table |
| **Kill Query** | **Terminates a running query.** *Query ID* from Top. | result table |

A typical pattern: **List Running Queries (Top)** to find a runaway query, read
its `queryId`, then **Kill Query** with that ID.

---

## Three things that can bite you

Everything in this section is a case where the connector does what you asked
rather than what you meant.

**1. Overwrite deletes the fields you left out.** Inserting
`{ "id": "u-1", "properties": { "email": "new@x.com" } }` in **Overwrite** mode
against a node that also had a name and a phone number leaves you with a node
that has only an email. **Upsert** is almost always the mode you want for
updates.

**2. A delete with an empty filter means "everything".** If *Node IDs*,
*Labels* and *Where Clause* are all blank — easy to do when they are filled by
an expression that returned nothing — the operation matches the whole graph.
The **Allow Delete All** latch blocks this by default. Leave it off.

**3. Export's Limit does not make exports faster.** It trims the result after
the whole export has streamed. To genuinely fetch less, use
`Query › Execute GQL` with `LIMIT` in the query.

---

## When something goes wrong

By default a failed step stops the workflow. To handle problems inside the
workflow instead, open the node's **Settings** tab and turn on **Continue On
Fail**. The step then outputs an error item rather than stopping:

```json
{
  "error": "fulltext index is still loading",
  "errorType": "QueryFailedError",
  "code": 9,
  "engineCode": 5020,
  "reason": "FULLTEXT_INDEX_LOADING"
}
```

| Field | What it is |
|---|---|
| `error` | The human-readable message. |
| `errorType` | The category of failure. |
| `code` | The transport-level code. |
| `engineCode` | The database's own error number. Only present when the server sent one. |
| `reason` | A stable short name for the cause. Only present when the server sent one. |

**Branch on `engineCode` or `reason`, never on the text of `error`.** The codes
are stable; the wording can change between versions and will silently break an
IF node that matches on it.

Follow the node with an **IF** node testing `{{ $json.error }}` to route
failures down their own path — into a retry, an alert, or a log.

---

## Common recipes

**Load a spreadsheet into the graph.** Read the file → map each row to
`{ labels, properties }` with a Code or Set node → `Node › Insert` in **Upsert**
mode, so re-running the workflow updates instead of failing. Insert all nodes
before the edges that reference them.

**Keep a graph in sync with another system.** Trigger on change → `Node › Insert`
in **Upsert** mode. Upsert handles "new or existing" in one step, so no lookup
is needed first.

**Nightly backup with verification.** Schedule → `Node › Export` → `Edge › Export`
→ IF `{{ $json.stats.complete }}` is not true → send an alert. Writing the files
without checking `stats` risks keeping a backup with silent gaps.

**Health monitoring.** Schedule every few minutes → `Admin › Ping` with
**Continue On Fail** on → IF there is an `error` → notify. Add
`Admin › Get System Metrics` to track resources over time.

**Answer a question from a form or chat.** Webhook → `Query › Execute GQL` with
**Read Only** ticked and the user's input passed in **Query Parameters** (never
concatenated into the query text) → format the reply.

---

## Troubleshooting

| What you see | What it usually means |
|---|---|
| The **Ultipa** node is not in the palette | The connector is not installed, or n8n was not restarted. Ask your n8n administrator. |
| Connection or authentication failure | Check Host is `hostname:port`, and that the username and password are right. Test with `Admin › Ping`. |
| Timeouts on a query that should work | Raise **Timeout (ms)** on the step or the credential. Use `Query › Explain` to see whether the query is the problem, and consider an index. |
| "Message size" errors on a big result | Raise **Max Receive Size (MB)** in the credential, e.g. to `256`. |
| A delete refuses with a warning about deleting everything | The **Allow Delete All** latch, working as intended. Your filter is empty — check it before overriding. |
| Error `5017` when deleting edges by ID | The graph does not have `EDGE_ID` enabled. Delete by Label/Where Clause instead, or ask your administrator to enable it. |
| Error `5020`, or "fulltext index is loading" | An index is still building. Tick **Read Only** so the query retries automatically, or wait and check `Admin › Show Tasks`. |
| Insert fails on a duplicate | Insert Mode is **Normal**. Switch to **Upsert** to merge, or **Overwrite** to replace. |
| An update wiped other fields | Insert Mode was **Overwrite**. Use **Upsert**. |
| Graph "not found" | Check the exact name with `Graph › List Graphs` — names are case-sensitive. |
| Export finished but `complete` is `false` | Records were unreadable and left out. Read `stats.warnings`, and do not treat the file as a reliable backup. |
| Results look empty but the query works elsewhere | The step is probably pointing at the wrong graph. Check **Graph Name** and the credential's Default Graph; `currentGraph` in the output confirms which was used. |

---

## Getting help

When reporting a problem, include: the resource and operation, the full output
of the failed step — especially `engineCode` and `reason` — and the graph name.
Those three make a problem diagnosable without guesswork.
