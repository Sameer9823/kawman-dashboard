# Kawman ExAct — Enterprise Workspace Platform

Next.js 16.3.3 (App Router) + TypeScript + Tailwind v4 + Prisma 7 + Neon Postgres + better-auth. Full enterprise workspace: CRM, field sales, document management, meetings, AI intelligence, and team management.

## Status

All routes pass `tsc --noEmit`, `eslint`, and `next build` (74+ static/dynamic routes, `ƒ Proxy (Middleware)`). DB schema validates (`prisma validate 🚀`). Client regenerated to `src/generated/prisma` (Prisma 7.10, output `../src/generated/prisma`, **not** `node_modules/.prisma`).

### What ships

- **Auth** — `better-auth` with `prismaAdapter(postgresql)`, `emailAndPassword` + `emailOTP`, `customSession` (enriches every session from DB: `organization`, `department`, `team`, `roles`, `permissions` via `permission.service`), `nextCookies`, rate-limit (`/sign-in/email: 5/60s`). `Session` extended with `lastSeenAt`/`endedAt` (online presence). `auth.ts:customSession` is hardened with `try/catch` so a Prisma throw never crashes login.
- **RBAC** — `permissions-data.ts` is the source of truth (`PERMISSIONS` + `ROLE_PERMISSIONS`), `permissions.ts` is the client hook (`usePermissions`), `permission.service.ts` is the server source of truth (`getUserPermissions/hasPermission/requirePermission`), `rbac-seed.ts` seeds. New permissions: `team.view`, `team.view_all`, `reports.submit`, `reports.view_all`. `SUPER_ADMIN` gets all, `ADMIN`/`MANAGER` get `team.view*`, sales roles get `team.view`/`reports.submit`, etc. Every service scopes by `session.user.organizationId`; cross-org access is structurally impossible.
- **Dashboard** (`/dashboard`) — KPI cards, sparklines, sales pipeline, AI insights, today's field activity, live map preview, leads-by-source, follow-ups, recent activity. All via `dashboard.service.ts` (`server-only`, `requireApiSession`).
- **CRM** — Leads, Companies, Contacts, Deals (kanban `DEALS_KANBAN_LIMIT=500`), Follow-ups, Calendar, Field Visits, Sales Reports. Scoped helpers (`getCompanyOptions`/`getContactOptions` use `scopeWhere`), `$transaction` on `createLead`, magic-byte file validation, MIME allowlist (no `text/html`/`svg`).
- **Files** (`/files/*`) — Folders, upload (Cloudinary `resourceTypeForMime`, `safeName` CRLF strip, extension guard), visibility (`PRIVATE/TEAM/DEPARTMENT/ORGANIZATION/SHARED`), folder permissions (`FilePermission.folderId`), shares (`FileShare`), versioning (`FileVersion`), activity (`FileActivity`), star/trash.
- **Meetings** — Schedule, videos, MOM, transcription (`os.tmpdir()` + `pipeline` streaming, no `src/` temps), recordings (`api/meetings/[id]/upload-recording`: `meetings.create|update` + `checkRateLimit` + `isCloudinaryConfigured` + `50MB` cap).
- **My Team** (new) — `DailyReport` (`@@unique([userId,date])`, `DailyReportStatus: SUBMITTED/MISSED/DRAFT`, stats: `tasksCompletedCount`, `crmRecordsUpdatedCount`, `leadsWorkedOnCount`, `filesUploadedCount`, `activeWorkingTimeMinutes`), `AIReport.dailyReportId` (`@unique`), reused `Activity`/`Session`. Services: `team.service.ts` (`getTeamDashboardMetrics`, `getTeamMembers`), `daily-report.service.ts` (`getTodayReportDraft`, `submitDailyReport`, `listDailyReports`, `getEmployeeProfile`), `ai.service.ts` (`generateEmployeeDailySummary`, `generateTeamManagementSummary` via existing `AIReport` + `scopeFilterForAI`). Actions: `admin/my-team/actions.ts` (`'use server'`, Zod, `validateCsrf` inside `try`, `assertPermission`, `logAudit`, `revalidatePath`). Routes: `api/ai/employee-summary` (`isAIConfigured` 503, `requireApiSession` 401, `checkRateLimit 10/60` 429) + `api/presence/heartbeat` (`lastSeenAt`). UI: `admin/my-team` (stat cards, productivity recharts chart, recent activity, `TeamSummaryPanel`, `TeamDateFilter`), `admin/my-team/[userId]` (profile header + 8 tabs), `admin/my-team/members`, `admin/my-team/reports` (paginated, CSV export), `dashboard/daily-report` (pre-filled form), `useHeartbeat` (60s + `visibilitychange`) wired in `MainLayout`. Sidebar gated `requiresAnyPermission: ['team.view','team.view_all']`.
- **AI** — `lib/ai.ts` (`isAIConfigured`, `REPORT_TYPES`), `ai.service.ts` (`buildOrgContext` scoped, `generateReport`, SSE `ReadableStream`), `ai/chat`, `ai/reports`, `ai/summary`, `ai/data-analysis`.
- **Admin** — Users (create with `hashPassword` + `createLocalAccountIssuer('credential')` + `UserRole`), Roles & Permissions, Organizations, Departments, Teams, Integrations, Storage, Activity/Audit Logs, Settings. All mutations via colocated Server Actions (not REST) per Phase 0 convention.

