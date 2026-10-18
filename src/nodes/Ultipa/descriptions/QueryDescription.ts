import { INodeProperties } from 'n8n-workflow';

export const queryOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['query'] } },
    options: [
      {
        name: 'Execute GQL',
        value: 'execute',
        description: 'Execute a GQL query and return the results',
        action: 'Execute a GQL query',
      },
      {
        name: 'Explain',
        value: 'explain',
        description: 'Return the execution plan for a GQL query without running it',
        action: 'Explain a GQL query',
      },
      {
        name: 'Profile',
        value: 'profile',
        description: 'Execute a GQL query with profiling statistics',
        action: 'Profile a GQL query',
      },
    ],
    default: 'execute',
  },
];

export const queryFields: INodeProperties[] = [
  // ── execute / explain / profile ──────────────────────────────────────────
  {
    displayName: 'GQL Query',
    name: 'query',
    type: 'string',
    typeOptions: { rows: 5 },
    required: true,
    default: '',
    placeholder: 'MATCH (n) RETURN n LIMIT 10',
    description: 'The GQL query to execute',
    displayOptions: {
      show: { resource: ['query'], operation: ['execute', 'explain', 'profile'] },
    },
  },
  {
    displayName: 'Graph Name',
    name: 'graphName',
    type: 'string',
    default: '',
    description: 'Graph to run the query against (overrides credential default)',
    displayOptions: {
      show: { resource: ['query'], operation: ['execute', 'explain', 'profile'] },
    },
  },
  {
    displayName: 'Query Parameters (JSON)',
    name: 'parameters',
    type: 'json',
    default: '{}',
    description: 'Named parameters to pass with the query as a JSON object',
    displayOptions: {
      show: { resource: ['query'], operation: ['execute'] },
    },
  },
  {
    displayName: 'Timeout (ms)',
    name: 'queryTimeout',
    type: 'number',
    default: 0,
    description: 'Per-query timeout in milliseconds (0 = use credential default)',
    displayOptions: {
      show: { resource: ['query'], operation: ['execute'] },
    },
  },
  {
    displayName: 'Read Only',
    name: 'readOnly',
    type: 'boolean',
    default: false,
    description: 'Whether to mark the query as read-only',
    displayOptions: {
      show: { resource: ['query'], operation: ['execute'] },
    },
  },
  {
    displayName: 'Max Path Results',
    name: 'maxPathResults',
    type: 'number',
    default: 0,
    description: 'Maximum paths to return from path queries (0 = unlimited)',
    displayOptions: {
      show: { resource: ['query'], operation: ['execute'] },
    },
  },
];
