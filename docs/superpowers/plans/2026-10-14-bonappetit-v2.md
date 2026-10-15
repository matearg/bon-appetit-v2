# BonAppetit V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, invite-only personal cookbook. Recipes (title, photo, ingredients, steps), name search, a built-in Favorites list, and custom lists, built as a new monorepo.

**Architecture:** npm-workspaces monorepo. `apps/api` is a Hono app on Node backed by PostgreSQL through Drizzle. `apps/web` is an Angular 22 app that calls `/api/*` on the same origin through the dev proxy. `packages/shared` holds the Zod schemas and inferred types both apps compile against. Sessions are DB-backed httpOnly cookies. Photos are shrunk in the browser, re-encoded by `sharp` on the server, and stored behind a single storage module.

**Tech Stack:** Node ≥ 24, TypeScript 5.9, Hono 4 + @hono/node-server 2 + @hono/zod-validator, Zod 4, Drizzle ORM + drizzle-kit, `postgres` (postgres.js) driver, PostgreSQL 18 (Docker), @node-rs/argon2, sharp, Vitest, Angular 22, tsx, concurrently.

**Spec:** `docs/superpowers/specs/2026-10-14-bonappetit-v2-design.md` (screens: https://claude.ai/artifact/VCpQj6CvtCHvmYtrCgdKH7)

## Global Constraints

- Repo: `/home/mateo/Proyectos/bon-appetit/BonAppetit-v2`, fresh `git init`, no V1 history. Creating or pushing the GitHub repo `matearg/BonAppetit-v2` requires the owner's explicit OK at that moment.
- No secrets committed. Only `.env.example` files are tracked. `.env`, `apps/api/photos/`, `node_modules`, and `dist` are gitignored.
- No AI, YouTube, or Spoonacular code or dependencies. No UI component library, no CSS framework, no SweetAlert2.
- All user-facing copy is English.
- Every API route except `/api/auth/signup` and `/api/auth/login` requires a session. Every query filters by the session user. Another user's resource returns **404**, never 403.
- Error body: `{ error: { code, message, fields? } }`. Codes and statuses: `validation` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `payload_too_large` 413, `unsupported_media_type` 415.
- Limits: email valid and ≤ 254 chars, stored lowercased; password 8–128; title 1–120 after trim (only required recipe field); ingredients 0–100 lines, each 1–200; steps 0–50, each 1–2000; list name 1–60.
- Cookie `sid`: HttpOnly, SameSite=Lax, Path=/, Secure when `NODE_ENV=production`. 30-day sessions, extended to 30 days on use when < 15 days remain. DB stores only `sha256(token)`.
- Photos: JPEG/PNG/WebP detected by `sharp` from the bytes. Request limit 4 MB. Output WebP, longest side ≤ 1600 px, auto-rotated, all metadata stripped. Key `<userId>/<recipeId>/<random>.webp`.
- Search and list-name uniqueness are case- and accent-insensitive via `f_unaccent(lower(x))`.
- Design tokens, fonts (Bricolage Grotesque display, Figtree body), and motion rules are exactly as in spec §7. Every motion effect sits behind `@supports (animation-timeline: view())` and `prefers-reduced-motion: no-preference`. Touch targets ≥ 44 px.
- Prettier: printWidth 100, singleQuote.

## Review Focus

1. **Two signups with the same email at once.** One gets 201 and the other 409, never 500 (catch Postgres `23505`). Test in Task 4.
2. **Emails differing only in case.** `A@X.com` signup then `a@x.com` login succeeds, and a second signup as `a@x.com` gets 409. Test in Task 4.
3. **Search text containing `%`, `_`, or `\`.** These match literally and don't act as wildcards. Test in Task 5.
4. **Stale or garbage `sid` cookie.** Gets 401 (not 500), and an expired session row is deleted. Test in Task 4.
5. **Photo file already missing on disk.** Deleting the recipe or replacing its photo still succeeds. A new photo is written before the DB points at it, and the old file is removed only after. Test in Task 7.

---

## File Structure

```
BonAppetit-v2/
  package.json                 workspaces + root scripts
  tsconfig.base.json           strict, ES2023, moduleResolution bundler
  docker-compose.yml           postgres:18, host port 5432
  docker/init.sql              CREATE DATABASE bonappetit_test
  .gitignore  .prettierrc  README.md
  docs/superpowers/{specs,plans}/   moved from ../docs
  packages/shared/
    package.json  tsconfig.json
    src/index.ts               re-exports
    src/schemas.ts             all Zod schemas + inferred types + constants
    src/schemas.test.ts
  apps/api/
    package.json  tsconfig.json  vitest.config.ts  drizzle.config.ts  .env.example
    drizzle/                   generated + custom SQL migrations (committed)
    src/env.ts                 reads + validates env
    src/server.ts              node entry (serve createApp)
    src/app.ts                 createApp(deps): Hono
    src/http/errors.ts         HttpError, onError, validation hook
    src/db/schema.ts           Drizzle tables
    src/db/client.ts           createDb(url)
    src/db/migrate.ts          runMigrations(url)
    src/auth/password.ts       hashPassword / verifyPassword
    src/auth/sessions.ts       create/validate/delete sessions + cookie helpers
    src/auth/middleware.ts     requireUser
    src/auth/routes.ts
    src/recipes/routes.ts
    src/lists/routes.ts
    src/photos/storage.ts      createLocalStorage(dir)
    src/photos/process.ts      processPhoto(bytes)
    src/photos/routes.ts
    src/seed.ts
    test/setup.ts              globalSetup: migrate bonappetit_test
    test/helpers.ts            makeTestApp, truncateAll, signupAs
    test/*.test.ts
  apps/web/                    Angular 22 workspace project
    proxy.conf.json
    src/styles.css             tokens + base + motion utilities
    src/app/app.config.ts  app.routes.ts  app.ts
    src/app/core/              auth.service, recipes.service, lists.service,
                               auth.guard, unauthorized.interceptor, photo-resize
    src/app/shell/             header (search, new, account), bottom-nav
    src/app/auth/              login, signup, account
    src/app/cookbook/          cookbook page (home, favorites, list detail), recipe-card
    src/app/lists/             lists page
    src/app/recipes/           recipe-detail, recipe-form (+ to-recipe-input)
    src/app/shared/            confirm-dialog
```

---

### Task 1: Monorepo scaffold and database

**Files:**
- Create: everything at the repo root listed above; `packages/shared/{package.json,tsconfig.json,src/index.ts}` (empty export); `apps/api/{package.json,tsconfig.json}`.
- Move: `/home/mateo/Proyectos/bon-appetit/docs/superpowers/` → `BonAppetit-v2/docs/superpowers/`.

**Interfaces:**
- Produces: workspace package names `@bonappetit/shared`, `@bonappetit/api`, `@bonappetit/web`. `@bonappetit/shared` builds with `tsc -p` to `dist/` and its `exports` points at `dist/index.js` + `dist/index.d.ts`. Postgres is at `postgres://postgres:postgres@localhost:5432/bonappetit` and `/bonappetit_test`.
- Root scripts (later tasks fill in the ones that need apps): `build:shared`, `dev`, `test`, `db:generate`, `db:migrate`, `db:seed`, `format`.

- [ ] **Step 1:** `mkdir BonAppetit-v2 && cd BonAppetit-v2 && git init -b main`. Move the `docs/superpowers` folder in. Write `.gitignore` (node_modules, dist, .env, .angular, apps/api/photos/, coverage) and `.prettierrc` (`{"printWidth":100,"singleQuote":true}`).
- [ ] **Step 2:** Root `package.json` with `"private": true`, `"workspaces": ["packages/*","apps/*"]`, `"engines": {"node": ">=24"}`, and devDeps `typescript@~5.9`, `prettier`, `concurrently`. `tsconfig.base.json`: `strict`, `target ES2023`, `module ESNext`, `moduleResolution bundler`, `verbatimModuleSyntax`, `skipLibCheck`.
- [ ] **Step 3:** `docker-compose.yml`: service `db`, image `postgres:18`, env `POSTGRES_PASSWORD=postgres` and `POSTGRES_DB=bonappetit`, ports `5432:5432`, a named volume, and `./docker/init.sql` mounted into `/docker-entrypoint-initdb.d/`. `init.sql`: `CREATE DATABASE bonappetit_test;`
- [ ] **Step 4:** Shared package skeleton (deps: `zod@^4`), `build` script `tsc -p tsconfig.json`. Root `build:shared` = `npm run build -w @bonappetit/shared`.
- [ ] **Step 5: Verify.** Run `npm install && npm run build:shared && docker compose up -d && sleep 3 && psql postgres://postgres:postgres@localhost:5432/postgres -c '\l'`. Expected: install succeeds, `packages/shared/dist/index.js` exists, and the listing shows `bonappetit` and `bonappetit_test`.
- [ ] **Step 6: Commit** `chore: scaffold V2 monorepo with postgres` (include the moved spec and plan).

### Task 2: Shared schemas

**Files:**
- Create: `packages/shared/src/schemas.ts`, `packages/shared/src/schemas.test.ts`; Modify: `src/index.ts` (re-export), `package.json` (`test: vitest run`, devDep `vitest`).

**Interfaces — Produces (all exported from `@bonappetit/shared`):**
- Constants: `PHOTO_MAX_BYTES = 4 * 1024 * 1024`, `PHOTO_MAX_EDGE = 1600`.
- Schemas and types (type = `z.infer` of the schema with the same name minus `Schema`):
  - `emailSchema`: trimmed, lowercased, `.email()`, max 254.
  - `signupBodySchema` `{email, password: 8–128, inviteCode: string 1–200}`. `loginBodySchema` `{email, password: string 1–128}`. `changePasswordBodySchema` `{currentPassword: 1–128, newPassword: 8–128}`.
  - `userSchema` `{id: uuid, email}`.
  - `recipeInputSchema` `{title: trim 1–120, ingredients: array(trim 1–200).max(100), steps: array(trim 1–2000).max(50)}`.
  - `recipeSummarySchema` `{id, title, hasPhoto: boolean, ingredientCount, stepCount, isFavorite: boolean, updatedAt: string /* ISO */}`.
  - `recipeSchema` `{id, title, ingredients, steps, hasPhoto, isFavorite, listIds: uuid[], createdAt, updatedAt}`.
  - `recipeQuerySchema` `{q?: trim max 120, listId?: uuid}`.
  - `listInputSchema` `{name: trim 1–60}`. `listSummarySchema` `{id, name, isFavorites: boolean, recipeCount: number}`.
  - `ApiError` type `{error: {code: ErrorCode; message: string; fields?: Record<string, string[]>}}` with `ErrorCode` = the union of the seven codes in Global Constraints.

- [ ] **Step 1: Write failing tests** in `schemas.test.ts`:
  - `emailSchema.parse('  A@X.com ')` → `'a@x.com'`; a 255-char email fails.
  - `signupBodySchema` rejects a 7-char password and a missing `inviteCode`, and accepts a 128-char password.
  - `recipeInputSchema.parse({title:'  Soup ', ingredients:[], steps:[]}).title === 'Soup'`. Title `'   '` fails. 101 ingredients fail. A step of 2001 chars fails. An ingredient `'  '` fails.
  - `listInputSchema` rejects a 61-char name.
- [ ] **Step 2:** Run `npm test -w @bonappetit/shared`. Expected: FAIL (module has no exports).
- [ ] **Step 3:** Implement the schemas in `schemas.ts` as listed above.
- [ ] **Step 4:** Run `npm test -w @bonappetit/shared && npm run build:shared`. Expected: PASS, build succeeds.
- [ ] **Step 5: Commit** `feat(shared): zod schemas and types for the API contract`.

### Task 3: API skeleton, DB schema, migrations, test harness

**Files:**
- Create: `apps/api/{package.json,vitest.config.ts,drizzle.config.ts,.env.example}`, `src/{env.ts,app.ts,server.ts}`, `src/http/errors.ts`, `src/db/{schema.ts,client.ts,migrate.ts}`, `drizzle/*`, `test/{setup.ts,helpers.ts,db.test.ts}`.

**Interfaces — Produces:**
- `env.ts`: `env` = `{DATABASE_URL: string, PORT: number (default 3000), PHOTO_DIR: string (default './photos'), SIGNUP_INVITE_CODE: string (may be ''), APP_ORIGIN: string (default 'http://localhost:4200'), NODE_ENV}`, validated with Zod at startup. `.env.example` lists all five keys with dev values. `SIGNUP_INVITE_CODE` is empty there with the comment "set to enable signup".
- `db/client.ts`: `createDb(url: string): { db: Db; close(): Promise<void> }`, with `Db` = drizzle over `postgres(url)`.
- `db/migrate.ts`: `runMigrations(url: string): Promise<void>` (drizzle `migrate`, folder `./drizzle`). Also runnable as a script.
- `db/schema.ts`: tables `users`, `sessions`, `recipes`, `lists`, `listRecipes` exactly per spec §5:
  - uuid PKs (`defaultRandom()`), timestamptz with `defaultNow()`, cascades as specified.
  - `recipes.ingredients` / `steps` are `text[]` with default `'{}'`.
  - Indexes: `recipes_user_title_idx` on `(user_id, f_unaccent(lower(title)))`; `lists_user_name_uq` unique on `(user_id, f_unaccent(lower(name)))`; `lists_one_favorites_uq` unique on `(user_id) WHERE is_favorites`; `list_recipes` PK `(list_id, recipe_id)`.
- `http/errors.ts`: `class HttpError extends Error { constructor(status: 400|401|403|404|409|413|415, code: ErrorCode, message: string, fields?: Record<string,string[]>) }`; `onError(err, c)`, which maps `HttpError` to its body and anything else to 500 `{error:{code:'internal',message:'Something went wrong'}}`, logging the error; `validationHook` for `zValidator` that throws `HttpError(400,'validation',…, fields)` from `z.flattenError(...).fieldErrors`.
- `app.ts`: `type AppDeps = { db: Db; storage: PhotoStorage; inviteCode: string; appOrigin: string; secureCookies: boolean }`; `createApp(deps: AppDeps): Hono`, which mounts everything under `/api`, registers `onError`, and (this task) `GET /api/health` → `{ok:true}`. Use a placeholder `PhotoStorage` type `unknown` until Task 7 defines it.
- `test/helpers.ts`: `makeTestApp(overrides?: Partial<AppDeps>): { app: Hono; db: Db }` using `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/bonappetit_test`), inviteCode `'test-invite'`, a fresh temp photo dir; `truncateAll(db)` = `TRUNCATE users, sessions, recipes, lists, list_recipes CASCADE`.
- `vitest.config.ts`: `globalSetup: './test/setup.ts'` (runs `runMigrations` on the test DB), `fileParallelism: false`.
- Package scripts: `dev: tsx watch --env-file=.env src/server.ts`, `test: vitest run`, `db:generate: drizzle-kit generate`, `db:migrate: tsx --env-file=.env src/db/migrate.ts`, `build: tsc -p tsconfig.json`.

- [ ] **Step 1:** Install deps: `hono @hono/node-server @hono/zod-validator drizzle-orm postgres zod @bonappetit/shared` and dev `drizzle-kit tsx vitest @types/node`.
- [ ] **Step 2:** Create the custom migration first with `npx drizzle-kit generate --custom --name=unaccent`. Its SQL:
  ```sql
  CREATE EXTENSION IF NOT EXISTS unaccent;
  CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
  ```
- [ ] **Step 3: Write failing test** `test/db.test.ts`:
  - `'migrations create one-favorites-per-user constraint'`: insert a user, insert a list with `isFavorites:true`, and expect inserting a second favorites list for the same user to reject.
  - `'list names are unique ignoring case and accents'`: inserting `'Puré'` and then `'PURE'` for the same user rejects.
  - `'GET /api/health'` → 200 `{ok:true}`.
- [ ] **Step 4:** Run `npm test -w @bonappetit/api`. Expected: FAIL (no tables / no app).
- [ ] **Step 5:** Write `schema.ts`, `client.ts`, `migrate.ts`, `errors.ts`, `app.ts`, `env.ts`, `server.ts`, and the test harness. Run `npm run db:generate -w @bonappetit/api` so the table migration comes after the custom one.
- [ ] **Step 6:** Run `npm test -w @bonappetit/api`. Expected: PASS. Also run `cp .env.example .env && npm run db:migrate -w @bonappetit/api` to migrate the dev DB.
- [ ] **Step 7: Commit** `feat(api): hono app skeleton, drizzle schema and migrations`.

### Task 4: Auth (signup with invite, login, sessions, password change)

**Files:**
- Create: `src/auth/{password.ts,sessions.ts,middleware.ts,routes.ts}`, `test/auth.test.ts`; Modify: `src/app.ts`, `test/helpers.ts`.

**Interfaces:**
- Consumes: `signupBodySchema`, `loginBodySchema`, `changePasswordBodySchema`, `userSchema` (Task 2); `HttpError`, `validationHook` (Task 3).
- Produces:
  - `hashPassword(pw: string): Promise<string>` / `verifyPassword(hash: string, pw: string): Promise<boolean>` (argon2id via `@node-rs/argon2`).
  - `createSession(db, userId): Promise<{token: string; expiresAt: Date}>`; `validateSession(db, token): Promise<{userId: string; email: string; sessionId: string} | null>` (deletes expired rows, slides expiry); `deleteSession(db, sessionId)`; `deleteOtherSessions(db, userId, keepSessionId)`; `setSessionCookie(c, token, expiresAt, secure)`; `clearSessionCookie(c)`.
  - `requireUser`: Hono middleware that sets `c.var.user: {id: string; email: string}` and `c.var.sessionId`. Throws `HttpError(401,'unauthorized','Not logged in')`.
  - Routes per spec §6 Auth table. Signup creates the user **and** a list `{name:'Favorites', isFavorites:true}` in one transaction.
  - `test/helpers.ts` gains `signupAs(app, email?: string): Promise<{cookie: string; user: User}>` (uses `'test-invite'`, password `'password123'`).
  - `app.ts`: `csrf({ origin: deps.appOrigin })` on `/api/*`.

- [ ] **Step 1: Write failing tests** in `test/auth.test.ts`:
  - signup with a valid code → 201, a `set-cookie` header containing `sid=`, `HttpOnly`, `SameSite=Lax`, and the body `{id,email}`. The DB then has exactly one list for the user with `isFavorites=true`.
  - wrong invite code → 403 `forbidden`. `makeTestApp({inviteCode:''})` → 403 even with `'test-invite'`. When an existing email is used with a wrong code, the response is 403 (not 409).
  - **Review Focus 1:** `Promise.all` of two signups with the same email → statuses sorted `[201, 409]`.
  - **Review Focus 2:** signup `'Cook@X.com'`, then login `'cook@x.com'` → 200, and a second signup `'COOK@x.com'` → 409.
  - login with a wrong password and login with an unknown email both → 401 with the identical message `'Invalid email or password'`.
  - `GET /api/auth/me` with the cookie → 200 user. After `POST /api/auth/logout` (204), the same cookie → 401.
  - **Review Focus 4:** cookie `sid=garbage` → 401. A session with `expires_at` in the past → 401, and its row is gone.
  - Sliding expiry: set `expires_at` to now + 10 days, call `/me`, and the row's `expires_at` is > now + 29 days.
  - `PATCH /api/auth/password` with a wrong current password → 401. With the correct one → 204, the old password no longer logs in, another session of the same user → 401, and the current cookie still works.
  - Validation: signup with a 7-char password → 400 `validation` with `fields.password`.
- [ ] **Step 2:** Run `npm test -w @bonappetit/api -- auth`. Expected: FAIL.
- [ ] **Step 3:** Implement. Check the invite code first with `timingSafeEqual` over `sha256` digests, and reject when `deps.inviteCode === ''`. Catch Postgres error code `23505` on insert → 409 `'Email already registered'`. Generate the token with `randomBytes(32).toString('base64url')`.
- [ ] **Step 4:** Run `npm test -w @bonappetit/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): invite-only signup, cookie sessions, password change`.

### Task 5: Recipes CRUD and search

**Files:**
- Create: `src/recipes/routes.ts`, `test/recipes.test.ts`; Modify: `src/app.ts`.

**Interfaces:**
- Consumes: `requireUser`, `signupAs`, `recipeInputSchema`, `recipeQuerySchema`, `recipeSummarySchema`, `recipeSchema`.
- Produces:
  - Routes per spec §6 Recipes table (except the photo routes, which come in Task 7). Responses match `RecipeSummary[]` / `Recipe`.
  - `GET /recipes` orders by `updated_at DESC`. `listId` filters by membership and returns 404 if the list isn't the user's.
  - `isFavorite` = membership in the user's favorites list. `hasPhoto` = `photo_key IS NOT NULL`. `PUT` sets `updated_at = now()`.
  - Exported helper `loadOwnedRecipe(db, userId, recipeId): Promise<RecipeRow>`, which throws 404. Task 6 and Task 7 reuse it.

- [ ] **Step 1: Write failing tests** in `test/recipes.test.ts`:
  - create → 201 with the trimmed title and the arrays in order. `GET /:id` returns `listIds: []`, `isFavorite: false`, `hasPhoto: false`.
  - list returns summaries newest first, with `ingredientCount`/`stepCount` correct.
  - `PUT` replaces all three fields and `updatedAt` increases. `DELETE` → 204, and then `GET` → 404.
  - Search: recipes `'Puré de papas'` and `'Pasta'`. `?q=pure` → only Puré. `?q=PAS` → only Pasta (case).
  - **Review Focus 3:** recipes `'100% rye'` and `'1000 rye'`. `?q=100%` → only `'100% rye'`. Recipe `'a_b'` vs `'axb'`: `?q=a_b` → only `'a_b'`.
  - **Isolation:** user B gets 404 for `GET`, `PUT`, and `DELETE` on A's recipe, and A's recipe is unchanged afterward. B's `GET /recipes` doesn't include it.
  - Invalid uuid in the path → 404 (not 500). A whitespace title → 400.
- [ ] **Step 2:** Run `npm test -w @bonappetit/api -- recipes`. Expected: FAIL.
- [ ] **Step 3:** Implement. Search with `sql\`f_unaccent(lower(${recipes.title})) LIKE '%' || f_unaccent(lower(${q})) || '%' ESCAPE '\\'\`` after escaping `\`, `%`, and `_` in `q`. Treat a non-uuid `:id` as not found before querying.
- [ ] **Step 4:** Run `npm test -w @bonappetit/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): recipe CRUD with accent-insensitive search`.

### Task 6: Lists and list membership

**Files:**
- Create: `src/lists/routes.ts`, `test/lists.test.ts`; Modify: `src/app.ts`.

**Interfaces:**
- Consumes: `requireUser`, `loadOwnedRecipe`, `listInputSchema`, `listSummarySchema`.
- Produces: routes per spec §6 Lists table. `GET /lists` orders `is_favorites DESC, lower(name)`. Duplicate name (unique index `23505`) → 409 `'You already have a list with that name'`. Rename or delete of Favorites → 409 `'Favorites can't be renamed or deleted'`. Membership PUT/DELETE → 204 and are idempotent.

- [ ] **Step 1: Write failing tests** in `test/lists.test.ts`:
  - a new user's `GET /lists` → `[{name:'Favorites', isFavorites:true, recipeCount:0}]`.
  - create `'Weeknight'` → 201. Creating `'weeknight'` → 409. Renaming to `'Baking'` works.
  - PATCH and DELETE on Favorites → 409.
  - Adding a recipe twice → 204 both times, and `recipeCount` = 1. `GET /recipes?listId=` returns it. `GET /recipes/:id` has `listIds` containing the list. Adding it to Favorites makes `isFavorite: true`.
  - Deleting the list → 204, and the recipe still exists. Deleting a recipe drops it from every list's `recipeCount`.
  - **Isolation:** B renaming, deleting, or reading A's list → 404. B adding **A's recipe to B's list** → 404. B adding **B's recipe to A's list** → 404. B's `GET /recipes?listId=<A's list>` → 404.
- [ ] **Step 2:** Run `npm test -w @bonappetit/api -- lists`. Expected: FAIL.
- [ ] **Step 3:** Implement. Use `INSERT … ON CONFLICT DO NOTHING` for membership.
- [ ] **Step 4:** Run `npm test -w @bonappetit/api`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): favorites and custom lists`.

### Task 7: Photos

**Files:**
- Create: `src/photos/{storage.ts,process.ts,routes.ts}`, `test/photos.test.ts`, `test/fixtures/` (generated in the test with sharp, so no binaries are committed); Modify: `src/app.ts`, `src/recipes/routes.ts` (delete removes the photo), `test/helpers.ts`.

**Interfaces:**
- Consumes: `loadOwnedRecipe`, `PHOTO_MAX_BYTES`, `PHOTO_MAX_EDGE`.
- Produces:
  - `createLocalStorage(dir: string)` returns `{ put(key: string, bytes: Buffer, contentType: string): Promise<void>; get(key: string): Promise<{bytes: Buffer; contentType: string} | null>; delete(key: string): Promise<void> /* no-op if missing */ }`. `type PhotoStorage = ReturnType<typeof createLocalStorage>` replaces the Task 3 placeholder. Keys are validated against `/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.webp$/`, so no path traversal is possible.
  - `processPhoto(bytes: Buffer): Promise<Buffer>`: `sharp(bytes).metadata()` format must be `jpeg|png|webp`, else `HttpError(415,'unsupported_media_type','Use a JPG, PNG or WebP image')`; then `.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer()`. Sharp drops metadata by default, so never call `withMetadata`.
  - Routes: `PUT/DELETE/GET /api/recipes/:id/photo` per spec. `bodyLimit({maxSize: PHOTO_MAX_BYTES})` → 413 `payload_too_large`. The multipart field is `photo`. GET sets `Content-Type: image/webp` and `Cache-Control: private, max-age=31536000, immutable` (web cache-busts with `?v=updatedAt`). PUT and DELETE bump `updated_at`.
  - Order on replace: put the new key, update the row, then delete the old key. Recipe DELETE: delete the row, then `storage.delete(key)`.

- [ ] **Step 1: Write failing tests** in `test/photos.test.ts`:
  - Upload a 3000×2000 JPEG generated by sharp with EXIF `{IFD0:{Make:'TestCam'}}` and orientation 6 → 200. GET → `image/webp`. Its metadata width/height ≤ 1600, it is rotated (portrait: height > width), and it has no `exif`. `GET /recipes/:id` has `hasPhoto: true`.
  - Uploading a text file renamed `.jpg` → 415. A 5 MB body → 413.
  - Replacing the photo: the old file is gone from the photo dir and the new one exists. `DELETE /photo` → 204, `hasPhoto: false`, and the file is gone.
  - Deleting the recipe removes its photo file.
  - **Review Focus 5:** remove the file from disk manually, then `DELETE /recipes/:id` → 204. Also, removing the file and then uploading a replacement → 200.
  - **Isolation:** B's GET/PUT/DELETE on A's recipe photo → 404.
  - **CSRF:** a multipart PUT with header `Origin: https://evil.example` → 403.
