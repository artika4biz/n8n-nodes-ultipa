import {
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class UltipaApi implements ICredentialType {
  name = 'ultipaApi';
  displayName = 'Ultipa API';
  documentationUrl = 'https://docs.ultipa.com';

  properties: INodeProperties[] = [
    {
      displayName: 'Host',
      name: 'host',
      type: 'string',
      default: 'localhost:9000',
      placeholder: 'localhost:9000',
      description: 'Ultipa server host and port (e.g. localhost:9000). For multiple hosts use comma-separated values.',
    },
    {
      displayName: 'Username',
      name: 'username',
      type: 'string',
      default: '',
    },
    {
      displayName: 'Password',
      name: 'password',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'Default Graph',
      name: 'defaultGraph',
      type: 'string',
      default: '',
      description: 'Optional default graph to use for all operations',
    },
    {
      displayName: 'Timeout (ms)',
      name: 'timeout',
      type: 'number',
      default: 30000,
      description: 'Query timeout in milliseconds',
    },
    {
      displayName: 'Use TLS',
      name: 'useTls',
      type: 'boolean',
      default: false,
      description: 'Whether to use TLS/SSL for the connection',
    },
    {
      displayName: 'Max Receive Size (MB)',
      name: 'maxRecvSizeMb',
      type: 'number',
      default: 0,
      description:
        'Largest gRPC message the client will accept (0 = driver default, 64 MB). Raise it when large result sets or exports fail with a message-size error.',
    },
    {
      displayName: 'Connection Pool Size',
      name: 'poolSize',
      type: 'number',
      default: 0,
      description: 'Connections kept per host (0 = driver default, 10)',
    },
    {
      displayName: 'Health Check Interval (ms)',
      name: 'healthCheckInterval',
      type: 'number',
      default: 0,
      description: 'How often the driver health-checks hosts (0 = driver default, 30000)',
    },
    {
      displayName: 'Read Retry Count',
      name: 'retryCount',
      type: 'number',
      default: 3,
      description:
        'How many times a read-only query is retried while a fulltext index is still loading (engine code 5020). Writes are never retried. 0 disables it.',
    },
    {
      displayName: 'Read Retry Delay (ms)',
      name: 'retryDelay',
      type: 'number',
      default: 0,
      description:
        'First wait before such a retry (0 = driver default, 100). The wait doubles each attempt, capped at 2 seconds.',
    },
    {
      displayName: 'Reject USE in Queries',
      name: 'disableUseGraph',
      type: 'boolean',
      default: false,
      description:
        'Whether to reject queries whose leading keyword is USE, which would switch the session graph. Worth enabling when workflows interpolate expressions into GQL. Defence-in-depth only — it inspects query text and is not a tenant boundary; use per-tenant users and RBAC for that.',
    },
  ];

}
