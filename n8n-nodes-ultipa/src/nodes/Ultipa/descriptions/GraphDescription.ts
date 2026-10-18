import { INodeProperties } from 'n8n-workflow';

export const graphOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['graph'] } },
    options: [
      {
        name: 'List Graphs',
        value: 'list',
        description: 'Return all available graphs',
        action: 'List graphs',
      },
      {
        name: 'Get Info',
        value: 'info',
        description: 'Return details about a specific graph',
        action: 'Get graph info',
      },
      {
        name: 'Create',
        value: 'create',
        description: 'Create a new graph',
        action: 'Create a graph',
      },
      {
        name: 'Drop',
        value: 'drop',
        description: 'Delete a graph and all its data',
        action: 'Drop a graph',
      },
      {
        name: 'Use',
        value: 'use',
        description: 'Set the active graph for the session',
        action: 'Use a graph',
      },
      {
        name: 'Truncate',
        value: 'truncate',
        description: 'Remove all data from a graph while keeping the schema',
        action: 'Truncate a graph',
      },
      {
        name: 'Rename',
        value: 'rename',
        description: 'Rename an existing graph',
        action: 'Rename a graph',
      },
      {
        name: 'Stats',
        value: 'stats',
        description: 'Return node/edge count statistics for the current graph',
        action: 'Get graph stats',
      },
    ],
    default: 'list',
  },
];

export const graphFields: INodeProperties[] = [
  // ── Graph name (most operations) ─────────────────────────────────────────
  {
    displayName: 'Graph Name',
    name: 'graphName',
    type: 'string',
    required: true,
    default: '',
    description: 'Name of the graph',
    displayOptions: {
      show: {
        resource: ['graph'],
        operation: ['info', 'create', 'drop', 'use', 'truncate', 'rename', 'stats'],
      },
    },
  },

  // ── CREATE ────────────────────────────────────────────────────────────────
  {
    displayName: 'Graph Type',
    name: 'graphType',
    type: 'options',
    options: [
      { name: 'Open (Schema-less)', value: 'open' },
      { name: 'Closed (Schema-enforced)', value: 'closed' },
      { name: 'Ontology', value: 'ontology' },
    ],
    default: 'open',
    displayOptions: { show: { resource: ['graph'], operation: ['create'] } },
  },
  {
    displayName: 'Description',
    name: 'graphDescription',
    type: 'string',
    default: '',
    description: 'Optional description for the new graph',
    displayOptions: { show: { resource: ['graph'], operation: ['create'] } },
  },
  {
    displayName: 'Create If Not Exists',
    name: 'ifNotExists',
    type: 'boolean',
    default: false,
    description: 'Whether to silently skip creation when the graph already exists',
    displayOptions: { show: { resource: ['graph'], operation: ['create'] } },
  },

  // ── DROP ──────────────────────────────────────────────────────────────────
  {
    displayName: 'Drop If Exists',
    name: 'ifExists',
    type: 'boolean',
    default: false,
    description: 'Whether to silently skip when the graph does not exist',
    displayOptions: { show: { resource: ['graph'], operation: ['drop'] } },
  },

  // ── RENAME ────────────────────────────────────────────────────────────────
  {
    displayName: 'New Name',
    name: 'newName',
    type: 'string',
    required: true,
    default: '',
    description: 'New name for the graph',
    displayOptions: { show: { resource: ['graph'], operation: ['rename'] } },
  },
];