- [ ] **Step 2:** Run `npm test -w @bonappetit/api -- photos`. Expected: FAIL.
- [ ] **Step 3:** Implement (`npm i sharp -w @bonappetit/api`).
- [ ] **Step 4:** Run `npm test -w @bonappetit/api`. Expected: all API tests PASS.
- [ ] **Step 5: Commit** `feat(api): photo upload with re-encode and metadata stripping`.

### Task 8: Seed script and API dev loop

**Files:**
- Create: `apps/api/src/seed.ts`; Modify: `apps/api/package.json` (`db:seed`), root `package.json`.

**Interfaces:**
- Produces: `npm run db:seed` creates (idempotently: it skips if the email exists) user `demo@bonappetit.local` with password `demo-password-123`, Favorites, the lists `Weeknight` and `Baking`, and 6 recipes with ingredients and steps (no photos). Two are in Favorites and two in Weeknight. These credentials live only in `seed.ts` and the README dev section.

- [ ] **Step 1:** Write `seed.ts`, reusing `hashPassword` and the same transaction shape as signup.
- [ ] **Step 2: Verify.** Run `npm run db:seed` twice. Expected: the first run prints "Seeded demo user" and the second prints "Demo user already exists". Then `npm run dev -w @bonappetit/api` and log in through curl: `curl -si -X POST localhost:3000/api/auth/login -H 'content-type: application/json' -d '{"email":"demo@bonappetit.local","password":"demo-password-123"}'` → `200` with `set-cookie`.
- [ ] **Step 3: Commit** `feat(api): demo seed`.

