# Kawman ExAct — Enterprise Workspace Platform

Next.js (App Router) + TypeScript + Tailwind v4 + Prisma/Neon-ready scaffold
for the full Kawman ExAct enterprise workspace: CRM, field sales, document
management, meetings, and AI intelligence.

## Status

**Built and verified in this pass:**
- **Dashboard** (`/dashboard`) — KPI cards with sparklines, sales pipeline, AI CRM
  insights, today's field activity, live visit map preview, leads-by-source donut,
  upcoming follow-ups, recent activity.
- **Leads** (`/leads`) — searchable, sortable, status-filterable table.
- **Companies** (`/companies`) — searchable, status-filterable table.
- **Contacts** (`/contacts`) — searchable card grid.
- **Deals & Pipeline** (`/deals`) — kanban board with real drag-and-drop between
  stages (client-side state; see the comment in `deals-kanban.tsx` for how to
  wire the drop handler to a Server Action).
- Full app shell: grouped sidebar navigation, header (global search / notifications
  / account menu), footer, mobile drawer.

All five pages pass `tsc --noEmit`, `eslint`, and `next build` clean, and were
booted with `next start` and hit over HTTP to confirm each route actually
renders (not just compiles) before being included here.

Every page's data flows through a typed service function (`src/services/*.service.ts`)
that currently returns realistic mock data shaped exactly like the eventual
Prisma query result — so swapping in real data later doesn't require touching
any component.

**Important limitation:** the sandbox this was built in cannot reach
`binaries.prisma.sh` (or Cloudinary/Mapbox/AI provider APIs), so **no code
here has been run against a real database** — `src/generated/prisma` in this
zip is a pre-generated client carried over from an earlier session with
working network access; regenerate it yourself with `npm run db:generate`
once you've pointed `DATABASE_URL` at your own Neon instance.

**Not yet built:** authentication, admin panel pages (users/roles/orgs/
departments/teams/storage/audit logs), field sales (live map/check-ins/
geofencing/visit reports), meetings + MOM/AI insights, file management +
Cloudinary wiring, AI chat/reports, the global command palette UI, real
Prisma queries anywhere, seed data, and tests. See the original spec for
the full module list.

## Getting Started

```bash
npm install
cp .env .env.local   # already has a local Prisma Postgres dev URL
npm run dev
```

Open http://localhost:3000 — it redirects to `/dashboard`.

## Scripts

```bash
npm run dev          # start dev server
npm run build         # production build (Turbopack)
npm run lint           # eslint
npm run typecheck   # tsc --noEmit
npm run test            # vitest
npm run test:e2e     # playwright

npm run db:generate  # prisma generate
npm run db:migrate    # prisma migrate dev
npm run db:seed         # prisma db seed
npm run db:studio      # prisma studio
```

`npm run lint`, `npm run typecheck`, and `npm run build` all pass clean as of
this commit.

## Project layout

See `src/app`, `src/components`, `src/services`, `src/lib`, `src/stores`,
`src/types`, and `prisma/schema.prisma`. Dashboard-specific pieces live in
`src/components/dashboard/*` and `src/services/dashboard.service.ts`.
