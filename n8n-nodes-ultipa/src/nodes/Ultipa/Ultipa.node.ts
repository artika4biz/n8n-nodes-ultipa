import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionTypes,
  NodeOperationError,
  IDataObject,
} from 'n8n-workflow';

import {
  GqldbClient,
  GraphType,
  CacheType,
  NodeData,
  EdgeData,
  QueryConfig,
  InsertConfig,
  DeleteConfig,
  InsertType,
} from '@ultipa-graph/ultipa-driver';

// Convenience types not re-exported from the driver package
interface ConvPropertyDef { name: string; type: string }
interface IndexProperty { name: string; prefixLength?: number }

import {
  getClient,
  closeClient,
  responseToJson,
  serializeValue,
  errorToJson,
  collectExport,
  ExportConfig,
} from './GenericFunctions';

import { queryOperations, queryFields } from './descriptions/QueryDescription';
import { nodeOperations, nodeFields } from './descriptions/NodeDescription';
import { edgeOperations, edgeFields } from './descriptions/EdgeDescription';
import { graphOperations, graphFields } from './descriptions/GraphDescription';
import { schemaOperations, schemaFields } from './descriptions/SchemaDescription';
import { adminOperations, adminFields } from './descriptions/AdminDescription';

// ─── helpers ────────────────────────────────────────────────────────────────

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function graphTypeFromString(s: string): GraphType {
  if (s === 'closed') return GraphType.CLOSED;
  if (s === 'ontology') return GraphType.ONTOLOGY;
  return GraphType.OPEN;
}

function cacheTypeFromString(s: string): CacheType {
  if (s === 'ast') return CacheType.AST;
  if (s === 'plan') return CacheType.PLAN;
  return CacheType.ALL;
}

/**
 * Map the UI's insert mode onto the driver's InsertType.
 *
 * `Overwrite` REPLACES a duplicate `_id` wholesale — properties absent from
 * the write are lost. `Upsert` MERGES into it, preserving the rest.
 */
function insertTypeFromString(s: string): InsertType {
  if (s === 'overwrite') return InsertType.Overwrite;
  if (s === 'upsert') return InsertType.Upsert;
  return InsertType.Normal;
}

function wrapOutput(data: unknown): INodeExecutionData {
  return { json: data as IDataObject };
}

// ─────────────────────────────────────────────────────────────────────────────