### Task 9: Angular 22 app shell, design tokens, data services, auth guard

**Files:**
- Create: `apps/web` via `npx @angular/cli@22 new web --directory apps/web --style css --routing --ssr false --skip-git --skip-install`, then `proxy.conf.json`, `src/styles.css`, `src/app/core/*`, `src/app/shell/*`; Modify: `angular.json` (proxy, budgets), `apps/web/package.json` (name `@bonappetit/web`, dep `@bonappetit/shared`).
- Delete the CLI's placeholder app content.

**Interfaces:**
- Consumes: shared types and `PHOTO_MAX_EDGE`.
- Produces:
  - `proxy.conf.json`: `{"/api": {"target": "http://localhost:3000", "secure": false}}`.
  - `styles.css`: `:root` custom properties for every token in spec §7 (`--bg`, `--surface`, `--border`, `--border-input`, `--text`, `--muted`, `--primary`, `--primary-hover`, `--favorite`, `--danger`, `--tone-1..5`, `--font-display`, `--font-body`, `--radius-card: 20px`, `--radius-input: 14px`). Google Fonts `<link>` in `index.html`. Utility classes `.reveal` (fade-rise via `animation-timeline: view()`), `.lift` (hover translateY(-4px) + shadow), and `.hero-zoom`, guarded as in Global Constraints. The `.sr-only` class.
  - `app.config.ts`: `provideRouter(routes, withViewTransitions(), withComponentInputBinding())`, `provideHttpClient(withFetch(), withInterceptors([unauthorizedInterceptor]))`.
  - `AuthService`: `user = signal<User | null | undefined>(undefined)`; `load(): Promise<User | null>` (GET `/api/auth/me`, cached after first call); `login(body: LoginBody)`, `signup(body: SignupBody)`, `logout()`, `changePassword(body)`. All return Promises and update `user`.
  - `RecipesService`: `list(query: RecipeQuery): Observable<RecipeSummary[]>`, `get(id)`, `create(input: RecipeInput)`, `update(id, input)`, `remove(id)`, `uploadPhoto(id, blob: Blob)`, `removePhoto(id)`, `photoUrl(r: {id: string; updatedAt: string}): string` → `/api/recipes/${id}/photo?v=${encodeURIComponent(updatedAt)}`.
  - `ListsService`: `lists = signal<ListSummary[]>([])`, `refresh()`, `create(name)`, `rename(id, name)`, `remove(id)`, `add(listId, recipeId)`, `removeRecipe(listId, recipeId)`, `favoritesId = computed(...)`.
  - `authGuard` (awaits `load()`, redirects to `/login` when null) and `guestGuard` (redirects to `/` when logged in).
  - `unauthorizedInterceptor`: a 401 from any URL except `/api/auth/me` and `/api/auth/login` sets `user` to null and navigates to `/login`.
  - `fitWithin(w: number, h: number, max: number): {width: number; height: number}` and `resizePhoto(file: File, max = PHOTO_MAX_EDGE): Promise<Blob>` in `core/photo-resize.ts` (`createImageBitmap(file)` → canvas → `toBlob('image/jpeg', 0.85)`; it rejects with `'Could not read that image'` on decode failure).
  - Shell: `Header` (logo link, search input bound to `?q=` on `/` with 250 ms debounce, "New recipe" link, account button linking to `/account`) and `BottomNav` (Cookbook / New / Lists, shown below 720 px with `aria-current`). Visuals match canvas Main and Lists.
  - Routes (components land in Tasks 10–12; use temporary empty components): `login`, `signup` (guestGuard); `''`, `lists`, `lists/:id`, `recipes/new`, `recipes/:id`, `recipes/:id/edit`, `account` (authGuard); `**` → `''`.

