#!/usr/bin/env bun
/**
 * MySQL Agent - Single-File Implementation
 *
 * A MySQL database agent using OpenAI Agents SDK and Bun.js native SQL driver.
 *
 * CLI Usage:
 *   bun mysql-agent.ts --task test-connection
 *   bun mysql-agent.ts --task list-tables
 *   bun mysql-agent.ts --task list-tables --include-counts
 *   bun mysql-agent.ts --task get-schema --table users
 *   bun mysql-agent.ts --task query --sql "SELECT * FROM users LIMIT 10"
 *   bun mysql-agent.ts --chat "What tables are in this database?"
 *   bun mysql-agent.ts --interactive
 *
 * Server Usage:
 *   import { executeMySQLTask, runMySQLAgent, MySQLAgentTasks } from "./mysql-agent.ts";
 *
 *   // Task-based execution
 *   const tables = await executeMySQLTask({ task: MySQLAgentTasks.LIST_TABLES });
 *
 *   // Natural language query
 *   const result = await runMySQLAgent("Show me all users created today");
 *
 * Environment Variables:
 *   OPENAI_API_KEY    - Required: OpenAI API key
 *   MYSQL_URL         - MySQL connection URL
 *   MYSQL_HOST        - MySQL host (default: localhost)
 *   MYSQL_PORT        - MySQL port (default: 3306)
 *   MYSQL_USER        - MySQL username (default: root)
 *   MYSQL_PASS        - MySQL password
 *   MYSQL_DB          - MySQL database name
 *   MYSQL_ALLOW_WRITE - Enable write operations (default: false)
 *   MYSQL_ROW_LIMIT   - Max rows per query (default: 1000)
 *   AGENT_MODEL       - OpenAI model (default: gpt-4o-mini)
 *   AGENT_MAX_TURNS   - Max agent turns per request (default: 10)
 */

import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";
import mysql from "mysql2/promise";
import { parseArgs } from "util";

type MySQLConnection = mysql.Connection;

// ============================================================================
// TYPES
// ============================================================================

/** Available predefined tasks */
export enum MySQLAgentTasks {
  TEST_CONNECTION = "test-connection",
  LIST_TABLES = "list-tables",
  GET_SCHEMA = "get-schema",
  GET_ALL_SCHEMAS = "get-all-schemas",
  QUERY = "query",
  CHAT = "chat",
}

/** Configuration options for the agent */
export interface MySQLAgentConfig {
  openaiApiKey?: string;
  mysqlUrl?: string;
  mysqlHost?: string;
  mysqlPort?: number;
  mysqlUser?: string;
  mysqlPass?: string;
  mysqlDb?: string;
  allowWrite?: boolean;
  rowLimit?: number;
  model?: string;
  maxTurns?: number;
}

/** Parameters for LIST_TABLES task */
export interface ListTablesParams {
  includeRowCounts?: boolean;
}

/** Parameters for GET_SCHEMA task */
export interface GetSchemaParams {
  tableName: string;
}

/** Parameters for QUERY task */
export interface QueryParams {
  sql: string;
  allowWrite?: boolean;
}

/** Parameters for CHAT task */
export interface ChatParams {
  message: string;
}

/** Union type for all task parameters */
export type TaskParams =
  | { task: MySQLAgentTasks.TEST_CONNECTION }
  | { task: MySQLAgentTasks.LIST_TABLES; params?: ListTablesParams }
  | { task: MySQLAgentTasks.GET_SCHEMA; params: GetSchemaParams }
  | { task: MySQLAgentTasks.GET_ALL_SCHEMAS }
  | { task: MySQLAgentTasks.QUERY; params: QueryParams }
  | { task: MySQLAgentTasks.CHAT; params: ChatParams };

/** Standard result format */
export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  duration_ms?: number;
}

/** Table information */
export interface TableInfo {
  table_name: string;
  table_type: string;
  engine: string | null;
  estimated_rows: number | null;
  created_at: string | null;
  updated_at: string | null;
  exact_row_count?: number;
}

/** Column information */
export interface ColumnInfo {
  name: string;
  type: string;
  full_type: string;
  nullable: string;
  default_value: string | null;
  key_type: string;
  extra: string;
  comment: string;
}

/** Index information */
export interface IndexInfo {
  name: string;
  columns: string;
  non_unique: number;
  type: string;
}

/** Foreign key information */
export interface ForeignKeyInfo {
  name: string;
  column_name: string;
  referenced_table: string;
  referenced_column: string;
}

