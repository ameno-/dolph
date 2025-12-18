#!/usr/bin/env bun
/**
 * MySQL Test Database Setup Script
 *
 * Creates a Docker MySQL container and seeds it with test data.
 * Completely self-contained - no external dependencies needed.
 *
 * Usage:
 *   bun setup-db.ts          # Create container + seed data
 *   bun setup-db.ts --teardown   # Remove container
 *   bun setup-db.ts --seed       # Re-seed existing container
 *   bun setup-db.ts --status     # Check container status
 */

import { $ } from "bun";
import { parseArgs } from "util";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  containerName: "mysql-agent-test",
  mysqlVersion: "8.0",
  rootPassword: "testpass123",
  database: "testdb",
  port: 3306,
  // Connection URL for .env
  get connectionUrl() {
    return `mysql://root:${this.rootPassword}@localhost:${this.port}/${this.database}`;
  },
};

// ============================================================================
// SEED DATA
// ============================================================================

const SEED_SQL = `
-- Create tables
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock INT DEFAULT 0,
  category VARCHAR(100),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clear existing data
DELETE FROM order_items;
DELETE FROM orders;
DELETE FROM products;
DELETE FROM users;

-- Reset auto-increment
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE products AUTO_INCREMENT = 1;
ALTER TABLE orders AUTO_INCREMENT = 1;
ALTER TABLE order_items AUTO_INCREMENT = 1;

-- Insert users
INSERT INTO users (email, name, status) VALUES
  ('alice@example.com', 'Alice Johnson', 'active'),
  ('bob@example.com', 'Bob Smith', 'active'),
  ('carol@example.com', 'Carol Williams', 'active'),
  ('dave@example.com', 'Dave Brown', 'inactive'),
  ('eve@example.com', 'Eve Davis', 'pending'),
  ('frank@example.com', 'Frank Miller', 'active'),
  ('grace@example.com', 'Grace Wilson', 'active'),
  ('henry@example.com', 'Henry Moore', 'inactive'),
  ('ivy@example.com', 'Ivy Taylor', 'pending'),
  ('jack@example.com', 'Jack Anderson', 'active');

-- Insert products
INSERT INTO products (name, description, price, stock, category, active) VALUES
  ('Laptop Pro', 'High-performance laptop for professionals', 1299.99, 50, 'Electronics', TRUE),
  ('Wireless Mouse', 'Ergonomic wireless mouse', 29.99, 200, 'Electronics', TRUE),
  ('USB-C Hub', '7-in-1 USB-C hub with HDMI', 49.99, 150, 'Electronics', TRUE),
  ('Mechanical Keyboard', 'RGB mechanical keyboard', 89.99, 75, 'Electronics', TRUE),
  ('Monitor 27"', '4K IPS monitor', 399.99, 30, 'Electronics', TRUE),
  ('Desk Lamp', 'LED desk lamp with adjustable brightness', 34.99, 100, 'Home Office', TRUE),
  ('Office Chair', 'Ergonomic office chair', 249.99, 25, 'Furniture', TRUE),
  ('Standing Desk', 'Electric standing desk', 599.99, 15, 'Furniture', TRUE),
  ('Webcam HD', '1080p webcam with microphone', 79.99, 80, 'Electronics', TRUE),
  ('Headphones', 'Noise-canceling wireless headphones', 199.99, 60, 'Electronics', TRUE),
  ('Notebook Set', 'Premium notebook 3-pack', 19.99, 300, 'Office Supplies', TRUE),
  ('Pen Pack', 'Gel pen 12-pack', 9.99, 500, 'Office Supplies', TRUE),
  ('Discontinued Item', 'This product is no longer available', 999.99, 0, 'Electronics', FALSE);

-- Insert orders
INSERT INTO orders (user_id, total, status) VALUES
  (1, 1379.97, 'delivered'),
  (1, 89.99, 'shipped'),
  (2, 449.98, 'processing'),
  (3, 29.99, 'delivered'),
  (3, 849.98, 'delivered'),
  (6, 199.99, 'pending'),
  (7, 1299.99, 'processing'),
  (10, 129.98, 'shipped');

-- Insert order items
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1, 1, 1, 1299.99),
  (1, 2, 1, 29.99),
  (1, 3, 1, 49.99),
  (2, 4, 1, 89.99),
  (3, 5, 1, 399.99),
  (3, 3, 1, 49.99),
  (4, 2, 1, 29.99),
  (5, 1, 1, 1299.99),
  (5, 6, 1, 34.99),
  (6, 10, 1, 199.99),
  (7, 1, 1, 1299.99),
  (8, 4, 1, 89.99),
  (8, 6, 1, 34.99);
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function isDockerRunning(): Promise<boolean> {
  try {
    await $`docker info`.quiet();
    return true;
  } catch {
    return false;
  }
}

async function containerExists(): Promise<boolean> {
  try {
    const result = await $`docker ps -a --format "{{.Names}}" | grep -x ${CONFIG.containerName}`.quiet();
    return result.stdout.toString().trim() === CONFIG.containerName;
  } catch {
    return false;
  }
}

async function containerRunning(): Promise<boolean> {
  try {
    const result = await $`docker ps --format "{{.Names}}" | grep -x ${CONFIG.containerName}`.quiet();
    return result.stdout.toString().trim() === CONFIG.containerName;
  } catch {
    return false;
  }
}

async function waitForMySQL(maxAttempts = 30): Promise<boolean> {
  console.log("⏳ Waiting for MySQL to be ready...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await $`docker exec ${CONFIG.containerName} mysqladmin ping -h localhost -u root -p${CONFIG.rootPassword} --silent`.quiet();
      return true;
    } catch {
      await Bun.sleep(1000);
      process.stdout.write(".");
    }
  }
  console.log();
  return false;
}

async function createEnvFile(): Promise<void> {
  const envPath = `${import.meta.dir}/.env`;
  const envContent = `# Auto-generated by setup-db.ts
