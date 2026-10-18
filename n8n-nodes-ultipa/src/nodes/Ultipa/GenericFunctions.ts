import { IExecuteFunctions, ICredentialDataDecryptedObject } from 'n8n-workflow';
import {
  GqldbClient,
  GqldbConfig,
  GqldbError,
  Response,
} from '@ultipa-graph/ultipa-driver';

// The driver's `client.export()` is public but its parameter and callback
// types live in response.ts and are not re-exported from the package index,
// so they are mirrored here. Keep in sync with the driver's response.ts.
export interface ExportConfig {
  graphName: string;
  batchSize?: number;
  exportNodes?: boolean;
  exportEdges?: boolean;
  nodeLabels?: string[];
  edgeLabels?: string[];
  includeMetadata?: boolean;
}

export interface ExportStats {
  nodesExported: number;
  edgesExported: number;
  bytesWritten: number;
  durationMs: number;
  nodesExpected: number;
  edgesExpected: number;
  nodesSkipped: number;
  edgesSkipped: number;
  warnings: string[];
}

export interface ExportChunk {
  data: Buffer;
  isFinal: boolean;
  stats?: ExportStats;
}

/** Build a GqldbConfig from n8n credential data */
export function buildConfig(credentials: ICredentialDataDecryptedObject): GqldbConfig {
  const rawHost = (credentials.host as string) || 'localhost:9000';
  const hosts = rawHost
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);

  const maxRecvSizeMb = (credentials.maxRecvSizeMb as number) ?? 0;

  return {
    hosts,
    username: (credentials.username as string) || undefined,
    password: (credentials.password as string) || undefined,
    defaultGraph: (credentials.defaultGraph as string) || undefined,
    timeout: (credentials.timeout as number) ?? 30000,
    tlsOptions: credentials.useTls ? {} : undefined,

    // Driver 6.x tuning knobs. Each is left undefined when the credential is
    // blank/zero so the driver's own DEFAULT_CONFIG value applies.
    maxRecvSize: maxRecvSizeMb > 0 ? maxRecvSizeMb * 1024 * 1024 : undefined,
    poolSize: (credentials.poolSize as number) || undefined,
    healthCheckInterval: (credentials.healthCheckInterval as number) || undefined,

    // Read retry for engine code 5020 (fulltext index still loading). Only
    // applies to read-only queries, so it can never repeat a write.
    retryCount:
      credentials.retryCount === undefined || credentials.retryCount === null
        ? undefined
        : (credentials.retryCount as number),
    retryDelay: (credentials.retryDelay as number) || undefined,

    // Defence-in-depth for workflows that interpolate expressions into GQL:
    // rejects caller GQL whose leading keyword is USE, which would switch the
    // session graph out from under QueryConfig.graphName.
    disableUseGraph: (credentials.disableUseGraph as boolean) || undefined,
  };
}

/**
 * Create, authenticate, and return a GqldbClient.
 * The caller is responsible for calling client.close() when done.
 */
export async function getClient(
  executeFunctions: IExecuteFunctions,
): Promise<GqldbClient> {
  const credentials = await executeFunctions.getCredentials('ultipaApi');
  const config = buildConfig(credentials);

  const client = new GqldbClient(config);
  const username = (credentials.username as string) || '';
  const password = (credentials.password as string) || '';

  await client.login(username, password);

  const defaultGraph = (credentials.defaultGraph as string) || '';
  if (defaultGraph) {
    await client.useGraph(defaultGraph);
  }

  return client;
}

/** Safely close the client, suppressing any errors. */
export async function closeClient(client: GqldbClient): Promise<void> {
  try {
    await client.close();
  } catch {
    // ignore close errors
  }
}

/**
 * Convert a driver Response into a plain JSON-serialisable object for n8n.
 *
 * Besides columns/rows this surfaces the fields driver 6.x reports alongside
 * the result set: server warnings, the session's graph after the statement
 * ran, server-side timings, and per-category DML counts.
 */
export function responseToJson(response: Response): Record<string, unknown> {
  const columns = response.columns ?? [];
  const rows = (response.rows ?? []).map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      const val = typeof (row as any).get === 'function' ? (row as any).get(idx) : row.values[idx];
      obj[col] = serializeValue(val);
    });
    return obj;
  });

  const out: Record<string, unknown> = {
    columns,
    rows,
    rowsAffected: response.rowsAffected ?? 0,
    hasMore: response.hasMore ?? false,
    rowCount: rows.length,
  };

  // Server warnings explain a partial or adjusted result; always worth showing.
  if (response.warnings && response.warnings.length) {
    out.warnings = [...response.warnings];
  }

  // Empty against a server too old to report it.
  if (response.currentGraph) {
    out.currentGraph = response.currentGraph;
  }

  // 0 means "not reported" rather than "took no time", so only emit when set.
  if (response.timeCostNs) {
    out.timeCostNs = response.timeCostNs;
    out.timeCostMs = Math.round(response.timeCostNs / 1_000_000);
  }
  if (response.diskCostNs) out.diskCostNs = response.diskCostNs;
  if (response.computeCostNs) out.computeCostNs = response.computeCostNs;

  // Absent for a pure read or a pre-DmlStats server — which is NOT the same as
  // "changed nothing", so the key is omitted rather than zero-filled.
  if (response.dmlStats) {
    out.dmlStats = { ...response.dmlStats };
  }

  return out;
}