- [ ] **Step 1: Write failing tests:** `photo-resize.spec.ts`:
  - `fitWithin(3000,2000,1600)` → `{width:1600,height:1067}`
  - `fitWithin(800,600,1600)` → unchanged
  - `fitWithin(1000,4000,1600)` → `{width:400,height:1600}`

  `auth.guard.spec.ts`: with `AuthService.load` resolving null, the guard returns a `UrlTree` for `/login`; with a user, it returns `true`.
- [ ] **Step 2:** Run `npm test -w @bonappetit/web`. Expected: FAIL.
- [ ] **Step 3:** Implement everything listed in Produces.
- [ ] **Step 4:** Run `npm test -w @bonappetit/web && npm run build -w @bonappetit/web`. Expected: PASS and the build succeeds.
- [ ] **Step 5:** Root `dev` script: `npm run build:shared && concurrently -n shared,api,web "npm:dev:shared" "npm run dev -w @bonappetit/api" "npm start -w @bonappetit/web"`, where `dev:shared` = `tsc -p packages/shared -w --preserveWatchOutput`. Root `test` runs all three workspaces' tests. Run `npm run dev` and open http://localhost:4200. Expected: redirect to `/login` (a placeholder at this point).
- [ ] **Step 6: Commit** `feat(web): angular 22 shell, tokens, services, auth guard`.

