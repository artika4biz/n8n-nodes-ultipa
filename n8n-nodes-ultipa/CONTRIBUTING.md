# Contributing — n8n-nodes-ultipa

This document explains the internal architecture in enough depth to confidently extend or modify the package.

---

## Architecture Overview

```
Credential (UltipaApi)
        │
        ▼
GenericFunctions.getClient()
        │  creates + authenticates GqldbClient
        ▼
Ultipa.node.ts  execute()
        │
        ├─ resource === 'query'   ──► GqldbClient.gql / .explain / .profile
        ├─ resource === 'node'    ──► GqldbClient.insertNodes / .deleteNodes / .exportNodes
        ├─ resource === 'edge'    ──► GqldbClient.insertEdges / .deleteEdges / .exportEdges
        ├─ resource === 'graph'   ──► GqldbClient.listGraphs / .createGraph / .dropGraph …
        ├─ resource === 'schema'  ──► GqldbClient.showLabels / .createNodeLabel / .showIndex …
        └─ resource === 'admin'   ──► GqldbClient.healthCheck / .getStatistics / .top …
        │
        ▼
GenericFunctions.responseToJson / serializeValue
        │  converts driver Response → plain JSON
        ▼
INodeExecutionData[][]  (returned to n8n)
```

---

## File Responsibilities

### `src/credentials/UltipaApi.credentials.ts`

Implements `ICredentialType`. Declares the six UI fields that a user fills in when creating an Ultipa credential in n8n.

Nothing here should contain business logic. It is purely declarative.

### `src/nodes/Ultipa/GenericFunctions.ts`

Four exported functions:

| Function | Purpose |
|---|---|
| `buildConfig(credentials)` | Converts raw credential data → `GqldbConfig` |
| `getClient(executeFunctions)` | Reads credentials, builds config, creates `GqldbClient`, logs in, sets default graph |
| `closeClient(client)` | Calls `client.close()`, swallowing errors |
| `responseToJson(response)` | Maps a driver `Response` to a plain `{ columns, rows, rowsAffected, hasMore, rowCount }` object |
| `serializeValue(val)` | Recursively makes any value JSON-safe (BigInt → string, objects recursed) |

`getClient` and `closeClient` are called exactly once per `execute()` invocation — at the top and in the `finally` block respectively.

### `src/nodes/Ultipa/descriptions/*.ts`

Each file exports exactly two arrays:

```typescript
export const fooOperations: INodeProperties[]  // the operation dropdown
export const fooFields: INodeProperties[]       // all parameters for those operations
```

Every field in `fooFields` must carry a `displayOptions.show` that lists **both** `resource` and `operation` — this prevents the field from bleeding into other resources in the UI.

The files contain zero business logic and zero imports from the driver.

### `src/nodes/Ultipa/Ultipa.node.ts`

The main node. Two distinct responsibilities:

**1. Static description (`description` property)**

Declares all metadata n8n needs to render the node: display name, icon, group, inputs, outputs, credentials, and the full list of properties (spread from all description files).

**2. Runtime execution (`execute()` method)**

Reads the `resource` and `operation` parameters, then dispatches through a `if/else if` tree. Each branch reads its own parameters via `this.getNodeParameter(name, itemIndex)` and calls the matching driver method.

The client is created **once**, reused for all items in the batch, and closed in `finally`.

---

## Adding a New Operation — Worked Example

Goal: add **Node › Count** that runs `MATCH (n:Label) RETURN count(n) AS total`.

### 1. Extend `NodeDescription.ts`

```typescript
// In nodeOperations options array:
{
  name: 'Count',
  value: 'count',
  description: 'Count nodes matching a label and optional filter',
  action: 'Count nodes',
},

// In nodeFields array:
{
  displayName: 'Label',
  name: 'countLabel',
  type: 'string',
  default: '',
  placeholder: 'Person',
  description: 'Node label to count (leave blank for all nodes)',
  displayOptions: { show: { resource: ['node'], operation: ['count'] } },
},
{
  displayName: 'Where Clause',
  name: 'countWhere',
  type: 'string',
  default: '',
  placeholder: 'n.age > 30',
  description: 'Optional filter expression',
  displayOptions: { show: { resource: ['node'], operation: ['count'] } },
},
```

### 2. Handle the operation in `Ultipa.node.ts`

Inside the `resource === 'node'` block:

```typescript
} else if (operation === 'count') {
  const label      = this.getNodeParameter('countLabel', i, '') as string;
  const where      = this.getNodeParameter('countWhere', i, '') as string;

  const labelPart  = label ? `:${label}` : '';
  const wherePart  = where ? ` WHERE ${where}` : '';
  const gql        = `MATCH (n${labelPart}${wherePart}) RETURN count(n) AS total`;

  await client.useGraph(graphName);
  const resp = await client.gql(gql);
  const total = resp.rows.length > 0
    ? (resp.rows[0] as any).get(0)
    : 0;

  result = { total: Number(total), label: label || '*', where: where || '' };
}
```

### 3. Rebuild

```bash
npm run build
```

---

## Adding a New Resource — Checklist

- [ ] Create `src/nodes/Ultipa/descriptions/MyResource.ts` with `myResourceOperations` and `myResourceFields`.
- [ ] Import and spread both arrays in `Ultipa.node.ts → description.properties`.
- [ ] Add the resource entry to the **Resource** selector dropdown in `Ultipa.node.ts`.
- [ ] Add `else if (resource === 'myResource')` to `execute()`.
- [ ] For each operation: read parameters, call the driver, assign `result`.
- [ ] Run `npm run build` and verify zero TypeScript errors.

---

## Parameter Reading Conventions

| Scenario | Code pattern |
|---|---|
| Required string | `this.getNodeParameter('name', i) as string` |
| Optional string with default | `this.getNodeParameter('name', i, '') as string` |
| Optional number with default | `this.getNodeParameter('name', i, 0) as number` |
| Optional boolean | `this.getNodeParameter('name', i, false) as boolean` |
| JSON parameter | Read as `string`, then `JSON.parse()` if non-empty; accept pre-parsed object too |
| CSV list | Pass through `parseCsv(value)` to get `string[]`; returns `[]` on empty input |

Always read parameters with the item index `i`, not `0`, so that expression values are resolved per item in a batch.

---

## Output Conventions

Every operation must assign a value to `result` before the end of its branch. `result` is then passed through `wrapOutput()`:

```typescript
function wrapOutput(data: unknown): INodeExecutionData {
  return { json: data as IDataObject };
}
```

Rules for what goes in `result`:

- **GQL query results:** use `responseToJson(resp)` — returns `{ columns, rows, rowsAffected, hasMore, rowCount }`.
- **Driver objects (GraphInfo, Statistics, etc.):** use `serializeValue(obj)` to guarantee JSON safety.
- **Simple operation outcomes:** return a plain object, e.g. `{ created: true, graphName }`.
- **Arrays of driver objects:** map through `serializeValue`, e.g. `graphs.map(g => serializeValue(g))`.

Never return `undefined` — n8n will not surface it and the item will be silently lost.

---

## TypeScript Notes

### Strict Mode

The `tsconfig.json` has `"strict": true`. All new code must satisfy the strict type checker.

### Driver Types Not in Public API

Four types used internally by the driver are not exported from `@ultipa-graph/ultipa-driver`:

```typescript
// Redeclared in Ultipa.node.ts — keep in sync with driver source
const enum InsertType { Normal = 0, Overwrite = 1 }
interface ConvPropertyDef { name: string; type: string }
interface IndexProperty { name: string; prefixLength?: number }
```

When passing an `InsertType` value to `client.insertNodes()` or `client.insertEdges()`, cast to `any`:

```typescript
await client.insertNodes(nodes, iType as any);
```

This is safe because `const enum` values are inlined by tsc and the underlying numbers (0, 1) match the driver's enum exactly.

### `IDataObject` Compatibility

n8n's `INodeExecutionData.json` is typed as `IDataObject`, which is `{ [key: string]: any }`. Cast operation results using `as IDataObject` in `wrapOutput()`. If TypeScript rejects a specific cast, use `as unknown as IDataObject`.

---

## Build System

```
npm run build       tsc + copy-icons
npm run dev         tsc --watch (no icon copy)
```

`copy-icons` copies `src/nodes/Ultipa/ultipa.svg` to `dist/nodes/Ultipa/ultipa.svg`. n8n resolves `file:ultipa.svg` relative to the compiled JS file, so the SVG must be in `dist/`.

The compiled output lands in `dist/` with the same directory structure as `src/`.

---

## Testing

There are no automated tests in this package yet. To manually test:

1. Build the package.
2. Symlink or install it into a local n8n instance.
3. Create a workflow using the Ultipa node.
4. Test each resource/operation against a running Ultipa server.

When adding a new operation, consider testing:
- Happy path (valid inputs, server returns data).
- Empty result (zero rows/nodes/edges).
- Error path (invalid graph name, bad credentials) with **Continue On Fail** both on and off.
