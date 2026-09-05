import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "..", "src", "db", "migrations");

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

const KNOWN_DUPLICATES = new Set([
  "081", "082", "100", "153", "169", "170", "171", "173", "175", "186", "203", "217",
]);

const prefixMap = new Map();

for (const file of files) {
  const match = file.match(/^(\d+)/);
  if (!match) continue;
  const prefix = match[1];
  if (!prefixMap.has(prefix)) {
    prefixMap.set(prefix, []);
  }
  prefixMap.get(prefix).push(file);
}

let hasDuplicates = false;

for (const [prefix, fileList] of prefixMap) {
  if (fileList.length > 1 && !KNOWN_DUPLICATES.has(prefix)) {
    hasDuplicates = true;
    console.error(
      `Duplicate migration prefix ${prefix} found: ${fileList.join(", ")}. Use a unique sequential number for new migrations.`
    );
  } else if (fileList.length > 1) {
    console.warn(
      `Known duplicate migration prefix ${prefix}: ${fileList.join(", ")}. (pre-existing, not blocking)`
    );
  }
}

if (hasDuplicates) {
  process.exit(1);
}