### Task 10: Login, signup, account screens

**Files:**
- Create: `src/app/auth/{login,signup,account}/*`, `src/app/shared/confirm-dialog/*`.

**Interfaces:**
- Consumes: `AuthService`.
- Produces:
  - `Login`: visual per canvas "Log in", with a link to `/signup`.
  - `Signup`: same layout with fields Email, Password, Invite code (`autocomplete="off"`). Server 403 shows "That invite code isn't valid", 409 shows "That email already has an account", and 400 shows the field messages under the fields.
  - `Account`: shows the email, a change-password form (current password, new password), a "Log out" button (`logout()` then `/login`), and success/error messages in an `aria-live="polite"` region.
  - `ConfirmDialog`: a component around a native `<dialog>`. `open(opts: {title: string; message: string; confirmLabel: string; danger?: boolean}): Promise<boolean>`. Focus goes to Cancel on open, and Escape counts as cancel.
  - All forms disable submit while a request is pending and use `<label for>` on every input.

- [ ] **Step 1:** Write `login.spec.ts`: submitting a valid form calls `AuthService.login` once with the typed values and navigates to `/`. A rejected promise with status 401 renders "Invalid email or password". Double-clicking submit calls `login` once.
- [ ] **Step 2:** Run `npm test -w @bonappetit/web`. Expected: FAIL.
- [ ] **Step 3:** Implement the three screens and the dialog.
- [ ] **Step 4:** Run `npm test -w @bonappetit/web`. Expected: PASS. Then manually, with `npm run dev`, `SIGNUP_INVITE_CODE=letmein` in `apps/api/.env`, and the API restarted: sign up a new user, log out, log back in, change password, and log in with the new password.
- [ ] **Step 5: Commit** `feat(web): login, invite signup and account screens`.

