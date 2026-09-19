import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "src", "db", "migrations");

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

// Rollback files (`NNN_name_down.sql`) pair with their forward migration —
// they are not independent migrations and must not count as duplicate
// prefixes (F03).
const forwardFiles = files.filter((f) => !f.endsWith("_down.sql"));
const rollbackFiles = files.filter((f) => f.endsWith("_down.sql"));

const KNOWN_DUPLICATES = new Set([
  "081", "082", "100", "153", "169", "170", "171", "173", "175", "186", "203", "217",
]);

const prefixMap = new Map();

for (const file of forwardFiles) {
  const match = file.match(/^(\d+)/);
  if (!match) continue;
  const prefix = match[1];
  if (!prefixMap.has(prefix)) {
    prefixMap.set(prefix, []);
  }
  prefixMap.get(prefix).push(file);
}

let hasFailures = false;

for (const [prefix, fileList] of prefixMap) {
  if (fileList.length > 1 && !KNOWN_DUPLICATES.has(prefix)) {
    hasFailures = true;
    console.error(
      `Duplicate migration prefix ${prefix} found: ${fileList.join(", ")}. Use a unique sequential number for new migrations.`
    );
  } else if (fileList.length > 1) {
    console.warn(
      `Known duplicate migration prefix ${prefix}: ${fileList.join(", ")}. (pre-existing, not blocking)`
    );
  }
}

// Rollback pairing: every `_down.sql` must correspond to a forward
// migration with the same stem (`206_x_down.sql` ↔ `206_x.sql`).
const forwardStems = new Set(forwardFiles.map((f) => f.replace(/\.sql$/, "")));
for (const file of rollbackFiles) {
  const stem = file.replace(/_down\.sql$/, "");
  if (!forwardStems.has(stem)) {
    hasFailures = true;
    console.error(
      `Orphaned rollback migration ${file}: no forward migration ${stem}.sql exists.`
    );
  }
}

if (hasFailures) {
  process.exit(1);
}