export class Ultipa implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Ultipa',
    name: 'ultipa',
    icon: 'file:ultipa.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: 'Interact with the Ultipa Graph Database via GQL',
    defaults: { name: 'Ultipa' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'ultipaApi',
        required: true,
      },
    ],
    properties: [
      // ── Resource selector ────────────────────────────────────────────────
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Query', value: 'query', description: 'Execute GQL queries' },
          { name: 'Node', value: 'node', description: 'Insert, delete, or export nodes' },
          { name: 'Edge', value: 'edge', description: 'Insert, delete, or export edges' },
          { name: 'Graph', value: 'graph', description: 'Manage graphs' },
          { name: 'Schema', value: 'schema', description: 'Manage labels, properties, and indexes' },
          { name: 'Admin', value: 'admin', description: 'Health, statistics, cache, and task management' },
        ],
        default: 'query',
      },

      // ── Operations & fields per resource ─────────────────────────────────
      ...queryOperations,
      ...queryFields,
      ...nodeOperations,
      ...nodeFields,
      ...edgeOperations,
      ...edgeFields,
      ...graphOperations,
      ...graphFields,
      ...schemaOperations,
      ...schemaFields,
      ...adminOperations,
      ...adminFields,
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    let client: GqldbClient | undefined;

    try {
      client = await getClient(this);

      for (let i = 0; i < items.length; i++) {
        let result: unknown;

        // ── QUERY ──────────────────────────────────────────────────────────
        if (resource === 'query') {
          const query = this.getNodeParameter('query', i) as string;
          const graphName = this.getNodeParameter('graphName', i, '') as string;

          if (operation === 'execute') {
            const rawParams = this.getNodeParameter('parameters', i, '{}') as string;
            const queryTimeout = this.getNodeParameter('queryTimeout', i, 0) as number;
            const readOnly = this.getNodeParameter('readOnly', i, false) as boolean;
            const maxPathResults = this.getNodeParameter('maxPathResults', i, 0) as number;

            let parameters: Record<string, unknown> = {};
            if (rawParams && rawParams !== '{}') {
              parameters = typeof rawParams === 'string' ? JSON.parse(rawParams) : rawParams;
            }

            const config: QueryConfig = {
              graphName: graphName || undefined,
              parameters: Object.keys(parameters).length ? parameters : undefined,
              timeout: queryTimeout || undefined,
              readOnly: readOnly || undefined,
              maxPathResults: maxPathResults || undefined,
            };

            const resp = await client.gql(query, config);
            result = responseToJson(resp);

          } else if (operation === 'explain') {
            const plan = await client.explain(query, {
              graphName: graphName || undefined,
            });
            result = { plan };

          } else if (operation === 'profile') {
            const stats = await client.profile(query, {
              graphName: graphName || undefined,
            });
            result = { stats };
          }

        // ── NODE ───────────────────────────────────────────────────────────
        } else if (resource === 'node') {
          const graphName = this.getNodeParameter('graphName', i) as string;

          if (operation === 'insert') {
            const rawNodes = this.getNodeParameter('nodesJson', i) as string | NodeData[];
            const insertMode = this.getNodeParameter('insertMode', i, 'normal') as string;
            const nodes: NodeData[] = typeof rawNodes === 'string'
              ? JSON.parse(rawNodes)
              : rawNodes;

            // The insert mode travels in InsertConfig; passing the bare enum
            // here silently fell back to a plain INSERT.
            const config: InsertConfig = {
              graphName,
              insertType: insertTypeFromString(insertMode),
            };
            const resp = await client.insertNodes(nodes, config);
            result = responseToJson(resp);

          } else if (operation === 'delete') {
            const rawIds = this.getNodeParameter('nodeIds', i, '') as string;
            const rawLabels = this.getNodeParameter('labels', i, '') as string;
            const where = this.getNodeParameter('whereClause', i, '') as string;
            const limit = this.getNodeParameter('deleteLimit', i, 0) as number;
            const returnDeleted = this.getNodeParameter('returnDeleted', i, true) as boolean;
            const allowDeleteAll = this.getNodeParameter('allowDeleteAll', i, false) as boolean;

            const nodeIds = rawIds ? parseCsv(rawIds) : undefined;
            const labels = rawLabels ? parseCsv(rawLabels) : undefined;

            const config: DeleteConfig = { graphName, returnDeleted, allowDeleteAll };

            // Driver 6.x replaced deleteNodes() with two explicit entry
            // points; an id list takes precedence over the label/where filter.
            const resp = nodeIds && nodeIds.length
              ? await client.deleteNodesByIds(nodeIds, config)
              : await client.deleteNodesByCondition(
                  labels,
                  where || undefined,
                  limit || undefined,
                  config,
                );
            result = responseToJson(resp);

          } else if (operation === 'export') {
            const rawLabels = this.getNodeParameter('exportLabels', i, '') as string;
            const limit = this.getNodeParameter('exportLimit', i, 0) as number;
            const labels = rawLabels ? parseCsv(rawLabels) : undefined;

            const config: ExportConfig = {
              graphName,
              exportNodes: true,
              exportEdges: false,
              nodeLabels: labels,
              includeMetadata: false,
            };
            const exported = await collectExport(client, config, limit);
            result = {
              nodes: exported.records,
              count: exported.records.length,
              truncated: exported.truncated,
              stats: exported.stats,
              ...(exported.malformed.length ? { malformed: exported.malformed } : {}),
            };
          }

        // ── EDGE ───────────────────────────────────────────────────────────
        } else if (resource === 'edge') {
          const graphName = this.getNodeParameter('graphName', i) as string;

          if (operation === 'insert') {
            const rawEdges = this.getNodeParameter('edgesJson', i) as string | EdgeData[];
            const insertMode = this.getNodeParameter('insertMode', i, 'normal') as string;
            const edges: EdgeData[] = typeof rawEdges === 'string'
              ? JSON.parse(rawEdges)
              : rawEdges;

            const config: InsertConfig = {
              graphName,
              insertType: insertTypeFromString(insertMode),
            };
            const resp = await client.insertEdges(edges, config);
            result = responseToJson(resp);

          } else if (operation === 'delete') {
            const rawIds = this.getNodeParameter('edgeIds', i, '') as string;
            const label = this.getNodeParameter('label', i, '') as string;
            const where = this.getNodeParameter('whereClause', i, '') as string;
            const limit = this.getNodeParameter('deleteLimit', i, 0) as number;
            const returnDeleted = this.getNodeParameter('returnDeleted', i, true) as boolean;
            const allowDeleteAll = this.getNodeParameter('allowDeleteAll', i, false) as boolean;

            const edgeIds = rawIds ? parseCsv(rawIds) : undefined;

            const config: DeleteConfig = { graphName, returnDeleted, allowDeleteAll };

            // Deleting by id needs EDGE_ID ENABLED on the graph; the server
            // answers [5017] with the ALTER GRAPH hint when it is not.
            const resp = edgeIds && edgeIds.length
              ? await client.deleteEdgesByIds(edgeIds, config)
              : await client.deleteEdgesByCondition(
                  label || undefined,
                  where || undefined,
                  limit || undefined,
                  config,
                );
            result = responseToJson(resp);

          } else if (operation === 'export') {
            const rawLabels = this.getNodeParameter('exportLabels', i, '') as string;
            const limit = this.getNodeParameter('exportLimit', i, 0) as number;
            const labels = rawLabels ? parseCsv(rawLabels) : undefined;

            const config: ExportConfig = {
              graphName,
              exportNodes: false,
              exportEdges: true,
              edgeLabels: labels,
              includeMetadata: false,
            };
            const exported = await collectExport(client, config, limit);
            result = {
              edges: exported.records,
              count: exported.records.length,
              truncated: exported.truncated,
              stats: exported.stats,
              ...(exported.malformed.length ? { malformed: exported.malformed } : {}),
            };
          }

        // ── GRAPH ──────────────────────────────────────────────────────────
        } else if (resource === 'graph') {
          if (operation === 'list') {
            const graphs = await client.listGraphs();
            result = { graphs: graphs.map((g) => serializeValue(g)), count: graphs.length };

          } else if (operation === 'info') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            const info = await client.getGraphInfo(graphName);
            result = serializeValue(info);

          } else if (operation === 'create') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            const graphTypeStr = this.getNodeParameter('graphType', i, 'open') as string;
            const description = this.getNodeParameter('graphDescription', i, '') as string;
            const ifNotExists = this.getNodeParameter('ifNotExists', i, false) as boolean;

            const gType = graphTypeFromString(graphTypeStr);

            if (ifNotExists) {
              const created = await client.createGraphIfNotExist(graphName, gType, description);
              result = { created, graphName };
            } else {
              await client.createGraph(graphName, gType, description);
              result = { created: true, graphName };
            }

          } else if (operation === 'drop') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            const ifExists = this.getNodeParameter('ifExists', i, false) as boolean;
            await client.dropGraph(graphName, ifExists);
            result = { dropped: true, graphName };

          } else if (operation === 'use') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            await client.useGraph(graphName);
            result = { graphName, active: true };

          } else if (operation === 'truncate') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            const resp = await client.truncate(graphName);
            result = responseToJson(resp);

          } else if (operation === 'rename') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            const newName = this.getNodeParameter('newName', i) as string;
            const resp = await client.alterGraph(graphName, newName);
            result = responseToJson(resp);

          } else if (operation === 'stats') {
            const graphName = this.getNodeParameter('graphName', i) as string;
            const stats = await client.stats({ graphName });
            result = serializeValue(stats);
          }

        // ── SCHEMA ─────────────────────────────────────────────────────────
        } else if (resource === 'schema') {
          const graphName = this.getNodeParameter('graphName', i, '') as string;
          // Target the graph per call rather than switching the session's
          // graph: items in one batch may address different graphs, and the
          // driver treats a per-call config as the thread-safe way to do it.
          const cfg: QueryConfig | undefined = graphName ? { graphName } : undefined;

          if (operation === 'showLabels') {
            const labels = await client.showLabels(cfg);
            result = { labels, count: labels.length };

          } else if (operation === 'showNodeTypes') {
            const types = await client.showNodeTypes(cfg);
            result = { nodeTypes: types.map((t) => serializeValue(t)), count: types.length };

          } else if (operation === 'showEdgeTypes') {
            const types = await client.showEdgeTypes(cfg);
            result = { edgeTypes: types.map((t) => serializeValue(t)), count: types.length };

          } else if (operation === 'createNodeLabel') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const rawProps = this.getNodeParameter('propertiesJson', i, '[]') as string | ConvPropertyDef[];
            const props: ConvPropertyDef[] = typeof rawProps === 'string'
              ? JSON.parse(rawProps)
              : rawProps;
            const resp = await client.createNodeLabel(labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'createEdgeLabel') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const rawProps = this.getNodeParameter('propertiesJson', i, '[]') as string | ConvPropertyDef[];
            const props: ConvPropertyDef[] = typeof rawProps === 'string'
              ? JSON.parse(rawProps)
              : rawProps;
            const resp = await client.createEdgeLabel(labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropNodeLabel') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const resp = await client.dropNodeLabel(labelName, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropEdgeLabel') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const resp = await client.dropEdgeLabel(labelName, cfg);
            result = responseToJson(resp);

          } else if (operation === 'createNodeProperty') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const rawProps = this.getNodeParameter('propertiesJson', i, '[]') as string | ConvPropertyDef[];
            const props: ConvPropertyDef[] = typeof rawProps === 'string'
              ? JSON.parse(rawProps)
              : rawProps;
            const resp = await client.createNodeProperty(labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'createEdgeProperty') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const rawProps = this.getNodeParameter('propertiesJson', i, '[]') as string | ConvPropertyDef[];
            const props: ConvPropertyDef[] = typeof rawProps === 'string'
              ? JSON.parse(rawProps)
              : rawProps;
            const resp = await client.createEdgeProperty(labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropNodeProperty') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const propNames = parseCsv(this.getNodeParameter('propertyNames', i) as string);
            const resp = await client.dropNodeProperty(labelName, ...propNames, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropEdgeProperty') {
            const labelName = this.getNodeParameter('labelName', i) as string;
            const propNames = parseCsv(this.getNodeParameter('propertyNames', i) as string);
            const resp = await client.dropEdgeProperty(labelName, ...propNames, cfg);
            result = responseToJson(resp);

          } else if (operation === 'showIndex') {
            const indexes = await client.showIndex(cfg);
            result = { indexes: indexes.map((idx) => serializeValue(idx)), count: indexes.length };

          } else if (operation === 'createNodeIndex') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const labelName = this.getNodeParameter('labelName', i) as string;
            const rawProps = this.getNodeParameter('indexPropertiesJson', i, '[]') as string | IndexProperty[];
            const props: IndexProperty[] = typeof rawProps === 'string'
              ? JSON.parse(rawProps)
              : rawProps;
            const resp = await client.createNodeIndex(indexName, labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'createEdgeIndex') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const labelName = this.getNodeParameter('labelName', i) as string;
            const rawProps = this.getNodeParameter('indexPropertiesJson', i, '[]') as string | IndexProperty[];
            const props: IndexProperty[] = typeof rawProps === 'string'
              ? JSON.parse(rawProps)
              : rawProps;
            const resp = await client.createEdgeIndex(indexName, labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropNodeIndex') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const resp = await client.dropNodeIndex(indexName, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropEdgeIndex') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const resp = await client.dropEdgeIndex(indexName, cfg);
            result = responseToJson(resp);

          } else if (operation === 'showFulltext') {
            const fulltexts = await client.showFulltext(cfg);
            result = { fulltexts: fulltexts.map((f) => serializeValue(f)), count: fulltexts.length };

          } else if (operation === 'createNodeFulltext') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const labelName = this.getNodeParameter('labelName', i) as string;
            const props = parseCsv(this.getNodeParameter('fulltextProperties', i) as string);
            const resp = await client.createNodeFulltext(indexName, labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'createEdgeFulltext') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const labelName = this.getNodeParameter('labelName', i) as string;
            const props = parseCsv(this.getNodeParameter('fulltextProperties', i) as string);
            const resp = await client.createEdgeFulltext(indexName, labelName, props, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropNodeFulltext') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const resp = await client.dropNodeFulltext(indexName, cfg);
            result = responseToJson(resp);

          } else if (operation === 'dropEdgeFulltext') {
            const indexName = this.getNodeParameter('indexName', i) as string;
            const resp = await client.dropEdgeFulltext(indexName, cfg);
            result = responseToJson(resp);
          }

        // ── ADMIN ──────────────────────────────────────────────────────────
        } else if (resource === 'admin') {
          if (operation === 'healthCheck') {
            const serviceName = this.getNodeParameter('serviceName', i, '') as string;
            const status = await client.healthCheck(serviceName);
            result = { status, statusValue: status };

          } else if (operation === 'getStatistics') {
            const graphName = this.getNodeParameter('graphName', i, '') as string;
            const stats = await client.getStatistics(graphName);
            result = serializeValue(stats);

          } else if (operation === 'getSystemMetrics') {
            const metrics = await client.getSystemMetrics();
            result = serializeValue(metrics);

          } else if (operation === 'getCacheStats') {
            const cacheTypeStr = this.getNodeParameter('cacheType', i, 'all') as string;
            const cType = cacheTypeFromString(cacheTypeStr);
            const cacheStats = await client.getCacheStats(cType);
            result = serializeValue(cacheStats);

          } else if (operation === 'clearCache') {
            const cacheTypeStr = this.getNodeParameter('cacheType', i, 'all') as string;
            const cType = cacheTypeFromString(cacheTypeStr);
            await client.clearCache(cType);
            result = { cleared: true, cacheType: cacheTypeStr };

          } else if (operation === 'compact') {
            const compactResult = await client.compact();
            result = serializeValue(compactResult);

          } else if (operation === 'warmupParser') {
            const count = this.getNodeParameter('parserCount', i, 4) as number;
            await client.warmupParser(count);
            result = { warmedUp: true, count };

          } else if (operation === 'showTasks') {
            const tasks = await client.showTasks();
            result = { tasks: tasks.map((t) => serializeValue(t)), count: tasks.length };

          } else if (operation === 'stopTask') {
            const taskId = this.getNodeParameter('taskId', i) as string;
            const resp = await client.stopTask(taskId);
            result = responseToJson(resp);

          } else if (operation === 'deleteTask') {
            const taskId = this.getNodeParameter('taskId', i) as string;
            const resp = await client.deleteTask(taskId);
            result = responseToJson(resp);

          } else if (operation === 'top') {
            const processes = await client.top();
            result = { processes: processes.map((p) => serializeValue(p)), count: processes.length };

          } else if (operation === 'killQuery') {
            const queryId = this.getNodeParameter('queryId', i) as string;
            const resp = await client.kill(queryId);
            result = responseToJson(resp);

          } else if (operation === 'listTransactions') {
            const txList = await client.listTransactions();
            result = {
              transactions: txList.map((t) => serializeValue(t)),
              count: txList.length,
            };

          } else if (operation === 'ping') {
            const latencyNs = await client.ping();
            result = { latencyNs, latencyMs: Math.round(latencyNs / 1_000_000) };
          }
        }

        if (result === undefined) {
          throw new NodeOperationError(
            this.getNode(),
            `Unknown operation "${operation}" for resource "${resource}"`,
            { itemIndex: i },
          );
        }

        returnData.push(wrapOutput(result));
      }
    } catch (error) {
      if (this.continueOnFail()) {
        returnData.push({ json: errorToJson(error) as IDataObject });
      } else {
        throw error;
      }
    } finally {
      if (client) {
        await closeClient(client);
      }
    }

    return [returnData];
  }
}
