import { INodeProperties } from 'n8n-workflow';

export const edgeOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['edge'] } },
    options: [
      {
        name: 'Insert',
        value: 'insert',
        description: 'Insert one or more edges using GQL INSERT',
        action: 'Insert edges',
      },
      {
        name: 'Delete',
        value: 'delete',
        description: 'Delete edges by ID, label, or WHERE filter',
        action: 'Delete edges',
      },
      {
        name: 'Export',
        value: 'export',
        description: 'Stream/export edges from a graph',
        action: 'Export edges',
      },
    ],
    default: 'insert',
  },
];

export const edgeFields: INodeProperties[] = [
  // ── Shared: graph name ───────────────────────────────────────────────────
  {
    displayName: 'Graph Name',
    name: 'graphName',
    type: 'string',
    required: true,
    default: '',
    description: 'Name of the graph to operate on',
    displayOptions: {
      show: { resource: ['edge'], operation: ['insert', 'delete', 'export'] },
    },
  },

  // ── INSERT ───────────────────────────────────────────────────────────────
  {
    displayName: 'Edges (JSON Array)',
    name: 'edgesJson',
    type: 'json',
    required: true,
    default:
      '[{"label":"KNOWS","fromNodeId":"node_1","toNodeId":"node_2","properties":{"since":2020}}]',
    description:
      'Array of edge objects. Each must have "label" (string), "fromNodeId" (string), "toNodeId" (string), and "properties" (object).',
    displayOptions: { show: { resource: ['edge'], operation: ['insert'] } },
  },
  {
    displayName: 'Insert Mode',
    name: 'insertMode',
    type: 'options',
    options: [
      { name: 'Normal', value: 'normal', description: 'Fail if the edge already exists' },
      {
        name: 'Overwrite',
        value: 'overwrite',
        description:
          'Replace an existing edge wholesale on a duplicate _id. Properties absent from this write are LOST.',
      },
      {
        name: 'Upsert',
        value: 'upsert',
        description:
          'Merge into an existing edge on a duplicate _id. Properties absent from this write are preserved; those present overwrite. Falls back to a plain insert when no _id matches.',
      },
    ],
    default: 'normal',
    displayOptions: { show: { resource: ['edge'], operation: ['insert'] } },
  },

  // ── DELETE ───────────────────────────────────────────────────────────────
  {
    displayName: 'Edge IDs',
    name: 'edgeIds',
    type: 'string',
    default: '',
    placeholder: 'id1,id2,id3',
    description: 'Comma-separated list of edge IDs to delete (leave blank to use label/where filter)',
    displayOptions: { show: { resource: ['edge'], operation: ['delete'] } },
  },
  {
    displayName: 'Label',
    name: 'label',
    type: 'string',
    default: '',
    placeholder: 'KNOWS',
    description: 'Edge label to target for deletion',
    displayOptions: { show: { resource: ['edge'], operation: ['delete'] } },
  },
  {
    displayName: 'Where Clause',
    name: 'whereClause',
    type: 'string',
    default: '',
    placeholder: 'e.since < 2020',
    description: 'Optional WHERE filter expression to narrow the deletion',
    displayOptions: { show: { resource: ['edge'], operation: ['delete'] } },
  },
  {
    displayName: 'Limit',
    name: 'deleteLimit',
    type: 'number',
    default: 0,
    description:
      'Maximum number of edges to delete (0 = no limit). Applies to the label/WHERE filter only, not to an explicit ID list.',
    displayOptions: { show: { resource: ['edge'], operation: ['delete'] } },
  },
  {
    displayName: 'Return Deleted',
    name: 'returnDeleted',
    type: 'boolean',
    default: true,
    description:
      'Whether to return the full data of each deleted edge. Turn off on large bulk deletes to save bandwidth; the affected-row count is still reported.',
    displayOptions: { show: { resource: ['edge'], operation: ['delete'] } },
  },
  {
    displayName: 'Allow Delete All',
    name: 'allowDeleteAll',
    type: 'boolean',
    default: false,
    description:
      'Safety latch. With no IDs, no label and no WHERE clause the operation would delete every edge in the graph, and the driver refuses unless this is enabled.',
    displayOptions: { show: { resource: ['edge'], operation: ['delete'] } },
  },

  // ── EXPORT ───────────────────────────────────────────────────────────────
  {
    displayName: 'Labels to Export',
    name: 'exportLabels',
    type: 'string',
    default: '',
    placeholder: 'KNOWS,WORKS_AT',
    description: 'Comma-separated list of edge labels to export (leave blank for all)',
    displayOptions: { show: { resource: ['edge'], operation: ['export'] } },
  },
  {
    displayName: 'Limit',
    name: 'exportLimit',
    type: 'number',
    default: 0,
    description:
      'Maximum number of edges to keep (0 = no limit). Applied client-side: the server streams the whole export, so a limit saves memory but not time.',
    displayOptions: { show: { resource: ['edge'], operation: ['export'] } },
  },
];
