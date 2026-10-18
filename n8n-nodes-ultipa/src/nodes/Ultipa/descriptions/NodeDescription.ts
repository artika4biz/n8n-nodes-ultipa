import { INodeProperties } from 'n8n-workflow';

export const nodeOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['node'] } },
    options: [
      {
        name: 'Insert',
        value: 'insert',
        description: 'Insert one or more nodes using GQL INSERT',
        action: 'Insert nodes',
      },
      {
        name: 'Delete',
        value: 'delete',
        description: 'Delete nodes by ID, label, or WHERE filter',
        action: 'Delete nodes',
      },
      {
        name: 'Export',
        value: 'export',
        description: 'Stream/export nodes from a graph',
        action: 'Export nodes',
      },
    ],
    default: 'insert',
  },
];

export const nodeFields: INodeProperties[] = [
  // ── Shared: graph name ───────────────────────────────────────────────────
  {
    displayName: 'Graph Name',
    name: 'graphName',
    type: 'string',
    required: true,
    default: '',
    description: 'Name of the graph to operate on',
    displayOptions: {
      show: { resource: ['node'], operation: ['insert', 'delete', 'export'] },
    },
  },

  // ── INSERT ───────────────────────────────────────────────────────────────
  {
    displayName: 'Nodes (JSON Array)',
    name: 'nodesJson',
    type: 'json',
    required: true,
    default: '[{"labels":["Person"],"properties":{"name":"Alice","age":30}}]',
    description:
      'Array of node objects. Each object must have "labels" (string[]) and "properties" (object). Optionally include "id" (string) to set a custom _id.',
    displayOptions: { show: { resource: ['node'], operation: ['insert'] } },
  },
  {
    displayName: 'Insert Mode',
    name: 'insertMode',
    type: 'options',
    options: [
      { name: 'Normal', value: 'normal', description: 'Fail if the node already exists' },
      {
        name: 'Overwrite',
        value: 'overwrite',
        description:
          'Replace an existing node wholesale on a duplicate _id. Properties absent from this write are LOST.',
      },
      {
        name: 'Upsert',
        value: 'upsert',
        description:
          'Merge into an existing node on a duplicate _id. Properties absent from this write are preserved; those present overwrite. Falls back to a plain insert when no _id matches.',
      },
    ],
    default: 'normal',
    displayOptions: { show: { resource: ['node'], operation: ['insert'] } },
  },

  // ── DELETE ───────────────────────────────────────────────────────────────
  {
    displayName: 'Node IDs',
    name: 'nodeIds',
    type: 'string',
    default: '',
    placeholder: 'id1,id2,id3',
    description: 'Comma-separated list of node IDs to delete (leave blank to use label/where filter)',
    displayOptions: { show: { resource: ['node'], operation: ['delete'] } },
  },
  {
    displayName: 'Labels',
    name: 'labels',
    type: 'string',
    default: '',
    placeholder: 'Person,Company',
    description: 'Comma-separated list of labels to delete nodes from',
    displayOptions: { show: { resource: ['node'], operation: ['delete'] } },
  },
  {
    displayName: 'Where Clause',
    name: 'whereClause',
    type: 'string',
    default: '',
    placeholder: 'n.age > 30',
    description: 'Optional WHERE filter expression to narrow the deletion',
    displayOptions: { show: { resource: ['node'], operation: ['delete'] } },
  },
  {
    displayName: 'Limit',
    name: 'deleteLimit',
    type: 'number',
    default: 0,
    description:
      'Maximum number of nodes to delete (0 = no limit). Applies to the label/WHERE filter only, not to an explicit ID list.',
    displayOptions: { show: { resource: ['node'], operation: ['delete'] } },
  },
  {
    displayName: 'Return Deleted',
    name: 'returnDeleted',
    type: 'boolean',
    default: true,
    description:
      'Whether to return the full data of each deleted node. Turn off on large bulk deletes to save bandwidth; the affected-row count is still reported.',
    displayOptions: { show: { resource: ['node'], operation: ['delete'] } },
  },
  {
    displayName: 'Allow Delete All',
    name: 'allowDeleteAll',
    type: 'boolean',
    default: false,
    description:
      'Safety latch. With no IDs, no label and no WHERE clause the operation would delete every node in the graph, and the driver refuses unless this is enabled.',
    displayOptions: { show: { resource: ['node'], operation: ['delete'] } },
  },

  // ── EXPORT ───────────────────────────────────────────────────────────────
  {
    displayName: 'Labels to Export',
    name: 'exportLabels',
    type: 'string',
    default: '',
    placeholder: 'Person,Company',
    description: 'Comma-separated list of labels to export (leave blank for all)',
    displayOptions: { show: { resource: ['node'], operation: ['export'] } },
  },
  {
    displayName: 'Limit',
    name: 'exportLimit',
    type: 'number',
    default: 0,
    description:
      'Maximum number of nodes to keep (0 = no limit). Applied client-side: the server streams the whole export, so a limit saves memory but not time.',
    displayOptions: { show: { resource: ['node'], operation: ['export'] } },
  },
];
