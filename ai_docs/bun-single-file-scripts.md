# Running Scripts with Bun

A TypeScript/JavaScript script is a file intended for standalone execution. Bun executes TypeScript natively without transpilation, making it ideal for single-file scripts with zero configuration.

## Running a Script Without Dependencies

Execute any TypeScript or JavaScript file directly:

```typescript
// example.ts
console.log("Hello world");
```

```bash
$ bun example.ts
Hello world
```

Arguments can be passed to the script:

```typescript
// example.ts
console.log(Bun.argv.slice(2).join(" "));
```

```bash
$ bun example.ts hello world!
hello world!
```

## Running a Script With Dependencies

### Option 1: Adjacent package.json (Recommended)

Create a minimal `package.json` next to your script:

```json
{
  "dependencies": {
    "zod": "^3.23.0",
    "chalk": "^5.3.0"
  }
}
```

Then run:

```bash
$ bun install
$ bun example.ts
```

### Option 2: Install Dependencies On-the-fly

Use `bun add` before running:

```bash
$ bun add zod chalk
$ bun example.ts
```

### Option 3: Global Installation

For CLI tools you use frequently:

```bash
$ bun add -g cowsay
$ cowsay "Hello from Bun!"
```

## Creating a Self-Contained Script Directory

For portable single-file scripts with dependencies:

```
my-script/
├── index.ts        # Your script
├── package.json    # Dependencies
└── bun.lock        # Lock file (auto-generated)
```

```json
// package.json
{
  "name": "my-script",
  "type": "module",
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

```typescript
// index.ts
import { z } from "zod";

const UserSchema = z.object({
  name: z.string(),
  age: z.number()
});

console.log(UserSchema.parse({ name: "Alice", age: 30 }));
```

## Using a Shebang for Executable Scripts

Make scripts directly executable without typing `bun`:

```typescript
#!/usr/bin/env bun

console.log("Hello, world!");
```

```bash
$ chmod +x greet.ts
$ ./greet.ts
Hello, world!
```

## Environment Variables

Bun automatically loads `.env` files:

```env
# .env
DATABASE_URL=mysql://user:pass@localhost:3306/mydb
API_KEY=secret123
```

```typescript
// script.ts
const dbUrl = process.env.DATABASE_URL;
// Or use Bun's API:
const apiKey = Bun.env.API_KEY;
```

Load specific env files:

```bash
$ bun --env-file=.env.production script.ts
```

Disable automatic loading:

```bash
$ bun --no-env-file script.ts
```

## TypeScript Configuration

Bun reads `tsconfig.json` automatically. For single-file scripts, create a minimal config:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"]
  }
}
```

## Creating Standalone Executables

Compile scripts into self-contained binaries:

```bash
# Basic compilation
$ bun build --compile ./cli.ts --outfile mycli

# With optimizations (2-4x faster startup)
$ bun build --compile --bytecode --minify ./cli.ts --outfile mycli

# Run the executable
$ ./mycli
```

The resulting binary includes:
- Your code and all dependencies
- The Bun runtime
- No external dependencies required

## Watch Mode for Development

Auto-reload on file changes:

```bash
$ bun --watch script.ts
```

## Using Bun's Native APIs

Bun provides built-in APIs that require no dependencies:

### File Operations

```typescript
// Read file
const content = await Bun.file("data.json").text();

// Write file
await Bun.write("output.txt", "Hello, Bun!");

// Check if file exists
const exists = await Bun.file("config.json").exists();
```

### HTTP Requests

```typescript
const response = await fetch("https://api.example.com/data");
const data = await response.json();
```

### Running Shell Commands

```typescript
import { $ } from "bun";

// Simple command
const result = await $`ls -la`.text();

// With variables (auto-escaped)
const filename = "my file.txt";
await $`cat ${filename}`;

// Capture output
const { stdout, stderr, exitCode } = await $`git status`.quiet();
```

### SQL Databases (MySQL, PostgreSQL, SQLite)

```typescript
import { SQL } from "bun";

// Connect to MySQL
const db = new SQL("mysql://user:pass@localhost:3306/mydb");

// Query with tagged templates (SQL injection safe)
const users = await db`SELECT * FROM users WHERE active = ${true}`;

// Insert
await db`INSERT INTO users (name, email) VALUES (${name}, ${email})`;

// Transactions
await db.begin(async (tx) => {
  await tx`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`;
  await tx`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${toId}`;
});

// Close connection
db.close();
```

## Performance Tips

1. **Use bytecode compilation** for production CLIs: `--compile --bytecode`
2. **Leverage Bun's native APIs** instead of npm packages when possible
3. **Use `Bun.SQL`** instead of mysql2/pg - it's 9x faster for MySQL
4. **Cache transpiled output** is automatic for files > 50KB

## Comparison with UV (Python)

| Feature | UV (Python) | Bun (TypeScript) |
|---------|-------------|------------------|
| Inline dependencies | `# /// script` block | `package.json` |
| Run command | `uv run script.py` | `bun script.ts` |
| Shebang | `#!/usr/bin/env -S uv run --script` | `#!/usr/bin/env bun` |
| Lock file | `script.py.lock` | `bun.lock` |
| Executable | N/A | `bun build --compile` |
| Native TypeScript | N/A | Yes, zero config |

## Example: Complete CLI Script

```typescript
#!/usr/bin/env bun

// cli.ts - A complete CLI example
import { parseArgs } from "util";

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    verbose: { type: "boolean", short: "v" },
    output: { type: "string", short: "o" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
Usage: cli.ts [options] <input>

Options:
  -h, --help     Show this help
  -v, --verbose  Verbose output
  -o, --output   Output file
  `);
  process.exit(0);
}

const [input] = positionals;
if (!input) {
  console.error("Error: Input file required");
  process.exit(1);
}

if (values.verbose) {
  console.log(`Processing: ${input}`);
}

const content = await Bun.file(input).text();
const result = content.toUpperCase();

if (values.output) {
  await Bun.write(values.output, result);
  console.log(`Written to: ${values.output}`);
} else {
  console.log(result);
}
```
