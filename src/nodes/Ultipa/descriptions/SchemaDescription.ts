import { INodeProperties } from 'n8n-workflow';

export const schemaOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['schema'] } },
    options: [
      {
        name: 'Show Labels',
        value: 'showLabels',
        description: 'List all node and edge labels in the current graph',
        action: 'Show labels',
      },
      {
        name: 'Show Node Types',
        value: 'showNodeTypes',
        description: 'List all node labels with their property definitions',
        action: 'Show node types',
      },
      {
        name: 'Show Edge Types',
        value: 'showEdgeTypes',
        description: 'List all edge labels with their property definitions',
        action: 'Show edge types',
      },
      {
        name: 'Create Node Label',
        value: 'createNodeLabel',
        description: 'Add a new node label to the current graph',
        action: 'Create node label',
      },
      {
        name: 'Create Edge Label',
        value: 'createEdgeLabel',
        description: 'Add a new edge label to the current graph',
        action: 'Create edge label',
      },
      {
        name: 'Drop Node Label',
        value: 'dropNodeLabel',
        description: 'Remove a node label from the current graph',
        action: 'Drop node label',
      },
      {
        name: 'Drop Edge Label',
        value: 'dropEdgeLabel',
        description: 'Remove an edge label from the current graph',
        action: 'Drop edge label',
      },
      {
        name: 'Create Node Property',
        value: 'createNodeProperty',
        description: 'Add properties to a node label',
        action: 'Create node property',
      },
      {
        name: 'Create Edge Property',
        value: 'createEdgeProperty',
        description: 'Add properties to an edge label',
        action: 'Create edge property',
      },
      {
        name: 'Drop Node Property',
        value: 'dropNodeProperty',
        description: 'Remove properties from a node label',
        action: 'Drop node property',
      },
      {
        name: 'Drop Edge Property',
        value: 'dropEdgeProperty',
        description: 'Remove properties from an edge label',
        action: 'Drop edge property',
      },
      {
        name: 'Show Index',
        value: 'showIndex',
        description: 'List all indexes in the current graph',
        action: 'Show indexes',
      },
      {
        name: 'Create Node Index',
        value: 'createNodeIndex',
        description: 'Create an index on a node label property',
        action: 'Create node index',
      },
      {
        name: 'Create Edge Index',
        value: 'createEdgeIndex',
        description: 'Create an index on an edge label property',
        action: 'Create edge index',
      },
      {
        name: 'Drop Node Index',
        value: 'dropNodeIndex',
        description: 'Drop a node index by name',
        action: 'Drop node index',
      },
      {
        name: 'Drop Edge Index',
        value: 'dropEdgeIndex',
        description: 'Drop an edge index by name',
        action: 'Drop edge index',
      },
      {
        name: 'Show Fulltext',
        value: 'showFulltext',
        description: 'List all fulltext indexes in the current graph',
        action: 'Show fulltext indexes',
      },
      {
        name: 'Create Node Fulltext',
        value: 'createNodeFulltext',
        description: 'Create a fulltext index on a node label',
        action: 'Create node fulltext index',
      },
      {
        name: 'Create Edge Fulltext',
        value: 'createEdgeFulltext',
        description: 'Create a fulltext index on an edge label',
        action: 'Create edge fulltext index',
      },
      {
        name: 'Drop Node Fulltext',
        value: 'dropNodeFulltext',
        description: 'Drop a node fulltext index by name',
        action: 'Drop node fulltext index',
      },
      {
        name: 'Drop Edge Fulltext',
        value: 'dropEdgeFulltext',
        description: 'Drop an edge fulltext index by name',
        action: 'Drop edge fulltext index',
      },
    ],
    default: 'showLabels',
  },
];

export const schemaFields: INodeProperties[] = [
  // ── Graph Name (all schema operations except pure show-* ─────────────────
  {
    displayName: 'Graph Name',
    name: 'graphName',
    type: 'string',
    default: '',
    description: 'Graph to operate on (overrides credential default)',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: [
          'showLabels',
          'showNodeTypes',
          'showEdgeTypes',
          'createNodeLabel',
          'createEdgeLabel',
          'dropNodeLabel',
          'dropEdgeLabel',
          'createNodeProperty',
          'createEdgeProperty',
          'dropNodeProperty',
          'dropEdgeProperty',
          'showIndex',
          'createNodeIndex',
          'createEdgeIndex',
          'dropNodeIndex',
          'dropEdgeIndex',
          'showFulltext',
          'createNodeFulltext',
          'createEdgeFulltext',
          'dropNodeFulltext',
          'dropEdgeFulltext',
        ],
      },
    },
  },

  // ── Label name ────────────────────────────────────────────────────────────
  {
    displayName: 'Label Name',
    name: 'labelName',
    type: 'string',
    required: true,
    default: '',
    description: 'Name of the node or edge label',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: [
          'createNodeLabel',
          'createEdgeLabel',
          'dropNodeLabel',
          'dropEdgeLabel',
          'createNodeProperty',
          'createEdgeProperty',
          'dropNodeProperty',
          'dropEdgeProperty',
          'createNodeIndex',
          'createEdgeIndex',
          'createNodeFulltext',
          'createEdgeFulltext',
        ],
      },
    },
  },

  // ── Properties JSON (for create label / create property) ─────────────────
  {
    displayName: 'Properties (JSON Array)',
    name: 'propertiesJson',
    type: 'json',
    default: '[{"name":"age","type":"INT64"},{"name":"name","type":"STRING"}]',
    description:
      'Array of property definitions. Each must have "name" (string) and "type" (GQL type string: STRING, INT64, DOUBLE, BOOL, TIMESTAMP, …). Leave as [] for labels with no properties.',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: [
          'createNodeLabel',
          'createEdgeLabel',
          'createNodeProperty',
          'createEdgeProperty',
        ],
      },
    },
  },

  // ── Property names to drop ────────────────────────────────────────────────
  {
    displayName: 'Property Names',
    name: 'propertyNames',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'age,name',
    description: 'Comma-separated list of property names to drop',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: ['dropNodeProperty', 'dropEdgeProperty'],
      },
    },
  },

  // ── Index name ────────────────────────────────────────────────────────────
  {
    displayName: 'Index Name',
    name: 'indexName',
    type: 'string',
    required: true,
    default: '',
    description: 'Name of the index',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: [
          'createNodeIndex',
          'createEdgeIndex',
          'dropNodeIndex',
          'dropEdgeIndex',
          'createNodeFulltext',
          'createEdgeFulltext',
          'dropNodeFulltext',
          'dropEdgeFulltext',
        ],
      },
    },
  },

  // ── Index properties ──────────────────────────────────────────────────────
  {
    displayName: 'Index Properties (JSON Array)',
    name: 'indexPropertiesJson',
    type: 'json',
    default: '[{"name":"age"},{"name":"name","prefixLength":10}]',
    description:
      'Array of index property objects with "name" and optional "prefixLength" (for STRING prefix indexes)',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: ['createNodeIndex', 'createEdgeIndex'],
      },
    },
  },

  // ── Fulltext properties ───────────────────────────────────────────────────
  {
    displayName: 'Fulltext Properties',
    name: 'fulltextProperties',
    type: 'string',
    required: true,
    default: '',
    placeholder: 'name,bio',
    description: 'Comma-separated list of property names to include in the fulltext index',
    displayOptions: {
      show: {
        resource: ['schema'],
        operation: ['createNodeFulltext', 'createEdgeFulltext'],
      },
    },
  },
];