### Task 11: Cookbook, list detail, and lists screens

**Files:**
- Create: `src/app/cookbook/{cookbook,recipe-card}/*`, `src/app/lists/lists/*`.

**Interfaces:**
- Consumes: `RecipesService`, `ListsService`, `ConfirmDialog`, shell.
- Produces:
  - `RecipeCard` input `recipe: RecipeSummary`, output `toggleFavorite`. It shows the photo through `photoUrl` when `hasPhoto`, and otherwise the placeholder tone `--tone-${(hash(id) % 5) + 1}` with an image icon. Meta line is `"N ingredients · M steps"` (singular when 1). The heart button is ≥ 44 px with `aria-pressed` and an `aria-label` of "Add to Favorites"/"Remove from Favorites". Classes `.reveal .lift`.
  - `Cookbook` serves three routes:
    - `/` reads `q` and `filter=favorites` from the query params.
    - `/lists/:id` shows that list's recipes, with the list name as the h1 and a "Back to lists" link.
    - Chips exactly: **All recipes**, **Favorites** (heart icon), **Your lists →** (links to `/lists`). The selected chip is the filled dark style with `aria-current="page"`.
    - Heading "Your cookbook" with the subtitle `"<n> recipes, <m> lists"` (m counts custom lists only).
    - Toggling a heart updates the card optimistically and reverts on error.
    - Empty states: no recipes at all → "Your cookbook is empty" plus a "New recipe" link. A search with no hits → `No recipes match "<q>"`. An empty list → "This list is empty".
  - `Lists` screen per canvas "My lists": Favorites pinned (no menu), custom lists each with a ⋮ menu (Rename prompts via an inline input, Delete via `ConfirmDialog` with the text "Delete list “<name>”? Recipes in it are kept."), and a "New list" button opening an inline name input. A 409 shows the server message.
  - Responsive: the desktop grid is `repeat(auto-fill, minmax(260px, 1fr))`. At 390 px there's one column and the bottom nav shows.