## Tech stack

- **Framework:** Next.js 16.3.3, React 19.2, TypeScript 5
- **Styling:** Tailwind v4, `class-variance-authority`, `clsx`/`tailwind-merge`, Radix UI (dialog, select, popover, tabs, etc.), `lucide-react`, `recharts` 3.10, `react-day-picker`
- **Data:** Prisma 7.10 (`@prisma/adapter-pg` + `pg` 8.23), Neon Postgres (pooled `DATABASE_URL` + direct `DIRECT_URL`), `server-only` services, `zod` 4.4
- **Auth:** `better-auth` 1.7, `customSession` + `emailOTP` + `nextCookies`
- **Files/Media:** `cloudinary` 2.11, `@cloudinary/react`, `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg`, `mapbox-gl` + `@mapbox/mapbox-sdk` + `@turf/turf`
- **AI:** `openai` 7.8, `@google/generative-ai` 0.24, `ai` 7.0
- **Infra:** `ioredis` 6, `bullmq` 6.3, `next-themes`, `zustand` 5, `date-fns` 4.4, `sonner`
- **Tooling:** `eslint-config-next` 16.3, `vitest` 4.1, `playwright` 1.62, `tsx` 4.23

## Project layout

```
dashboard/
  prisma/
    schema.prisma          # 40 models + 13 enums (incl. DailyReport, Session.lastSeenAt/endedAt, AIReport.dailyReportId)
    seed.ts                # demo org + roles/permissions seed
    migrations/            # 20260907045603, 20260907052052_add_issuer_to_account, 20260908112454_meeting_video_upload, 20260911122517 (My Team)
  prisma7.config.ts        # defineConfig — schema + migrations.path + datasource.url = env("DIRECT_URL")
  src/
    app/
      (auth) /login /signup /forgot-password /reset-password
      admin/               # dashboard, users, roles, organizations, departments, teams, integrations, storage, activity, audit-logs, settings, my-team/*
      ai/                  # chat, reports, summary, data-analysis
      crm / leads / companies / contacts / deals / follow-ups / calendar
      field-sales/ / files/* / meetings/* / reports/sales / dashboard (+ daily-report) / settings/profile
      api/                 # ai/* (chat, reports, employee-summary), files/*, meetings/*, presence/heartbeat, admin/*, companies/contacts/deals/leads export, etc.
      page.tsx             # session-aware: getSession() → /dashboard else /login
    components/
      layout/              # MainLayout (useHeartbeat), Sidebar (permission-gated NAV_GROUPS), Header, Footer, CommandPalette
      dashboard/ / crm/ / ai/ / reports/ / ui/ (button, card, badge, input, select, tabs, table, date-picker, popover, etc.)
    services/              # *.service.ts — all `import 'server-only'`, prisma from @/lib/db, requireApiSession + org scoping
      dashboard.service.ts, ai.service.ts, team.service.ts, daily-report.service.ts, user.service.ts, role.service.ts,
      file.service.ts, lead.service.ts, company.service.ts, contact.service.ts, deal.service.ts, meeting.service.ts, etc.
    lib/
      auth.ts, session.ts (getSession/requireSession/requireApiSession), permissions.ts (client), permissions-data.ts (catalog),
      permission.service.ts, rbac-seed.ts, audit-log.ts, csrf.ts (validateCsrf), rate-limit.ts (MAX_MEMORY_BUCKETS 10000 LRU),
      redis.ts, cloudinary.ts, transcription.ts (tmpdir + pipeline), ai.ts, db.ts (PrismaPg + assertEnv), env.ts (assertEnv), utils.ts
    hooks/                 # useHeartbeat
    generated/prisma/      # generated client (output = ../src/generated/prisma) — gitignored in practice, committed here for offline build
    stores/ types/
  next.config.ts           # serverActions.bodySizeLimit = "10mb"
  src/proxy.ts             # Security headers (CSP script-src 'self' 'unsafe-inline' 'unsafe-eval'), PUBLIC_EXACT/PREFIXES, getSessionCookie pre-check, matcher (api/auth + upload-recording + meetings/new excluded)
  src/components/providers.tsx # QueryClientProvider + ReactQueryDevtools gated by canUseLocalStorage (fixes SecurityError in sandboxed iframe)
```