/** Table schema */
export interface TableSchema {
  table: string;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
}

/** Connection info */
export interface ConnectionInfo {
  version: string;
  database: string;
  user: string;
}

/** Query result */
export interface QueryResult {
  rows: Record<string, unknown>[];
  row_count: number;
  duration_ms: number;
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

let _db: MySQLConnection | null = null;
let _config: MySQLAgentConfig = {};

function getConfig(): Required<MySQLAgentConfig> {
  return {
    openaiApiKey: _config.openaiApiKey || Bun.env.OPENAI_API_KEY || "",
    mysqlUrl: _config.mysqlUrl || Bun.env.MYSQL_URL || "",
    mysqlHost: _config.mysqlHost || Bun.env.MYSQL_HOST || "localhost",
    mysqlPort: _config.mysqlPort || parseInt(Bun.env.MYSQL_PORT || "3306", 10),
    mysqlUser: _config.mysqlUser || Bun.env.MYSQL_USER || "root",
    mysqlPass: _config.mysqlPass || Bun.env.MYSQL_PASS || "",
    mysqlDb: _config.mysqlDb || Bun.env.MYSQL_DB || "mysql",
    allowWrite: _config.allowWrite ?? Bun.env.MYSQL_ALLOW_WRITE === "true",
    rowLimit: _config.rowLimit || parseInt(Bun.env.MYSQL_ROW_LIMIT || "1000", 10),
    model: _config.model || Bun.env.AGENT_MODEL || "gpt-4o-mini",
    maxTurns: _config.maxTurns || parseInt(Bun.env.AGENT_MAX_TURNS || "10", 10),
  };
}

function getConnectionConfig(): mysql.ConnectionOptions {
  const config = getConfig();

  if (config.mysqlUrl) {
    return { uri: config.mysqlUrl };
  }

  return {
    host: config.mysqlHost,
    port: config.mysqlPort,
    user: config.mysqlUser,
    password: config.mysqlPass,
    database: config.mysqlDb,
  };
}

async function getConnection(): Promise<MySQLConnection> {
  if (!_db) {
    _db = await mysql.createConnection(getConnectionConfig());
  }
  return _db;
}

/** Close the database connection */
export async function closeConnection(): Promise<void> {
  if (_db) {
    await _db.end();
    _db = null;
  }
}

/** Configure the agent (call before using in server mode) */
export async function configureAgent(config: MySQLAgentConfig): Promise<void> {
  _config = { ..._config, ...config };
  if (_db) {
    await _db.end();
    _db = null;
  }
}

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function testConnectionImpl(): Promise<ConnectionInfo> {
  const db = await getConnection();
  const [rows] = await db.execute<mysql.RowDataPacket[]>(`
    SELECT
      VERSION() as version,
      DATABASE() as db_name,
      USER() as db_user
  `);
  const info = rows[0];
  return {
    version: info.version,
    database: info.db_name,
    user: info.db_user,
  };
}

async function listTablesImpl(includeRowCounts = false): Promise<TableInfo[]> {
  const db = await getConnection();

  const [rows] = await db.execute<mysql.RowDataPacket[]>(`
    SELECT
      TABLE_NAME as table_name,
      TABLE_TYPE as table_type,
      ENGINE as engine,
      TABLE_ROWS as estimated_rows,
      CREATE_TIME as created_at,
      UPDATE_TIME as updated_at
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME
  `);

  const tables = rows as TableInfo[];

  if (includeRowCounts) {
    return Promise.all(
      tables.map(async (t) => {
        if (t.table_type === "BASE TABLE") {
          const [countRows] = await db.execute<mysql.RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM \`${t.table_name}\``
          );
          return { ...t, exact_row_count: Number(countRows[0].count) };
        }
        return t;
      })
    );
  }

  return tables;
}

async function getSchemaImpl(tableName: string): Promise<TableSchema> {
  const db = await getConnection();

  const [colRows] = await db.execute<mysql.RowDataPacket[]>(`
    SELECT
      COLUMN_NAME as name,
      DATA_TYPE as type,
      COLUMN_TYPE as full_type,
      IS_NULLABLE as nullable,
      COLUMN_DEFAULT as default_value,
      COLUMN_KEY as key_type,
      EXTRA as extra,
      COLUMN_COMMENT as comment
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `, [tableName]);

  const [idxRows] = await db.execute<mysql.RowDataPacket[]>(`
    SELECT
      INDEX_NAME as name,
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
      NON_UNIQUE as non_unique,
      INDEX_TYPE as type
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
    GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
  `, [tableName]);

  const [fkRows] = await db.execute<mysql.RowDataPacket[]>(`
    SELECT
      CONSTRAINT_NAME as name,
      COLUMN_NAME as column_name,
      REFERENCED_TABLE_NAME as referenced_table,
      REFERENCED_COLUMN_NAME as referenced_column
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `, [tableName]);

  return {
    table: tableName,
    columns: colRows as ColumnInfo[],
    indexes: idxRows as IndexInfo[],
    foreign_keys: fkRows as ForeignKeyInfo[],
  };
}

