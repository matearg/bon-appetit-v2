# BonAppetit

A private, personal cookbook. Each user keeps their own recipes (title, one photo, ingredients, steps), finds them by name, and organizes them into lists. Every user gets a Favorites list that can't be renamed or deleted. Nobody else can see your recipes.

Signup is invite-only: a user needs the invite code set on the server.

**Stack:** Angular 22 web app, Hono API on Node.js, PostgreSQL with Drizzle migrations, and Zod schemas shared between the API and the web app.

## Prerequisites

- Node.js 24 or newer
- Docker (runs PostgreSQL)

## Setup

```sh
npm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set `SIGNUP_INVITE_CODE` to a code of your choice. It is empty by default, which disables signup.

```sh
npm run db:migrate
npm run db:seed   # optional: demo user and recipes
npm run dev
```

The web app runs at http://localhost:4200 and the API at http://localhost:3000.

## Development

| Script                             | What it does                                                        |
| ---------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                      | Builds shared types, then runs the shared watcher, API, and web app |
| `npm test`                         | Runs the shared, API, and web test suites                           |
| `npm run build:shared`             | Compiles `packages/shared`                                          |
| `npm run build -w @bonappetit/web` | Production build of the web app                                     |
| `npm run lint`                     | Checks formatting with Prettier                                     |
| `npm run format`                   | Formats the repo with Prettier                                      |
| `npm run db:generate`              | Generates a migration from changes to the Drizzle schema            |
| `npm run db:migrate`               | Applies migrations to the database in `DATABASE_URL`                |
| `npm run db:seed`                  | Creates the demo user and sample recipes                            |

**Demo login** (after `npm run db:seed`): `demo@bonappetit.local` / `demo-password-123`

### Testing from a phone on your network

The API rejects requests whose origin isn't `APP_ORIGIN`, so over the LAN most actions (favorites, deletes, logout, photo upload) fail with 403. Serve the web app with `npm start -w @bonappetit/web -- --host 0.0.0.0` and set `APP_ORIGIN=http://<your-LAN-IP>:4200` in `apps/api/.env`, then restart the API.

## Project layout

- `packages/shared`: Zod schemas and types shared by the API and the web app
- `apps/api`: Hono API, Drizzle schema and migrations, photo storage
- `apps/web`: Angular 22 web app
- `docs/`: design spec and implementation plan

## Before deploying

- [ ] Add login and signup rate limiting
- [ ] Add the Vercel adapter entry point
- [ ] Point `DATABASE_URL` at a hosted PostgreSQL database
- [ ] Add the bucket storage implementation for photos
- [ ] Set `NODE_ENV=production` (this turns on `Secure` cookies) and `APP_ORIGIN` to the web app's public URL
