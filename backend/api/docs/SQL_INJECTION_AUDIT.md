# SQL Injection Audit Report — `backend/api/src/`

**Audit date:** 2026-03-08
**Auditor:** Automated security scan (WS23)
**Scope:** `backend/api/src/index.ts` and all files under `backend/api/src/`
**Verdict:** No SQL injection vulnerabilities found. No code changes required.

---

## 1. Files scanned

| File | SQL queries inspected |
| --- | --- |
| `src/index.ts` | 47,000+ lines — primary API surface, all `db.query` / `readDb.query` / `client.query` calls reviewed |
| `src/routes/collections.ts` | Dynamic `UPDATE ... SET ${updates.join}` pattern |
| `src/routes/*.ts` (all route files) | Searched for template-literal interpolation in SQL — none found |
| `src/lib/*.ts` (all lib files) | Searched for template-literal interpolation in SQL — none found |
| `src/botRuntime/*.ts` | No SQL queries with interpolation |
| `src/db/migrate.ts` | Static DDL only |
| `src/db/pool.ts` | Pool config only |
| `src/integration/*.ts` | Test fixtures only |

Search patterns used:
- `\.query\(`` ` — every template-literal query call
- `(SELECT|INSERT|UPDATE|DELETE|WHERE|ORDER BY|GROUP BY|FROM|SET)\s+\$\{` — SQL keywords followed by interpolation
- `\.query\(['"].*\+` — string concatenation in query calls
- `query\(``[^`]*\$\{(request|req|body|params|query|headers)` — direct request input in SQL strings
- `(WHERE|ORDER BY|GROUP BY|FROM)\s+\$\{` — dynamic table/column/sort interpolation

---

## 2. Potential issues examined

### 2.1 `ORDER BY ${orderBy}` — dynamic sort clause (3 occurrences)

| Location | Variable | Source | User-controlled? | Verdict |
| --- | --- | --- | --- | --- |
| `src/index.ts:18232` | `orderBy` | Derived from `params.sort` validated by `z.enum(['newest','price_asc','price_desc'])` at line 18142 | No — enum-validated, mapped to constant strings | **Safe** (allowlist via Zod enum) |
| `src/index.ts:18921` | `orderBy` | Derived from `payload.sort` validated by `z.enum(['newest','price_asc','price_desc'])` at line 18890 | No — enum-validated, mapped to constant strings | **Safe** (allowlist via Zod enum) |
| `src/index.ts:38743` | `orderBy` | Derived from `sort` validated by `z.enum(['newest','mostBids','priceLow','priceHigh','endingSoon'])` at line 38617 switch | No — enum-validated, mapped to constant strings | **Safe** (allowlist via Zod enum) |

**Assessment:** All three `ORDER BY ${orderBy}` interpolations are driven by Zod-validated enum inputs that are mapped to hard-coded SQL fragment constants. No user-controlled string ever reaches the `ORDER BY` clause. This is the correct allowlist pattern for dynamic sorting (column names cannot be parameterized with `pg`).

### 2.2 `WHERE ${conditions.join(' AND ')}` — dynamic WHERE builder (11 occurrences)

| Location | Array source | Verdict |
| --- | --- | --- |
| `src/index.ts:15784` | `conditions[]` — each entry is `$N` placeholder or constant string; values pushed to `args[]` | **Safe** |
| `src/index.ts:16026` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:16074` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:18231` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:18920` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:19059` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:19583` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:21747` | `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:37597` | `whereClause` built from `conditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:38673/38742` | `whereConditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:45636/45694/45782` | `whereConditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:46447/46952` | `conditions[]` — placeholder pattern | **Safe** |

**Assessment:** Every dynamic WHERE builder follows the secure pattern: condition strings contain only `$N` placeholders and constant SQL fragments; user input is always passed via the parameter array. No user-controlled string is ever concatenated into the condition text.

### 2.3 `SET ${setClauses.join(', ')} / ${updates.join(', ')}` — dynamic UPDATE builder (12 occurrences)

| Location | Clause source | Verdict |
| --- | --- | --- |
| `src/index.ts:14100` | `setClauses` from `Object.keys(allowed)` — keys are hard-coded column names assigned from validated body fields | **Safe** |
| `src/index.ts:14158` | Same pattern | **Safe** |
| `src/index.ts:14214` | Same pattern | **Safe** |
| `src/index.ts:14504` | Same pattern | **Safe** |
| `src/index.ts:14587` | Same pattern | **Safe** |
| `src/index.ts:14677` | Same pattern | **Safe** |
| `src/index.ts:14871` | Same pattern (INSERT + ON CONFLICT) | **Safe** |
| `src/index.ts:19677` | `updates[]` — entries are `column = $N`; values in `values[]` | **Safe** |
| `src/index.ts:21564` | `sets[]` — entries are `column = $N`; values in `values[]` | **Safe** |
| `src/index.ts:24642` | `updates[]` — entries are `column = $N`; values in `values[]` | **Safe** |
| `src/index.ts:29981` | `setClauses` from `Object.keys(allowed)` | **Safe** |
| `src/index.ts:47223` | `updates[]` — entries are `column = $N`; values in `values[]` | **Safe** |
| `src/routes/collections.ts:307` | `updates[]` — entries are `column = $N`; values in `values[]` | **Safe** |

**Assessment:** All dynamic UPDATE builders use one of two secure patterns:
1. **Hard-coded column map:** User input is assigned to a pre-defined `allowed` / `columns` record with literal column-name keys. `Object.keys()` therefore yields only constant strings. Values are passed via the parameter array.
2. **Placeholder push:** Each `updates.push()` call uses a literal column name and a `$N` placeholder; the corresponding value is pushed to a separate `values[]` array.

No user-controlled column name or value is ever interpolated directly into the SQL string.

### 2.4 `${interval}` — dynamic INTERVAL clause (3 occurrences)

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:15868-15869` | `interval` | `intervalMap[period]` where `period` is `z.enum(['7d','30d','90d'])` | **Safe** (enum-validated allowlist → constant `INTERVAL 'N days'` strings) |
| `src/index.ts:18676` | `interval` | Same `intervalMap` pattern | **Safe** |

**Assessment:** The `interval` value is selected from a hard-coded map keyed by a Zod-validated enum. Only constant `INTERVAL 'N days'` literals can ever be interpolated.

### 2.5 `${categoryClause}` — dynamic category filter

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:18681` | `categoryClause` | Either `''` or `` `AND l.category = $${params.length}` `` with value pushed to `params` | **Safe** |

### 2.6 `${lockClause}` — FOR UPDATE toggle (3 occurrences)

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:11873/12000/12016` | `lockClause` | `forUpdate ? 'FOR UPDATE' : ''` — boolean function parameter | **Safe** (constant string) |

### 2.7 `${viewerSelect}` — dynamic SELECT column list

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:38291/38738` | `viewerSelect` | Ternary on `viewerUserId` — both branches are constant SQL strings with `$N` placeholders | **Safe** |

### 2.8 `${cursorCondition}` — dynamic cursor pagination (6 occurrences)

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:18761/18781` | `cursorCondition` | Built from validated cursor; uses `$N` placeholders; values pushed to params | **Safe** |
| `src/index.ts:38653-38661` | `cursorCondition` | Same pattern | **Safe** |
| `src/index.ts:40280` | `cursorCondition` | Same pattern | **Safe** |
| `src/index.ts:40500` | `cursorCondition` | Same pattern | **Safe** |

### 2.9 `${placeholders}` / `${catPlaceholders}` — IN clause builders

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:21218` | `placeholders` | `complementaryCats.map((_, i) => `$${i+2}`).join(', ')` — only `$N` tokens | **Safe** |
| `src/index.ts:21296` | `catPlaceholders` | Same pattern | **Safe** |
| `src/index.ts:37499/37518` | `placeholders` | Same pattern | **Safe** |

### 2.10 `${LOOK_SELECT_COLUMNS}` — constant column list

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:19580/19619` | `LOOK_SELECT_COLUMNS` | Module-level `const` string literal (line 19416) | **Safe** (constant) |

### 2.11 `${whereClause}` — pre-built WHERE string

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:20991` | `whereClause` | Passed into `fetchCandidates()` — all call sites pass constant strings or `$N`-placeholder strings | **Safe** |
| `src/index.ts:40648/40690` | `whereClause` | Built from `whereConditions[]` — placeholder pattern | **Safe** |
| `src/index.ts:45694/45713` | `whereClause` | Same pattern | **Safe** |

### 2.12 `${limitPlaceholder}` — dynamic LIMIT placeholder

| Location | Variable | Source | Verdict |
| --- | --- | --- | --- |
| `src/index.ts:40692/45638/45715/45784` | `limitPlaceholder` | `` `$${whereParams.length}` `` — computed placeholder index; value pushed to params | **Safe** |

---

## 3. String concatenation in queries

Searched for `\.query\(['"].*\+` across all `.ts` files in `src/`. **Zero matches.** No query uses string concatenation with `+` to build SQL.

---

## 4. Direct request input in SQL strings

Searched for `query\(``[^`]*\$\{(request|req|body|params|query|headers)` across all `.ts` files in `src/`. **Zero matches.** No `request.body`, `request.params`, `request.query`, or `request.headers` value is ever interpolated directly into a SQL template literal.

---

## 5. Fixes applied

**None.** No real SQL injection vulnerabilities were found. All dynamic SQL construction follows secure patterns:
- User input is always passed through `pg` parameterized query arrays (`$1`, `$2`, …).
- Dynamic column names, sort clauses, and interval literals are derived from Zod-validated enums mapped to hard-coded constant strings (the allowlist pattern).
- No string concatenation (`+`) is used in any query call.

---

## 6. Recommendations for preventing future SQL injection

### 6.1 ESLint `no-restricted-syntax` rule

Add the following rule to `backend/api/.eslintrc` (or equivalent config) to statically ban unsafe template-literal queries:

```json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='query'] TemplateLiteral",
        "message": "db.query() must use parameterized placeholders ($1, $2) for all user input. Do not interpolate user-controlled values into SQL template literals."
      }
    ]
  }
}
```

> **Note:** This rule flags *all* `db.query(`...`)` calls, including safe ones that interpolate only constant fragments. Teams should review each flagged instance and add an `// eslint-disable-next-line no-restricted-syntax` comment with a justification for safe dynamic-SQL patterns (e.g. allowlisted `ORDER BY`). A stricter custom rule that only flags `${...}` interpolations containing request-derived identifiers would be ideal but requires a custom ESLint plugin.