MYSQL_URL=${CONFIG.connectionUrl}
MYSQL_ALLOW_WRITE=true
MYSQL_ROW_LIMIT=1000
AGENT_MODEL=gpt-4o-mini

# Add your OpenAI API key here for chat mode
OPENAI_API_KEY=
`;

  await Bun.write(envPath, envContent);
  console.log(`✅ Created .env file`);
}

// ============================================================================
// MAIN COMMANDS
// ============================================================================

async function setup(): Promise<void> {
  console.log("\n🚀 MySQL Agent Test Database Setup\n");

  // Check Docker
  if (!(await isDockerRunning())) {
    console.error("❌ Docker is not running. Please start Docker Desktop and try again.");
    process.exit(1);
  }
  console.log("✅ Docker is running");

  // Check if container exists
  if (await containerExists()) {
    if (await containerRunning()) {
      console.log(`✅ Container '${CONFIG.containerName}' is already running`);
    } else {
      console.log(`🔄 Starting existing container '${CONFIG.containerName}'...`);
      await $`docker start ${CONFIG.containerName}`;
    }
  } else {
    // Create new container
    console.log(`📦 Creating MySQL container '${CONFIG.containerName}'...`);
    await $`docker run -d \
      --name ${CONFIG.containerName} \
      -e MYSQL_ROOT_PASSWORD=${CONFIG.rootPassword} \
      -e MYSQL_DATABASE=${CONFIG.database} \
      -p ${CONFIG.port}:3306 \
      mysql:${CONFIG.mysqlVersion}`;
  }

  // Wait for MySQL to be ready
  if (!(await waitForMySQL())) {
    console.error("\n❌ MySQL failed to start within timeout");
    process.exit(1);
  }
  console.log("\n✅ MySQL is ready");

  // Seed database
  await seedDatabase();

  // Create .env file
  await createEnvFile();

  console.log("\n" + "=".repeat(50));
  console.log("✅ Setup complete!\n");
  console.log("Connection URL:");
  console.log(`  ${CONFIG.connectionUrl}\n`);
  console.log("Next steps:");
  console.log("  1. Add your OPENAI_API_KEY to .env (for chat mode)");
  console.log("  2. Run: bun mysql-agent.ts --task test-connection");
  console.log("  3. Run: bun mysql-agent.ts --task list-tables");
  console.log("=".repeat(50) + "\n");
}

async function seedDatabase(): Promise<void> {
  console.log("🌱 Seeding database...");

  // Write SQL to temp file and execute
  const tempFile = `/tmp/seed-${Date.now()}.sql`;
  await Bun.write(tempFile, SEED_SQL);

  try {
    await $`docker exec -i ${CONFIG.containerName} mysql -u root -p${CONFIG.rootPassword} ${CONFIG.database} < ${tempFile}`;
    console.log("✅ Database seeded with test data");
  } finally {
    await $`rm -f ${tempFile}`.quiet();
  }
}

async function teardown(): Promise<void> {
  console.log("\n🗑️  Tearing down MySQL container...\n");

  if (!(await containerExists())) {
    console.log(`ℹ️  Container '${CONFIG.containerName}' does not exist`);
    return;
  }

  // Stop container
  if (await containerRunning()) {
    console.log("⏹️  Stopping container...");
    await $`docker stop ${CONFIG.containerName}`;
  }

  // Remove container
  console.log("🗑️  Removing container...");
  await $`docker rm ${CONFIG.containerName}`;

  console.log(`\n✅ Container '${CONFIG.containerName}' removed\n`);
}

async function status(): Promise<void> {
  console.log("\n📊 MySQL Container Status\n");

  if (!(await isDockerRunning())) {
    console.log("❌ Docker is not running");
    return;
  }

  if (!(await containerExists())) {
    console.log(`❌ Container '${CONFIG.containerName}' does not exist`);
    console.log("   Run: bun setup-db.ts");
    return;
  }

  if (await containerRunning()) {
    console.log(`✅ Container '${CONFIG.containerName}' is running`);
    console.log(`   Port: ${CONFIG.port}`);
    console.log(`   URL: ${CONFIG.connectionUrl}`);

    // Test connection
    try {
      await $`docker exec ${CONFIG.containerName} mysqladmin ping -h localhost -u root -p${CONFIG.rootPassword} --silent`.quiet();
      console.log("   MySQL: Ready");
    } catch {
      console.log("   MySQL: Not ready");
    }
  } else {
    console.log(`⏸️  Container '${CONFIG.containerName}' exists but is stopped`);
    console.log("   Run: bun setup-db.ts (to start)");
  }
  console.log();
}

// ============================================================================
// CLI
// ============================================================================

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    teardown: { type: "boolean" },
    seed: { type: "boolean" },
    status: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

if (values.help) {
  console.log(`
MySQL Test Database Setup

Usage:
  bun setup-db.ts             Create container and seed data
  bun setup-db.ts --teardown  Remove container
  bun setup-db.ts --seed      Re-seed existing container
  bun setup-db.ts --status    Check container status
  bun setup-db.ts --help      Show this help

Configuration:
  Container: ${CONFIG.containerName}
  MySQL:     ${CONFIG.mysqlVersion}
  Port:      ${CONFIG.port}
  Database:  ${CONFIG.database}
`);
  process.exit(0);
}

if (values.teardown) {
  await teardown();
} else if (values.seed) {
  if (!(await containerRunning())) {
    console.error("❌ Container is not running. Run setup first.");
    process.exit(1);
  }
  await seedDatabase();
} else if (values.status) {
  await status();
} else {
  await setup();
}
