# Cockpit migration notes

Primary source files in Paperclip used for migration:

- `ui/src/pages/Cockpit.tsx` (dashboard shell, quick actions framing, activity panels)
- `ui/src/components/CockpitIssueModal.tsx` (escalation/action ideas)
- `ui/src/api/cockpit.ts` (old Paperclip API dependency surface)
- `packages/shared/src/types/cockpit.ts` (event/summary typing ideas)

What changed in the standalone app:

- Removed Paperclip `/api/companies/:id/cockpit/*` fetch dependencies.
- Added direct Supabase `public.events` writes and reads.
- Implemented first working flow: **Create Content Brief** => `content.brief.created` event.
- Added independent deploy placeholders (`public/CNAME`, `.env.example`).