/** Recursively make a value JSON-safe (handle BigInt, node/edge objects, etc.). */
export function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return val.toString();
  if (val instanceof Date) return val.toISOString();
  if (Buffer.isBuffer(val)) return val.toString('base64');
  if (Array.isArray(val)) return val.map(serializeValue);
  if (val instanceof Map) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of val) out[String(k)] = serializeValue(v);
    return out;
  }
  if (typeof val === 'object') {
    // Handle GqldbNode / GqldbEdge / GqldbPath shapes
    const obj = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      out[key] = serializeValue(obj[key]);
    }
    return out;
  }
  return val;
}

/**
 * Flatten a driver error into n8n output, keeping the fields driver 6.x adds
 * beside the message: the gRPC status on `code`, the engine's own code on
 * `engineCode`, and the server's stable reason name.
 */
export function errorToJson(error: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    error: error instanceof Error ? error.message : String(error),
  };

  if (error instanceof GqldbError) {
    out.errorType = error.name;
    out.code = error.code;
    // 0 when the server attached no structured detail (older server, or an
    // error the driver raised itself).
    if (error.engineCode) out.engineCode = error.engineCode;
    if (error.reason) out.reason = error.reason;
  } else if (error instanceof Error) {
    out.errorType = error.name;
  }

  return out;
}

// ─── export (JSON Lines) ────────────────────────────────────────────────────

/** Everything the new streaming export reports back for one pass. */
export interface ExportCollection {
  records: Record<string, unknown>[];
  /** True when `limit` cut the collected records short. */
  truncated: boolean;
  /** Lines the server sent that were not valid JSON (kept verbatim). */
  malformed: string[];
  stats?: Record<string, unknown>;
}

/**
 * Run the driver's streaming `export()` and collect its JSON Lines payload.
 *
 * Driver 6.x removed the ExportNodes / ExportEdges RPCs in favour of a single
 * `Export` stream that emits JSON Lines. Two consequences handled here:
 *
 *  - A record can straddle two chunks, so lines are reassembled across them.
 *    (Chunks themselves always land on a UTF-8 character boundary.)
 *  - `Export` takes no row limit, so `limit` is applied client-side: the
 *    stream still runs to the end, but only the first `limit` records are kept
 *    and `truncated` says so.
 */
export async function collectExport(
  client: GqldbClient,
  config: ExportConfig,
  limit = 0,
): Promise<ExportCollection> {
  const records: Record<string, unknown>[] = [];
  const malformed: string[] = [];
  let truncated = false;
  let stats: ExportStats | undefined;
  let pending = '';

  const takeLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (limit > 0 && records.length >= limit) {
      truncated = true;
      return;
    }
    try {
      records.push(serializeValue(JSON.parse(trimmed)) as Record<string, unknown>);
    } catch {
      malformed.push(trimmed);
    }
  };

  await client.export(config, (chunk) => {
    if (chunk.stats) stats = chunk.stats;

    pending += chunk.data.toString('utf8');
    const lines = pending.split('\n');
    // The last piece may be an unfinished line; hold it for the next chunk.
    pending = lines.pop() ?? '';
    for (const line of lines) takeLine(line);
  });

  // Flush the last line once the stream is done. This covers both a payload
  // whose final record has no trailing newline and a stream that ended without
  // a final marker, so the per-chunk loop above needs no isFinal special case.
  if (pending) takeLine(pending);

  return { records, truncated, malformed, stats: exportStatsToJson(stats) };
}

/**
 * Shape ExportStats for n8n output and say whether the export was complete.
 *
 * A server that reports completeness sends the expected counts, the records it
 * could not read, and warnings explaining any gap. An older server leaves all
 * of those at 0/empty, which is indistinguishable from a clean export — hence
 * `completenessReported`.
 */
export function exportStatsToJson(
  stats: ExportStats | undefined,
): Record<string, unknown> | undefined {
  if (!stats) return undefined;

  const warnings = stats.warnings ?? [];
  const skipped = (stats.nodesSkipped ?? 0) + (stats.edgesSkipped ?? 0);
  const expected = (stats.nodesExpected ?? 0) + (stats.edgesExpected ?? 0);
  const completenessReported = expected > 0 || skipped > 0 || warnings.length > 0;

  return {
    nodesExported: stats.nodesExported,
    edgesExported: stats.edgesExported,
    bytesWritten: stats.bytesWritten,
    durationMs: stats.durationMs,
    nodesExpected: stats.nodesExpected,
    edgesExpected: stats.edgesExpected,
    nodesSkipped: stats.nodesSkipped,
    edgesSkipped: stats.edgesSkipped,
    warnings: [...warnings],
    completenessReported,
    // Only meaningful when the server reported completeness at all.
    complete: completenessReported ? skipped === 0 && warnings.length === 0 : undefined,
  };
}
