#!/usr/bin/env bun
/**
 * Test script for MySQL Agent
 *
 * Tests all task-based operations (no OpenAI API key required)
 *
 * Usage:
 *   bun test-agent.ts
 */

import {
  executeMySQLTask,
  MySQLAgentTasks,
  closeConnection,
  type TableInfo,
  type TableSchema,
  type QueryResult,
  type ConnectionInfo,
} from "./dolph.ts";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";

function log(msg: string): void {
  console.log(msg);
}

function success(msg: string): void {
  console.log(`${GREEN}✅ ${msg}${RESET}`);
}

function fail(msg: string): void {
  console.log(`${RED}❌ ${msg}${RESET}`);
}

function info(msg: string): void {
  console.log(`${BLUE}ℹ️  ${msg}${RESET}`);
}

function section(msg: string): void {
  console.log(`\n${YELLOW}━━━ ${msg} ━━━${RESET}\n`);
}

async function runTests(): Promise<void> {
  log("\n🧪 MySQL Agent Test Suite\n");
  log("=".repeat(50));

  let passed = 0;
  let failed = 0;

  // Test 1: Connection
  section("Test 1: Connection");
  const connResult = await executeMySQLTask<ConnectionInfo>({
    task: MySQLAgentTasks.TEST_CONNECTION,
  });

  if (connResult.success && connResult.data) {
    success(`Connected to MySQL ${connResult.data.version}`);
    info(`Database: ${connResult.data.database}`);
    info(`User: ${connResult.data.user}`);
    info(`Duration: ${connResult.duration_ms}ms`);

    // Safety guard: this test suite can be expensive/dangerous against real DBs
    // (e.g., table listing with counts). The bundled setup script uses `testdb`.
    if (connResult.data.database !== "testdb") {
      fail(`Refusing to run tests against non-test database: '${connResult.data.database}'`);
      log("\nSet MYSQL_DB=testdb or run: bun setup-db.ts (which generates a .env for testdb).\n");
      return;
    }

    passed++;
  } else {
    fail(`Connection failed: ${connResult.error}`);
    failed++;
    log("\n⚠️  Cannot continue without database connection");
    log("   Run: bun setup-db.ts\n");
    return;
  }

  // Test 2: List Tables
  section("Test 2: List Tables");
  const tablesResult = await executeMySQLTask<TableInfo[]>({
    task: MySQLAgentTasks.LIST_TABLES,
  });

  if (tablesResult.success && tablesResult.data) {
    success(`Found ${tablesResult.data.length} tables`);
    tablesResult.data.forEach((t) => {
      info(`  - ${t.table_name} (${t.table_type}, ~${t.estimated_rows} rows)`);
    });
    info(`Duration: ${tablesResult.duration_ms}ms`);
    passed++;
  } else {
    fail(`List tables failed: ${tablesResult.error}`);
    failed++;
  }

  // Test 3: List Tables with Row Counts
  section("Test 3: List Tables with Exact Row Counts");
  const tablesCountResult = await executeMySQLTask<TableInfo[]>({
    task: MySQLAgentTasks.LIST_TABLES,
    params: { includeRowCounts: true },
  });

  if (tablesCountResult.success && tablesCountResult.data) {
    success(`Retrieved exact counts for ${tablesCountResult.data.length} tables`);
    tablesCountResult.data.forEach((t) => {
      if (t.exact_row_count !== undefined) {
        info(`  - ${t.table_name}: ${t.exact_row_count} rows`);
      }
    });
    info(`Duration: ${tablesCountResult.duration_ms}ms`);
    passed++;
  } else {
    fail(`List tables with counts failed: ${tablesCountResult.error}`);
    failed++;
  }

  // Test 4: Get Schema
  section("Test 4: Get Schema (users table)");
  const schemaResult = await executeMySQLTask<TableSchema>({
    task: MySQLAgentTasks.GET_SCHEMA,
    params: { tableName: "users" },
  });

  if (schemaResult.success && schemaResult.data) {
    success(`Schema for '${schemaResult.data.table}'`);
    info(`Columns: ${schemaResult.data.columns.length}`);
    schemaResult.data.columns.forEach((c) => {
      info(`  - ${c.name} (${c.full_type}) ${c.key_type ? `[${c.key_type}]` : ""}`);
    });
    info(`Indexes: ${schemaResult.data.indexes.length}`);
    info(`Foreign Keys: ${schemaResult.data.foreign_keys.length}`);
    info(`Duration: ${schemaResult.duration_ms}ms`);
    passed++;
  } else {
    fail(`Get schema failed: ${schemaResult.error}`);
    failed++;
  }

  // Test 5: Get All Schemas
  section("Test 5: Get All Schemas");
  const allSchemasResult = await executeMySQLTask<TableSchema[]>({
    task: MySQLAgentTasks.GET_ALL_SCHEMAS,
  });

  if (allSchemasResult.success && allSchemasResult.data) {
    success(`Retrieved schemas for ${allSchemasResult.data.length} tables`);
    allSchemasResult.data.forEach((s) => {
      info(`  - ${s.table}: ${s.columns.length} columns, ${s.indexes.length} indexes`);
    });
    info(`Duration: ${allSchemasResult.duration_ms}ms`);
    passed++;
  } else {
    fail(`Get all schemas failed: ${allSchemasResult.error}`);
    failed++;
  }

  // Test 6: Simple Query
  section("Test 6: Simple Query");
  const queryResult = await executeMySQLTask<QueryResult>({
    task: MySQLAgentTasks.QUERY,
    params: { sql: "SELECT id, email, name, status FROM users LIMIT 5" },
  });

  if (queryResult.success && queryResult.data) {
    success(`Query returned ${queryResult.data.row_count} rows`);
    queryResult.data.rows.forEach((r: any) => {
      info(`  - ${r.name} <${r.email}> [${r.status}]`);
    });
    info(`Duration: ${queryResult.data.duration_ms}ms`);
    passed++;
  } else {
    fail(`Query failed: ${queryResult.error}`);
    failed++;
  }

  // Test 7: Complex Query (JOIN)
  section("Test 7: Complex Query (JOIN)");
  const joinQueryResult = await executeMySQLTask<QueryResult>({
    task: MySQLAgentTasks.QUERY,
    params: {
      sql: `
        SELECT
          u.name as user_name,
          COUNT(o.id) as order_count,
          COALESCE(SUM(o.total), 0) as total_spent
        FROM users u
        LEFT JOIN orders o ON u.id = o.user_id
        GROUP BY u.id, u.name
        ORDER BY total_spent DESC
        LIMIT 5
      `,
    },
  });

  if (joinQueryResult.success && joinQueryResult.data) {
    success(`Join query returned ${joinQueryResult.data.row_count} rows`);
    joinQueryResult.data.rows.forEach((r: any) => {
      info(`  - ${r.user_name}: ${r.order_count} orders, $${r.total_spent}`);
    });
    info(`Duration: ${joinQueryResult.data.duration_ms}ms`);
    passed++;
  } else {
    fail(`Join query failed: ${joinQueryResult.error}`);
    failed++;
  }

  // Test 8: Write Protection
  section("Test 8: Write Protection");
  const writeResult = await executeMySQLTask<QueryResult>({
    task: MySQLAgentTasks.QUERY,
    params: { sql: "INSERT INTO users (email, name) VALUES ('test@test.com', 'Test')" },
  });

  if (!writeResult.success && writeResult.error?.includes("allowWrite")) {
    success("Write operation correctly blocked");
    info(`Error: ${writeResult.error}`);
    passed++;
  } else {
    fail("Write protection not working!");
    failed++;
  }

  // Summary
  log("\n" + "=".repeat(50));
  log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    success("All tests passed! 🎉\n");
  } else {
    fail(`${failed} test(s) failed\n`);
    process.exit(1);
  }
}

// Run tests
runTests()
  .catch((error) => {
    fail(`Test suite error: ${error}`);
    process.exit(1);
  })
  .finally(async () => {
    await closeConnection();
  });
