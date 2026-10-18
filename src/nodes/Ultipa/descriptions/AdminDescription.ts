import { INodeProperties } from 'n8n-workflow';

export const adminOperations: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: { show: { resource: ['admin'] } },
    options: [
      {
        name: 'Health Check',
        value: 'healthCheck',
        description: 'Check the health status of the database service',
        action: 'Health check',
      },
      {
        name: 'Get Statistics',
        value: 'getStatistics',
        description: 'Return node/edge counts and label statistics',
        action: 'Get statistics',
      },
      {
        name: 'Get System Metrics',
        value: 'getSystemMetrics',
        description: 'Return CPU, memory, disk I/O, storage, and network metrics',
        action: 'Get system metrics',
      },
      {
        name: 'Get Cache Stats',
        value: 'getCacheStats',
        description: 'Return AST and plan cache statistics',
        action: 'Get cache stats',
      },
      {
        name: 'Clear Cache',
        value: 'clearCache',
        description: 'Flush the database query or plan cache',
        action: 'Clear cache',
      },
      {
        name: 'Compact',
        value: 'compact',
        description: 'Trigger manual compaction of the database storage',
        action: 'Compact database',
      },
      {
        name: 'Warmup Parser',
        value: 'warmupParser',
        description: 'Pre-allocate parser instances to warm up the query engine',
        action: 'Warmup parser',
      },
      {
        name: 'Show Tasks',
        value: 'showTasks',
        description: 'Return all background tasks in the current graph',
        action: 'Show tasks',
      },
      {
        name: 'Stop Task',
        value: 'stopTask',
        description: 'Stop a running background task by ID',
        action: 'Stop task',
      },
      {
        name: 'Delete Task',
        value: 'deleteTask',
        description: 'Delete a completed or stopped task by ID',
        action: 'Delete task',
      },
      {
        name: 'List Running Queries (Top)',
        value: 'top',
        description: 'Return currently running queries',
        action: 'List running queries',
      },
      {
        name: 'Kill Query',
        value: 'killQuery',
        description: 'Terminate a running query by its query ID',
        action: 'Kill query',
      },
      {
        name: 'List Transactions',
        value: 'listTransactions',
        description: 'Return all active transactions',
        action: 'List transactions',
      },
      {
        name: 'Ping',
        value: 'ping',
        description: 'Check the connection and return the round-trip latency in nanoseconds',
        action: 'Ping server',
      },
    ],
    default: 'healthCheck',
  },
];

export const adminFields: INodeProperties[] = [
  // ── Health Check ──────────────────────────────────────────────────────────
  {
    displayName: 'Service Name',
    name: 'serviceName',
    type: 'string',
    default: '',
    description: 'Optional service name to check (leave blank for default)',
    displayOptions: { show: { resource: ['admin'], operation: ['healthCheck'] } },
  },

  // ── Get Statistics ────────────────────────────────────────────────────────
  {
    displayName: 'Graph Name',
    name: 'graphName',
    type: 'string',
    default: '',
    description: 'Graph to retrieve statistics for (leave blank for global statistics)',
    displayOptions: { show: { resource: ['admin'], operation: ['getStatistics'] } },
  },

  // ── Cache operations ──────────────────────────────────────────────────────
  {
    displayName: 'Cache Type',
    name: 'cacheType',
    type: 'options',
    options: [
      { name: 'All', value: 'all' },
      { name: 'AST Cache', value: 'ast' },
      { name: 'Plan Cache', value: 'plan' },
    ],
    default: 'all',
    displayOptions: {
      show: { resource: ['admin'], operation: ['getCacheStats', 'clearCache'] },
    },
  },

  // ── Warmup Parser ─────────────────────────────────────────────────────────
  {
    displayName: 'Parser Count',
    name: 'parserCount',
    type: 'number',
    required: true,
    default: 4,
    description: 'Number of parser instances to pre-allocate',
    displayOptions: { show: { resource: ['admin'], operation: ['warmupParser'] } },
  },

  // ── Task ID ───────────────────────────────────────────────────────────────
  {
    displayName: 'Task ID',
    name: 'taskId',
    type: 'string',
    required: true,
    default: '',
    description: 'ID of the task to stop or delete',
    displayOptions: {
      show: { resource: ['admin'], operation: ['stopTask', 'deleteTask'] },
    },
  },

  // ── Kill Query ────────────────────────────────────────────────────────────
  {
    displayName: 'Query ID',
    name: 'queryId',
    type: 'string',
    required: true,
    default: '',
    description: 'ID of the running query to terminate',
    displayOptions: { show: { resource: ['admin'], operation: ['killQuery'] } },
  },
];