async function getAllSchemasImpl(): Promise<TableSchema[]> {
  const db = await getConnection();

  const [rows] = await db.execute<mysql.RowDataPacket[]>(`
    SELECT TABLE_NAME as name
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
  `);

  return Promise.all(
    rows.map((t) => getSchemaImpl(t.name))
  );
}

const WRITE_PATTERNS = /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE)/i;

function isWriteQuery(sql: string): boolean {
  return WRITE_PATTERNS.test(sql.trim());
}

function enforceLimit(sql: string, limit: number): string {
  const normalized = sql.trim().toUpperCase();
  if (normalized.startsWith("SELECT") && !normalized.includes(" LIMIT ")) {
    return `${sql.trim()} LIMIT ${limit}`;
  }
  return sql;
}

async function runQueryImpl(sql: string, allowWrite = false): Promise<QueryResult> {
  const config = getConfig();
  const db = await getConnection();

  if (isWriteQuery(sql)) {
    if (!allowWrite) {
      throw new Error("Write operations require allowWrite=true parameter");
    }
    if (!config.allowWrite) {
      throw new Error("Write operations disabled by configuration. Set MYSQL_ALLOW_WRITE=true");
    }
  }

  const finalSql = enforceLimit(sql, config.rowLimit);

  const startTime = performance.now();
  const [result] = await db.execute<mysql.RowDataPacket[]>(finalSql);
  const duration = performance.now() - startTime;

  const rows = Array.isArray(result) ? result : [];

  return {
    rows: rows as Record<string, unknown>[],
    row_count: rows.length,
    duration_ms: Math.round(duration * 100) / 100,
  };
}

// ============================================================================
// AGENT TOOLS (OpenAI Agents SDK)
// ============================================================================

const testConnectionTool = tool({
  name: "test_connection",
  description: "Test the MySQL database connection and return server information. Always call this first to verify connectivity.",
  parameters: z.object({}),
  async execute(): Promise<string> {
    try {
      const info = await testConnectionImpl();
      return JSON.stringify({ status: "connected", ...info }, null, 2);
    } catch (error) {
      return JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }, null, 2);
    }
  },
});

const listTablesTool = tool({
  name: "list_tables",
  description: "List all tables in the current database with metadata.",
  parameters: z.object({
    include_row_counts: z.boolean()
      .optional()
      .default(false)
      .describe("Fetch exact row counts (slower but accurate)"),
  }),
  async execute({ include_row_counts }): Promise<string> {
    try {
      const tables = await listTablesImpl(include_row_counts);
      return JSON.stringify(tables, null, 2);
    } catch (error) {
      return JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }, null, 2);
    }
  },
});

const getSchemaTool = tool({
  name: "get_schema",
  description: "Get the schema for a specific table including columns, indexes, and foreign keys.",
  parameters: z.object({
    table_name: z.string().describe("The table name to inspect"),
  }),
  async execute({ table_name }): Promise<string> {
    try {
      const schema = await getSchemaImpl(table_name);
      return JSON.stringify(schema, null, 2);
    } catch (error) {
      return JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        table: table_name,
      }, null, 2);
    }
  },
});

const getAllSchemasTool = tool({
  name: "get_all_schemas",
  description: "Get schemas for all tables. Use sparingly for large databases.",
  parameters: z.object({}),
  async execute(): Promise<string> {
    try {
      const schemas = await getAllSchemasImpl();
      return JSON.stringify(schemas, null, 2);
    } catch (error) {
      return JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }, null, 2);
    }
  },
});

