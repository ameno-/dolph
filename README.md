# Dolph 🐬

> Your friendly MySQL database agent powered by AI

Dolph is a single-file MySQL database agent using OpenAI Agents SDK and Bun.js. Talk to your database like you talk to a friend.

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Setup test database (requires Docker)
bun setup-db.ts

# 3. Test Dolph
bun test-agent.ts

# 4. Let Dolph do the work
bun dolph.ts --task list-tables
```

## Features

- **Single-file design** - All agent code in one file (`dolph.ts`)
- **Dual-mode** - CLI for terminal, exports for server integration
- **Native MySQL** - Uses Bun's built-in SQL driver (9x faster than mysql2)
- **Type-safe** - Full TypeScript with Zod validation
- **Secure** - Read-only by default, dual-gate write protection

## CLI Usage

### Task Mode (No OpenAI key needed)

```bash
# Test database connection
bun dolph.ts --task test-connection

# List all tables
bun dolph.ts --task list-tables

# List tables with exact row counts
bun dolph.ts --task list-tables --include-counts

# Get schema for a specific table
bun dolph.ts --task get-schema --table users

# Get all schemas
bun dolph.ts --task get-all-schemas

# Run SQL query
bun dolph.ts --task query --sql "SELECT * FROM users WHERE status = 'active'"

# Run with JSON output
bun dolph.ts --task list-tables --json
```

### Chat Mode (Requires OpenAI key)

```bash
# Single question
bun dolph.ts --chat "What tables are in this database?"

# Interactive mode - just chat with Dolph
bun dolph.ts --interactive
```

## Module Integration

Dolph is designed as a **single-file module** you can import directly into any Bun application.

### Quick Start

```typescript
import { runMySQLAgent, configureAgent, closeConnection } from "./dolph.ts";

// Configure once at app startup
await configureAgent({
  mysqlUrl: process.env.MYSQL_URL,
  openaiApiKey: process.env.OPENAI_API_KEY,
});

// Query with natural language
const result = await runMySQLAgent("Show me all active users");
console.log(result.data);

// Cleanup on shutdown
await closeConnection();
```

### Available Exports

| Export | Purpose |
|--------|---------|
| `configureAgent(config)` | Set MySQL/OpenAI credentials at startup |
| `executeMySQLTask(task)` | Run predefined tasks (no OpenAI needed) |
| `runMySQLAgent(prompt)` | Natural language queries (requires OpenAI) |
| `executeQuery(sql)` | Direct SQL execution |
| `closeConnection()` | Cleanup database connection |
| `MySQLAgentTasks` | Enum of available task types |

### Task-Based Usage (No OpenAI Key)

```typescript
import { executeMySQLTask, MySQLAgentTasks } from "./dolph.ts";

// List all tables
const tables = await executeMySQLTask({
  task: MySQLAgentTasks.LIST_TABLES,
  params: { includeRowCounts: true },
});

// Get table schema
const schema = await executeMySQLTask({
  task: MySQLAgentTasks.GET_SCHEMA,
  params: { tableName: "users" },
});

// Run SQL query
const data = await executeMySQLTask({
  task: MySQLAgentTasks.QUERY,
  params: { sql: "SELECT * FROM users WHERE status = 'active'" },
});
```

### Natural Language Usage (Requires OpenAI)

```typescript
import { runMySQLAgent } from "./dolph.ts";

const result = await runMySQLAgent("What tables contain user data?");

if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

### Direct SQL

```typescript
import { executeQuery } from "./dolph.ts";

const result = await executeQuery("SELECT COUNT(*) FROM orders", {
  allowWrite: false,
});
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MYSQL_URL` | Yes* | - | MySQL connection URL |
| `MYSQL_HOST` | No | localhost | MySQL host |
| `MYSQL_PORT` | No | 3306 | MySQL port |
| `MYSQL_USER` | No | root | MySQL username |
| `MYSQL_PASS` | No | - | MySQL password |
| `MYSQL_DB` | No | mysql | MySQL database |
| `MYSQL_ALLOW_WRITE` | No | false | Enable write operations |
| `MYSQL_ROW_LIMIT` | No | 1000 | Max rows per query |
| `OPENAI_API_KEY` | Chat only | - | OpenAI API key |
| `AGENT_MODEL` | No | gpt-4o-mini | OpenAI model |

*Either `MYSQL_URL` or individual `MYSQL_*` variables required.

## Database Setup

The `setup-db.ts` script handles Docker MySQL container setup:

```bash
# Create container + seed data
bun setup-db.ts

# Check status
bun setup-db.ts --status

# Re-seed existing container
bun setup-db.ts --seed

# Remove container
bun setup-db.ts --teardown
```

## Test Data

The setup script creates these tables:

- **users** - 10 sample users with various statuses
- **products** - 13 products across categories
- **orders** - 8 orders with different statuses
- **order_items** - Order line items with product references

## Security

1. **Read-only by default** - Write operations blocked unless explicitly enabled
2. **Dual-gate writes** - Requires both `--allow-write` flag AND `MYSQL_ALLOW_WRITE=true`
3. **Auto row limits** - SELECT queries limited to prevent memory issues
4. **No credential logging** - Connection strings never appear in output

## Project Structure

```
dolph/
├── dolph.ts         # Main agent (single file)
├── setup-db.ts      # Docker/seed script
├── test-agent.ts    # Test suite
├── package.json     # Dependencies
├── .env.sample      # Environment template
└── README.md        # This file
```

## Why "Dolph"?

MySQL's logo is a dolphin. Dolph is your friendly dolphin that dives into your database and brings back exactly what you need. 🐬

## License

MIT
