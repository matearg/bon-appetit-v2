# BonAppetit V2 — Design

Date: 2026-10-14
Status: final draft, awaiting owner approval
Screen designs: https://claude.ai/artifact/VCpQj6CvtCHvmYtrCgdKH7 (canvas "BonAppetit V2")

## 1. Intent

BonAppetit V1 is an Angular 20 app with a `json-server` "database" and a separate Express backend that turns a prompt into YouTube search results through Gemini. The owner dislikes everything about how it looks, and the data and auth layer is not real: plaintext passwords, password checks done in the browser, the user id in `localStorage` used as a token, and each user stored as one nested JSON blob.

V2 starts over as a **private personal cookbook**:

- Each user keeps their own recipes. Nobody else can see them.
- They find recipes by name.
- They organize recipes into lists. Every user gets a built-in Favorites list.

The project is also a learning exercise. The owner has never used Hono and chose it on purpose.

## 2. Goals, non-goals, anti-goals

**Goals**
- Recipe CRUD scoped to the logged-in user. A recipe has a title, one photo (uploaded or taken with the device camera), ordered ingredients, and ordered steps.
- Search the user's recipes by name.
- A Favorites list created automatically for every user. It can't be renamed or deleted.
- Custom lists the user can create, rename, and delete. A recipe can be in many lists.
- Real auth handled by the server: hashed passwords and an httpOnly session cookie.
- One monorepo holding the API, the web app, and shared types.
- PostgreSQL as the database, with versioned migrations.
- A new visual design (section 7), with subtle scroll animations.
- Runs fully locally now, and can later deploy to Vercel without a rewrite.

**Non-goals (V2)**
- Any AI, YouTube, or Spoonacular integration. All of it is removed.
- Sharing, public recipes, or browsing other users' recipes.
- Structured ingredients (quantity, unit, and name as separate fields). Ingredients are free-text lines.
- Profile photos, social login, password reset by email, and email verification.
- Migrating V1 data. The V1 database holds one test user, so V2 starts empty.
- Actually deploying. The design only has to keep deployment possible.
- Offline support / PWA, and internationalization.

**Anti-goals (would count as failure even if everything works)**
- Any user being able to read or change another user's recipes, lists, or photos, including by guessing IDs.
- Passwords or session tokens readable by browser JavaScript, or stored in plaintext.
- Heavy or constant animation. Motion should be subtle, because this is a page you read while cooking.
- Keeping state in server memory or writing photos to the server's local disk in a way that blocks the later Vercel move.

## 3. Decided by the owner

- Keep Angular, on the latest version: **Angular 22** (22.2.x at the time of writing).
- Throw away every V1 component and style. The UI is rebuilt from scratch.
- Monorepo containing the API and the web app.
- PostgreSQL.
- **Hono** for the API, which means TypeScript end to end.
- Private per-user cookbook, with no sharing.
- Recipe fields are title, photo, ingredients, and steps. Search is by name only.
- The photo comes from either an upload or the device camera.
- A default Favorites list plus custom lists.
- Local first. Vercel may come later.
- Visual design: the canvas linked above, approved after one change. The home screen shows exactly three chips: **All recipes**, **Favorites**, and **Your lists →**. "Your lists" opens a separate screen with every list.
- Some scroll animation, but restrained.

## 4. Architecture

```
bon-appetit-v2/              (repo root — location: see §11)
  package.json               npm workspaces: apps/*, packages/*
  docker-compose.yml         postgres for dev (+ a test database)
  apps/
    api/                     Hono on Node, Drizzle, Zod
    web/                     Angular 22
  packages/
    shared/                  Zod schemas + inferred TS types used by both apps
```

- **Runtime:** Node 24 or newer. Development uses the installed Node 26. The API runs with `@hono/node-server` locally. All Hono routes live in an app object that a future Vercel entry point can export unchanged.
- **Same origin:** the web app calls `/api/*`. In dev, the Angular dev server proxies `/api` to the API. This keeps cookies first-party and needs no CORS. Production on Vercel would use the same layout.
- **Shared contract:** `packages/shared` exports the Zod request and response schemas plus their inferred types. The API validates with them through `@hono/zod-validator`, and the web app imports the types. Changing a field breaks compilation in both apps.
- **Database:** PostgreSQL 18 in Docker. Drizzle ORM handles schema and queries, and drizzle-kit generates migrations, which are committed to the repo. Connection comes from a `DATABASE_URL` env var. The code must not assume a long-lived connection pool, so a serverless Postgres such as Neon can be swapped in later.
- **Photo storage:** one module with `put(key, bytes, contentType)`, `get(key)`, and `delete(key)`. In dev it writes to a gitignored local folder. Later, a bucket implementation replaces that one file. That file is the only place that knows where photos live.