- [ ] **Step 1:** Write `recipe-card.spec.ts`: `ingredientCount:1, stepCount:2` renders "1 ingredient · 2 steps". With `isFavorite` true, the button has `aria-pressed="true"` and the label "Remove from Favorites". Clicking emits `toggleFavorite` once and doesn't navigate.
- [ ] **Step 2:** Run `npm test -w @bonappetit/web`. Expected: FAIL.
- [ ] **Step 3:** Implement the card, cookbook, and lists screens.
- [ ] **Step 4:** Run `npm test -w @bonappetit/web`. Expected: PASS. Then manually, logged in as the seeded demo user: search "PASTA" finds the pasta recipe, the Favorites chip filters, Your lists → lists screen → a list → its recipes, create/rename/delete a list, and the Favorites list has no menu. Check at 1280 px and 390 px widths.
- [ ] **Step 5: Commit** `feat(web): cookbook, favorites filter, lists screens`.

### Task 12: Recipe detail and recipe form with photo

**Files:**
- Create: `src/app/recipes/{recipe-detail,recipe-form}/*`, `src/app/recipes/to-recipe-input.ts` (+ spec).

**Interfaces:**
- Consumes: `RecipesService`, `ListsService`, `ConfirmDialog`, `resizePhoto`, `RecipeInput`.
- Produces:
  - `toRecipeInput(v: {title: string; ingredients: string[]; steps: string[]}): RecipeInput`, which trims every string and drops blank ingredient/step lines.
  - `RecipeDetail` per canvas "Recipe detail":
    - hero photo with `.hero-zoom`, or the placeholder
    - h1 title and meta line `"N ingredients · M steps · in <list names>"`
    - an "In Favorites"/"Add to Favorites" toggle, plus an "Add to list" popover with a checkbox per custom list that calls add/removeRecipe immediately
    - an Edit link and a Delete button (confirm text "Delete “<title>”? This can't be undone." → back to `/`)
    - ingredients as checkboxes (not persisted), and numbered steps with `.reveal`
    - a 404 shows "Recipe not found" with a link back
  - `RecipeForm` per canvas "New recipe" serves both `recipes/new` and `recipes/:id/edit`:
    - Photo area with **Take photo** (`<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment">`) and **Upload** (same input without `capture`), both hidden behind labeled buttons. A local preview (`URL.createObjectURL`, revoked on change/destroy), plus "Remove photo" when one exists.
    - Title input, ingredient rows and step rows with add/remove (each row labeled `Ingredient N` / `Step N`; remove buttons labeled `Remove ingredient N`), and "+ Add ingredient" / "+ Add step".
    - Save flow: `create`/`update` with `toRecipeInput(...)`; then, if a new photo was picked, `uploadPhoto(id, await resizePhoto(file))`; if the photo was removed, `removePhoto`. Then navigate to `/recipes/:id`. The Save button is disabled while pending.
    - If the recipe saves but the photo fails: stay on the page with the message "Recipe saved, but the photo couldn't be uploaded. Try again." and switch to edit mode for that id, so retrying doesn't create a duplicate.
    - Cancel goes back without saving.