### 6.2 Code review checklist

1. **Every `${...}` in a SQL template literal must be traced to its origin.**
2. If the interpolated value is user-controlled → **MUST** use `$N` parameterization.
3. If the interpolated value is a column/table name → **MUST** be validated against an allowlist (Zod enum or constant map).
4. If the interpolated value is a constant SQL fragment (`FOR UPDATE`, `INTERVAL '7 days'`) → safe, but add a comment explaining why.
5. **Never** use string concatenation (`+`) to build SQL queries.

### 6.3 Defense-in-depth suggestions

- Consider adopting a query builder (e.g. `knex`, `kysely`) that enforces parameterization at the API level and makes dynamic column/table names explicit.
- Add a unit test that asserts no `request.body` / `request.params` / `request.query` value appears in any `db.query()` first argument (can be done via static analysis or AST traversal in CI).

---

## 7. Verification

- `npx tsc --noEmit` in `backend/api` — passes with 0 errors.
- `npm run test:integration` in `backend/api` — all 17 tests pass.

---

## 8. Summary

The `backend/api/src/` codebase is **not vulnerable** to SQL injection. All 47,000+ lines of `src/index.ts` and all route/lib files were scanned for:
- Template-literal interpolation in SQL (`${...}` in `db.query(`...`)`)
- String concatenation in query calls (`+`)
- Direct request input in SQL strings
- Dynamic `ORDER BY`, `GROUP BY`, `FROM`, `SET`, `WHERE` clauses

Every dynamic SQL pattern found uses the secure parameterized-placeholder pattern (`$1`, `$2`, …) for user input and hard-coded constant strings (selected via Zod-validated enums) for structural elements like column names and sort directions. No fixes were necessary.