## Getting started

```bash
cd dashboard
npm install

# 1. Env — copy and fill (see .env.example)
cp .env.example .env
# Required: DATABASE_URL (Neon pooled), DIRECT_URL (Neon direct, for migrations)
#           BETTER_AUTH_SECRET (openssl rand -hex 32), BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL
# Optional: OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY, CLOUDINARY_*, NEXT_PUBLIC_MAPBOX_TOKEN, REDIS_URL, RESEND_API_KEY/EMAIL_FROM

# 2. DB
npm run db:generate        # prisma generate (writes src/generated/prisma)
npm run db:migrate         # prisma migrate dev (creates DB + _prisma_migrations)
# or on a deployed DB:
npm run db:deploy          # prisma migrate deploy

# 3. Seed (idempotent)
npm run db:seed            # demo org, roles, permissions

# 4. Dev
npm run dev                # http://localhost:3000 → /dashboard if authed else /login
```

> **Migrated DB but empty `_prisma_migrations`?** If you applied `prisma/migrations/*/migration.sql` manually (e.g. via Neon SQL editor), baseline the history so `prisma migrate status` stops reporting drift:
> ```bash
> node --input-type=module <<'NODE'
> import 'dotenv/config'; import crypto from 'crypto'; import fs from 'fs'; import path from 'path'; import pg from 'pg';
> const c=new pg.Client({connectionString:process.env.DATABASE_URL}); await c.connect();
> for(const n of fs.readdirSync('prisma/migrations').filter(f=>!f.startsWith('.')&&fs.statSync(path.join('prisma/migrations',f)).isDirectory()).sort()){
>   const sql=fs.readFileSync(path.join('prisma/migrations',n,'migration.sql'),'utf8');
>   await c.query("INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid(), $2, NOW(), $1, '', NULL, NOW(), 1) ON CONFLICT DO NOTHING",[n,crypto.createHash('sha256').update(sql).digest('hex')]);
>   console.log(n);
> }
> await c.end();
> NODE
> ```
> After any schema change: `rm -rf .next && npx prisma generate && npm run dev` (clears the stale Next + Prisma engine that otherwise surfaces as `PrismaClientKnownRequestError` / `handleRequestError`).

## Scripts

```bash
npm run dev          # next dev
npm run build        # next build (Turbopack) — must show ƒ Proxy (Middleware)
npm run start        # next start
npm run lint         # eslint
npm run typecheck    # tsc --noEmit (or npx tsc --noEmit --skipLibCheck for the fast gate)
npm run test         # vitest run
npm run test:e2e     # playwright test
npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run db:deploy    # prisma migrate deploy
npm run db:seed      # prisma db seed (tsx prisma/seed.ts)
npm run db:studio    # prisma studio
```

All three gates are green on this commit: `tsc --noEmit --skipLibCheck` 0, `eslint` 0, `next build` 0, `prisma validate` 🚀.