## 5. Data model

All IDs are UUIDs. All timestamps are `timestamptz`.

| table | columns | notes |
|---|---|---|
| `users` | id, email (unique, stored lowercased), password_hash, created_at | |
| `sessions` | id (= SHA-256 of the cookie token), user_id → users ON DELETE CASCADE, expires_at, created_at | the raw token is never stored |
| `recipes` | id, user_id → users CASCADE, title, ingredients `text[]`, steps `text[]`, photo_key (nullable), created_at, updated_at | index on `(user_id, f_unaccent(lower(title)))` |
| `lists` | id, user_id → users CASCADE, name, is_favorites bool, created_at | unique `(user_id, f_unaccent(lower(name)))`; partial unique index so each user has exactly one `is_favorites = true` row |
| `list_recipes` | list_id → lists CASCADE, recipe_id → recipes CASCADE, added_at | PK `(list_id, recipe_id)` |

- **Ingredients and steps are ordered `text[]` columns, not separate tables (my call).** They are always read and written together with their recipe and never queried on their own, so arrays keep the order without extra joins. This changes what I said earlier in conversation ("their own tables").
- Signup creates the user and their Favorites list **in the same transaction**.
- Deleting a list removes its `list_recipes` rows, never the recipes. Deleting a recipe removes it from every list and deletes its photo from storage.
- Search is **accent- and case-insensitive (my call)**: the first migration enables the `unaccent` extension and defines an IMMUTABLE wrapper `f_unaccent(text)` so it can be indexed. Query: `f_unaccent(lower(title)) LIKE '%' || f_unaccent(lower(q)) || '%'`, with LIKE wildcards in `q` escaped. "pure" finds "Puré". `pg_trgm` is optional if it ever gets slow.
- The Favorites row's stored `name` is irrelevant: the UI always labels `is_favorites = true` by its own string.

## 6. API

All routes are under `/api`, use JSON, and require a session except signup and login. Every query is filtered by the session's `user_id`. A resource owned by another user returns **404**, never 403, so its existence isn't revealed. Errors use the shape `{ error: { code, message, fields? } }`.

**Auth**
| method | path | body / result |
|---|---|---|
| POST | `/auth/signup` | `{email, password, inviteCode}` → 201, sets cookie, returns `{id, email}`; 403 if the invite code is wrong or signup is disabled; 409 if email taken |
| POST | `/auth/login` | `{email, password}` → 200 + cookie; 401 with a generic message on any mismatch |
| POST | `/auth/logout` | 204, deletes the session row and clears the cookie |
| GET | `/auth/me` | `{id, email}` or 401 |
| PATCH | `/auth/password` | `{currentPassword, newPassword}` → 204; deletes the user's other sessions |

**Recipes**
| method | path | notes |
|---|---|---|
| GET | `/recipes?q=&listId=` | summaries: `{id, title, hasPhoto, ingredientCount, stepCount, isFavorite, updatedAt}`, newest first |
| POST | `/recipes` | `{title, ingredients[], steps[]}` → 201 full recipe |
| GET | `/recipes/:id` | full recipe + `listIds` |
| PUT | `/recipes/:id` | replaces title, ingredients, and steps |
| DELETE | `/recipes/:id` | 204; also deletes the photo |
| PUT | `/recipes/:id/photo` | multipart `photo` field → 200 |
| DELETE | `/recipes/:id/photo` | 204 |
| GET | `/recipes/:id/photo` | streams the image after the ownership check; `Cache-Control: private` |

**Lists**
| method | path | notes |
|---|---|---|
| GET | `/lists` | `[{id, name, isFavorites, recipeCount}]`, Favorites first |
| POST | `/lists` | `{name}` → 201; 409 on duplicate name |
| PATCH | `/lists/:id` | `{name}`; 409 if it's Favorites |
| DELETE | `/lists/:id` | 204; 409 if it's Favorites |
| PUT | `/lists/:id/recipes/:recipeId` | add; idempotent; both must belong to the user |
| DELETE | `/lists/:id/recipes/:recipeId` | remove; idempotent |

The heart button on the web side is just PUT/DELETE on the Favorites list.