- [ ] **Step 1: Write failing tests:**
  - `to-recipe-input.spec.ts`: `{title:' Soup ', ingredients:['a',' ','  b '], steps:['', 'x']}` → `{title:'Soup', ingredients:['a','b'], steps:['x']}`.
  - `recipe-form.spec.ts`: on save with a picked file where `create` resolves `{id:'r1'}` and `uploadPhoto` rejects, the error text appears, `create` was called once, and a second save calls `update('r1', …)`, not `create`.
- [ ] **Step 2:** Run `npm test -w @bonappetit/web`. Expected: FAIL.
- [ ] **Step 3:** Implement the detail and form screens.
- [ ] **Step 4:** Run `npm test -w @bonappetit/web`. Expected: PASS. Then manually:
  - create a recipe with a large phone photo (> 5 MB). It uploads, and the detail page shows it upright.
  - edit the title. Replace the photo and the card updates (cache-busted). Remove the photo.
  - add the recipe to Favorites and a list, then delete it.
  - on a phone (or devtools device mode with a real phone over LAN if available), "Take photo" opens the camera.
  - with OS "reduce motion" on, nothing animates.
- [ ] **Step 5: Commit** `feat(web): recipe detail and form with camera/upload photo`.

### Task 13: Final pass and README

**Files:**
- Create/Modify: `README.md`.

- [ ] **Step 1:** README: what V2 is, prerequisites (Node ≥ 24, Docker), the setup steps (`npm install`, `docker compose up -d`, `cp apps/api/.env.example apps/api/.env` and set `SIGNUP_INVITE_CODE`, `npm run db:migrate`, optional `npm run db:seed`, `npm run dev`), the scripts, and a "Before deploying" checklist copied from spec §10.
- [ ] **Step 2: Verify.** From a clean state, run `docker compose down -v && docker compose up -d && npm ci && npm run db:migrate && npm test && npm run build -w @bonappetit/web && npx prettier --check .`. Expected: all tests pass, the build succeeds, and Prettier is clean. Also run `git grep -nIiE 'spoonacular|gemini|youtube|sweetalert'`, which should print nothing (outside docs/).
- [ ] **Step 3: Commit** `docs: README for V2`.
- [ ] **Step 4:** Ask the owner before creating `matearg/BonAppetit-v2` on GitHub and pushing. Do not push without that explicit OK.