## Environment

See `.env.example` (38 lines, Neon + better-auth + optional integrations). `src/lib/env.ts:assertEnv()` fails fast in production if `DATABASE_URL`/`BETTER_AUTH_SECRET` (≥32 chars) are missing, wired on first `src/lib/db.ts` import (Next 16 has no `instrumentationHook`). `src/lib/db.ts` uses `PrismaPg` adapter + `log: ['error']` only (no `query` log/PII).

## Conventions (read before contributing)

- **Reads:** server components call `*.service.ts` directly (e.g. `admin/users/page.tsx` → `getOrgUsers()`), no REST layer.
- **Mutations:** colocated Server Actions (`'use server'`, Zod schema, `validateCsrf()` inside `try` when the action returns `{error}`, `requireApiSession()`/`assertPermission('users.create')`, `logAudit()`, `revalidatePath()`). Pattern: `admin/users/actions.ts`, `admin/my-team/actions.ts`.
- **REST:** only where a client must `POST`/`fetch` outside a page render (e.g. `api/ai/reports`, `api/ai/employee-summary`, `api/presence/heartbeat`): `requireApiSession()`, `checkRateLimit(key,limit,window)`, `isAIConfigured()` gate, explicit `401/429/503` JSON.
- **Scoping:** every service scopes by `session.user.organizationId`; `scopeWhere`/`scopeFilterForAI` for record-level isolation.
- **Permissions:** add to `permissions-data.ts` + seed in `rbac-seed.ts`; enforce server-side (`(session.user.permissions as string[]).includes(...)`), never UI-only.

## Security

- `proxy.ts` — `PUBLIC_EXACT` + `PUBLIC_PREFIXES` (`=== p || startsWith(p+'/')`) so `/api/auth` never matches `/api/auth-bypass`; `isAuthOnlyPath`/`isAuthApiRoute` exact+prefix; `getSessionCookie` pre-check + full `auth.api.getSession` verification for authed users; security headers (`X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy`, `Permissions-Policy`, CSP `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'` for Next inline/HMR, `object-src 'none'`); rate-limit headers on auth API.
- `csrf.ts` — `validateCsrf()` (Origin vs Host, allows missing Origin, localhost in dev) — wired into 73 Server Actions across 19 files.
- Uploads — MIME allowlist without executable types, extension guard for `.html/.js/.css/.xml/.svg`, `file.slice(0,12)` magic-byte check, `file.type` never trusted, `safeName` CRLF strip, PII logs redacted.
- `rate-limit.ts` — `MAX_MEMORY_BUCKETS=10000` LRU; `redis.ts` — no `lazyConnect`, gated log.
- `transcription.ts` — `os.tmpdir()` + `pipeline` streaming, no `src/` temps.
- `proxy.matcher` — `api/meetings/[^/]+/upload-recording` (not `.*`), `favicon\.ico` escaped, known `requestData.body.finalize()` race noted.
- `page.tsx` — session-aware redirect (`getSession()` → `/dashboard` or `/login`), not unconditional.
- `providers.tsx` — `ReactQueryDevtools` dynamically imported, gated by `canUseLocalStorage()` `try/catch` (fixes `SecurityError: Failed to read localStorage` in sandboxed iframe).

## Verification

```bash
npx tsc --noEmit --skipLibCheck
npx eslint .
npx prisma validate
npm run build   # expect: ✓ Compiled successfully, Generating static pages (74+), ƒ Proxy (Middleware)
```

Nil `TODO` in `src/` (only `src/generated/prisma` vendor TODOs).

## Deployment

- Set `DATABASE_URL` (pooled) + `DIRECT_URL` (direct) + `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL`/`NEXT_PUBLIC_APP_URL` in your host (Vercel/Neon). Run `prisma migrate deploy` + `prisma generate` in CI (`postinstall: prisma generate` if you gitignore `src/generated/prisma`).
- Optional: `OPENAI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`, `CLOUDINARY_*`, `NEXT_PUBLIC_MAPBOX_TOKEN`, `REDIS_URL`, `RESEND_API_KEY`/`EMAIL_FROM`.