**Validation limits** (the Zod schemas in `shared` hold them):
- Email: valid format, at most 254 characters.
- Password: 8 to 128 characters.
- Title: 1 to 120 characters after trimming. It is the only required recipe field (my call).
- Ingredients: 0 to 100 lines, each 1 to 200 characters.
- Steps: 0 to 50, each 1 to 2000 characters.
- List name: 1 to 60 characters.

**Auth details**
- Passwords are hashed with argon2id using `@node-rs/argon2`, which ships prebuilt binaries and needs no native build.
- The session token is 32 random bytes in a cookie named `sid` with `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` when not in dev.
- Sessions last 30 days and slide: each use extends the expiry when less than 15 days remain.
- CSRF: `SameSite=Lax` plus Hono's `csrf()` origin-check middleware on every mutating route.
- **Invite code (my call on the mechanism):** one shared code in the API's `SIGNUP_INVITE_CODE` env var, compared in constant time (`crypto.timingSafeEqual` on SHA-256 digests). If the variable is unset or empty, signup is disabled and always returns 403. There are no per-person or single-use codes and no invite table. The signup screen has an "Invite code" field.
- Login rate limiting is **not** in V2.0, because it runs locally. It is a required step before any deployment (§10).

**Photos**
- **The browser shrinks the photo before upload (my call)**, so the same route works under Vercel's ~4.5 MB request limit: `createImageBitmap` (honors EXIF orientation) → canvas, longest side ≤ 1600 px → `toBlob('image/jpeg', 0.85)`. Any source size is accepted in the picker.
- The server still trusts nothing: accepted types are JPEG, PNG, and WebP, checked by `sharp` reading the actual bytes, not by the client's MIME type. Maximum request size is **4 MB**, enforced with Hono's body limit.
- Each photo is re-encoded with `sharp`: auto-rotated from EXIF, resized so the longest side is at most 1600 px, saved as WebP, and **stripped of all metadata** (camera photos often contain GPS location).
- The storage key is `<userId>/<recipeId>/<random>.webp`. Uploading a new photo replaces and deletes the old one.

## 7. Web app

- **Angular 22:** standalone components, signals, zoneless change detection, and built-in control flow. No NgModules. Choosing between reactive forms and signal forms is left to the builder.
- **No UI component library and no CSS framework (my call).** Use plain component CSS plus global design tokens as CSS custom properties. SweetAlert2 is dropped. Confirmations such as delete use the native `<dialog>`.
- **Routes:**

| path | screen | in canvas? |
|---|---|---|
| `/login`, `/signup` | auth | login yes; signup reuses the login layout |
| `/` | Cookbook: search + chips (All recipes / Favorites / Your lists →) + recipe grid | yes |
| `/?filter=favorites` | Cookbook filtered to Favorites (chip selected) | variant |
| `/lists` | All lists: Favorites pinned on top (no menu), custom lists with rename/delete, "New list" | yes (phone) |
| `/lists/:id` | One list's recipes, using the same grid as Cookbook, with the list name as the heading | no, reuse Cookbook layout |
| `/recipes/new`, `/recipes/:id/edit` | recipe form | yes (phone) |
| `/recipes/:id` | recipe detail: photo, Favorites toggle, Add to list, Edit, Delete, checkable ingredients, numbered steps | yes |
| `/account` | email shown, change password, log out | no |

- An auth guard calls `/auth/me` once and caches the result in a signal. A 401 from any call sends the user to `/login`.
- Search goes in the URL (`?q=`), debounced about 250 ms.
- **Camera / upload:** photos are downscaled in the browser before upload (§6). Two hidden `<input type="file" accept="image/jpeg,image/png,image/webp">`. The "Take photo" one adds `capture="environment"`, which opens the camera on phones. Desktop browsers ignore `capture` and show the file picker, which is acceptable. A live webcam view with `getUserMedia` is out of scope. Show a local preview before saving.
- Ingredient checkboxes on the detail page are display-only and not saved.
- **Responsive:** must work from phone width (390 px) up to desktop. The canvas has desktop versions of Cookbook and Detail and phone versions of Form, Lists, and Login. Builder adapts each to the other size using the same tokens. Phone gets a bottom navigation bar (Cookbook / New / Lists), as drawn.
- Screens not drawn (signup, account, list detail, empty states, loading, errors, delete dialog) follow the patterns of the drawn screens.

