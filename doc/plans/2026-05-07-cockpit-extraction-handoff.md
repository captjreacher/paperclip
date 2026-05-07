# Cockpit extraction handoff (Paperclip -> captjreacher/mgrnz)

## Scope

This repo keeps extraction prep only. Permanent Cockpit app development should happen in `captjreacher/mgrnz` at `apps/cockpit`.

## Cockpit source inventory in Paperclip

Primary files to migrate into MGRNZ cockpit app:

- `ui/src/pages/Cockpit.tsx`
- `ui/src/components/CockpitIssueModal.tsx`
- `ui/src/api/cockpit.ts`
- `packages/shared/src/types/cockpit.ts`

## Required dependency-direction change

Replace Paperclip API dependence:

- remove runtime reads/writes that require `/api/companies/:companyId/cockpit/*`

With Supabase events-first behavior:

- write to `public.events` from cockpit app
- read event feed from `public.events`
- use source system `mgrnz-cockpit`

## First working flow acceptance

1. Create Content Brief in Cockpit app.
2. Cockpit writes `content.brief.created` to `public.events`.
3. Cockpit activity feed shows the new event.

## Environment + deployment requirements for MGRNZ repo

`.env.example` in MGRNZ cockpit app:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_COCKPIT_SOURCE_SYSTEM=mgrnz-cockpit
```

Deployment target:

- `cockpit.mgrnz.com`
- include `public/CNAME` with `cockpit.mgrnz.com` when hosting expects CNAME file.