const runQueryTool = tool({
  name: "run_query",
  description: `Execute a SQL query. SELECT queries are auto-limited. Write operations require explicit permission.`,
  parameters: z.object({
    sql: z.string().describe("The SQL query to execute"),
    allow_write: z.boolean()
      .optional()
      .default(false)
      .describe("Enable INSERT/UPDATE/DELETE (requires env permission)"),
  }),
  async execute({ sql, allow_write }): Promise<string> {
    try {
      const result = await runQueryImpl(sql, allow_write);
      return JSON.stringify(result, null, 2);
    } catch (error) {
      return JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      }, null, 2);
    }
  },
});

// ============================================================================
// AGENT DEFINITION
// ============================================================================

function createAgent(): Agent {
  const config = getConfig();

  return new Agent({
    name: "MySQL Assistant",
    model: config.model,
    instructions: `You are a MySQL database assistant. Help users explore and query databases safely.

## Tools Available
- test_connection: Verify database connectivity
- list_tables: List all tables with metadata
- get_schema: Inspect table structure
- get_all_schemas: Get all table schemas
- run_query: Execute SQL queries

## Guidelines
1. Always test connection first
2. Explore schema before writing queries
3. Write efficient queries with appropriate filters
4. Explain what you're doing
5. Summarize large results

## Security
- Queries are READ-ONLY by default
- SELECT limited to ${config.rowLimit} rows
- Never expose credentials`,

    tools: [
      testConnectionTool,
      listTablesTool,
      getSchemaTool,
      getAllSchemasTool,
      runQueryTool,
    ],
  });
}

// ============================================================================
// PUBLIC API (Server Mode)
// ============================================================================

/**
 * Execute a predefined MySQL task
 */