**Design tokens ("Herb & Ink")**
| token | value |
|---|---|
| background | `#F5F7F2` |
| surface | `#FFFFFF` |
| border | `#E1E5DC` / input border `#D5DBCF` |
| text | `#1B1F1A` |
| muted text | `#5B6259` |
| primary (herb) | `#2F6B3A`, hover `#1F4A28` |
| favorite (tomato) | `#D2462A`, destructive text `#9E2F1C` |
| photo placeholder tones | `#DCE8D2 #F3E3C3 #F1D4C8 #D6E4E8 #E7DDEB` |
| display font | Bricolage Grotesque 600–800 |
| body font | Figtree 400–600 |
| radii | cards 20px, inputs 14px, buttons/chips pill |
| touch targets | ≥ 44px |

**Motion**
- Use CSS scroll-driven animations (`animation-timeline: view()`) with no JS library:
  - cards and steps fade and rise about 24 px on entering the viewport
  - the detail hero photo slowly zooms from 1.08 to 1 while scrolling out
  - cards lift 4 px on hover
- Everything sits behind `@supports` and `prefers-reduced-motion: no-preference`. Browsers without support just show static content.
- Angular route transitions: at most a short cross-fade using the View Transitions API (`withViewTransitions()`).

## 8. Dev experience

- `docker compose up -d` starts Postgres with two databases: `bonappetit` for dev and `bonappetit_test` for tests.
- Root scripts: `npm run dev` runs the API and web together, `npm run db:migrate`, `npm run db:generate`, `npm test`, `npm run lint`.
- An `.env.example` sits in `apps/api` (`DATABASE_URL`, `PHOTO_DIR`, `SIGNUP_INVITE_CODE`). Real `.env` files are gitignored. No secrets get committed. V1 committed Spoonacular keys in `environments.ts`, and that must not happen again.
- Optional seed script that creates a demo user with a few recipes (my call: include it, since it's useful for the design work).

## 9. Testing

- API: Vitest calling `app.request()` against the `bonappetit_test` database, truncating tables between tests. Required coverage:
  - signup creates Favorites; wrong/missing invite code → 403; unset `SIGNUP_INVITE_CODE` disables signup; the invite code is checked before the email, so a wrong code never reveals whether an email is taken; duplicate email with a valid code → 409; login success and failure; logout invalidates the session
  - **isolation:** user B gets 404 for every read and write on user A's recipe, list, and photo, including adding A's recipe to B's list
  - Favorites can't be renamed or deleted; deleting a list keeps its recipes; deleting a recipe removes its photo and list memberships
  - validation rejects over-limit inputs; photo upload rejects non-images and strips metadata
- Web: the Angular 22 default test runner. Unit tests only for non-trivial logic (auth guard, form serialization). No end-to-end suite is required for V2.0.

## 10. Deployment readiness (not done now)

Before any deploy:
- Add login and signup rate limiting.
- Add the Vercel adapter entry point.
- Point `DATABASE_URL` at a hosted Postgres.
- Add the bucket storage implementation.
- Set `Secure` cookies.

None of these should require changing routes, schema, or the web app.

## 11. Answered by the owner (after review)

1. **UI language: English only**, matching the canvas. No i18n.
2. **Signup requires an invite code.** Details in §6.
3. **V2 goes in a new GitHub repo.** It starts with fresh git history, and nothing from V1's history is carried over (that history contains the leaked Spoonacular keys). My call: local folder `/home/mateo/Proyectos/bon-appetit/BonAppetit-v2`, GitHub repo `matearg/BonAppetit-v2`, with the owner confirming before the repo is created or pushed. This spec moves into that repo's `docs/superpowers/specs/` on the first commit. The two V1 repos are left untouched, and archiving them is up to the owner.

## 12. My calls (for the owner to check)

- Hono on Node (not Bun). npm workspaces, no Nx/Turborepo.
- Drizzle, Zod in a shared package, argon2id, DB-backed cookie sessions.
- `text[]` for ingredients and steps instead of child tables.
- Only the title is required. Photo, ingredients, and steps are optional.
- Photos served only through an ownership-checked API route, re-encoded to WebP, with metadata stripped.
- No UI or CSS framework. Native `<dialog>` instead of SweetAlert2.
- List detail reuses the Cookbook grid. Signup and account screens aren't drawn.
- Invite code = one shared env-var code; unset disables signup.
- Accent-insensitive search via `unaccent`.
- Photos shrunk in the browser before upload; server request limit 4 MB.
- Login rate limiting deferred until deployment.
- Demo seed script.

## 13. Left to the builder

- Folder structure inside each app.
- Reactive forms vs signal forms.
- How `npm run dev` runs both apps (for example `concurrently`).
- Lint/format setup (Prettier settings carried over from V1: printWidth 100, singleQuote).
- Exact component breakdown.
- Error and loading UI details within the design language.