export async function executeMySQLTask<T = unknown>(
  taskInput: TaskParams,
  config?: MySQLAgentConfig
): Promise<AgentResult<T>> {
  if (config) {
    await configureAgent(config);
  }

  const startTime = performance.now();

  try {
    let data: unknown;

    switch (taskInput.task) {
      case MySQLAgentTasks.TEST_CONNECTION:
        data = await testConnectionImpl();
        break;

      case MySQLAgentTasks.LIST_TABLES:
        data = await listTablesImpl(taskInput.params?.includeRowCounts);
        break;

      case MySQLAgentTasks.GET_SCHEMA:
        data = await getSchemaImpl(taskInput.params.tableName);
        break;

      case MySQLAgentTasks.GET_ALL_SCHEMAS:
        data = await getAllSchemasImpl();
        break;

      case MySQLAgentTasks.QUERY:
        data = await runQueryImpl(taskInput.params.sql, taskInput.params.allowWrite);
        break;

      case MySQLAgentTasks.CHAT:
        const agent = createAgent();
        const result = await run(agent, taskInput.params.message, {
          maxTurns: getConfig().maxTurns,
        });
        data = result.finalOutput;
        break;

      default:
        throw new Error(`Unknown task: ${(taskInput as any).task}`);
    }

    return {
      success: true,
      data: data as T,
      duration_ms: Math.round((performance.now() - startTime) * 100) / 100,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }
}

/**
 * Run the MySQL agent with a natural language prompt
 */
export async function runMySQLAgent(
  prompt: string,
  config?: MySQLAgentConfig
): Promise<AgentResult<string>> {
  return executeMySQLTask<string>({
    task: MySQLAgentTasks.CHAT,
    params: { message: prompt },
  }, config);
}

/**
 * Execute a raw SQL query directly (bypasses agent)
 */
export async function executeQuery(
  sql: string,
  options?: { allowWrite?: boolean; config?: MySQLAgentConfig }
): Promise<AgentResult<QueryResult>> {
  if (options?.config) {
    await configureAgent(options.config);
  }

  return executeMySQLTask<QueryResult>({
    task: MySQLAgentTasks.QUERY,
    params: { sql, allowWrite: options?.allowWrite },
  });
}

// ============================================================================
// CLI MODE
// ============================================================================

async function runCLI(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      task: { type: "string", short: "t" },
      table: { type: "string" },
      sql: { type: "string", short: "s" },
      chat: { type: "string", short: "c" },
      interactive: { type: "boolean", short: "i" },
      "include-counts": { type: "boolean" },
      "allow-write": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      json: { type: "boolean", short: "j" },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`
MySQL Agent - Single-File Database Assistant

USAGE:
  bun mysql-agent.ts [OPTIONS]

TASK MODE:
  --task, -t <task>     Execute a predefined task
                        Tasks: test-connection, list-tables, get-schema,
                               get-all-schemas, query

  --table <name>        Table name (for get-schema)
  --sql, -s <query>     SQL query (for query task)
  --include-counts      Include row counts (for list-tables)
  --allow-write         Allow write operations (for query task)

CHAT MODE:
  --chat, -c <message>  Send a natural language query to the agent
  --interactive, -i     Start interactive chat mode

OUTPUT:
  --json, -j            Output raw JSON (default: formatted)

EXAMPLES:
  bun mysql-agent.ts --task test-connection
  bun mysql-agent.ts --task list-tables --include-counts
  bun mysql-agent.ts --task get-schema --table users
  bun mysql-agent.ts --task query --sql "SELECT * FROM users LIMIT 5"
  bun mysql-agent.ts --chat "What tables contain user data?"
  bun mysql-agent.ts --interactive

ENVIRONMENT:
  OPENAI_API_KEY      Required for chat mode
  MYSQL_URL           MySQL connection URL
  MYSQL_ALLOW_WRITE   Enable write operations (default: false)
  MYSQL_ROW_LIMIT     Max rows per query (default: 1000)
  AGENT_MAX_TURNS     Max agent turns per request (default: 10)
`);
    return;
  }

  const outputJson = values.json;

  function output(result: AgentResult): void {
    if (outputJson) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.success) {
      if (typeof result.data === "string") {
        console.log(result.data);
      } else {
        console.log(JSON.stringify(result.data, null, 2));
      }
      if (result.duration_ms) {
        console.log(`\n⏱️  ${result.duration_ms}ms`);
      }
    } else {
      console.error(`❌ Error: ${result.error}`);
      process.exit(1);
    }
  }

  try {
    // Interactive mode
    if (values.interactive) {
      if (!getConfig().openaiApiKey) {
        console.error("❌ OPENAI_API_KEY required for interactive mode");
        process.exit(1);
      }

      console.log(`
╔════════════════════════════════════════════════════════════╗
║              MySQL Agent (Interactive Mode)                 ║
╠════════════════════════════════════════════════════════════╣
║  Type your question and press Enter                        ║
║  Type 'exit' to quit                                       ║
╚════════════════════════════════════════════════════════════╝
`);
      const prompt = "mysql> ";
      process.stdout.write(prompt);

      for await (const line of console) {
        const input = line.trim();

        if (!input) {
          process.stdout.write(prompt);
          continue;
        }

        if (input === "exit" || input === "quit") {
          console.log("\nGoodbye! 👋\n");
          break;
        }

        const result = await runMySQLAgent(input);
        output(result);
        console.log();
        process.stdout.write(prompt);
      }
      return;
    }

    // Chat mode
    if (values.chat || positionals.length > 0) {
      if (!getConfig().openaiApiKey) {
        console.error("❌ OPENAI_API_KEY required for chat mode");
        process.exit(1);
      }

      const message = values.chat || positionals.join(" ");
      const result = await runMySQLAgent(message);
      output(result);
      return;
    }

    // Task mode
    if (values.task) {
      let result: AgentResult;

      switch (values.task) {
        case "test-connection":
          result = await executeMySQLTask({ task: MySQLAgentTasks.TEST_CONNECTION });
          break;

        case "list-tables":
          result = await executeMySQLTask({
            task: MySQLAgentTasks.LIST_TABLES,
            params: { includeRowCounts: values["include-counts"] },
          });
          break;

        case "get-schema":
          if (!values.table) {
            console.error("❌ Error: --table required for get-schema task");
            process.exit(1);
          }
          result = await executeMySQLTask({
            task: MySQLAgentTasks.GET_SCHEMA,
            params: { tableName: values.table },
          });
          break;

        case "get-all-schemas":
          result = await executeMySQLTask({ task: MySQLAgentTasks.GET_ALL_SCHEMAS });
          break;

        case "query":
          if (!values.sql) {
            console.error("❌ Error: --sql required for query task");
            process.exit(1);
          }
          result = await executeMySQLTask({
            task: MySQLAgentTasks.QUERY,
            params: { sql: values.sql, allowWrite: values["allow-write"] },
          });
          break;

        default:
          console.error(`❌ Unknown task: ${values.task}`);
          console.error("Valid tasks: test-connection, list-tables, get-schema, get-all-schemas, query");
          process.exit(1);
      }

      output(result);
      return;
    }

    // No arguments - show help
    console.log("Use --help for usage information");

  } finally {
    await closeConnection();
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

const isMainModule = import.meta.main;

if (isMainModule) {
  runCLI().catch(async (error) => {
    console.error("❌ Fatal error:", error);
    await closeConnection();
    process.exit(1);
  });
}
