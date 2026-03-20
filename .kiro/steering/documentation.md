---
inclusion: always
---

# Documentation rules

Every time code is changed in this project, documentation must be updated in the same session — never left for later.

## Files to keep in sync

- `README.md` — technical reference for developers (API, schema, env vars, architecture)
- `apps/frontend/src/app/(dashboard)/guide/page.tsx` — in-app user guide (booking flow, FAQ, features)

## What triggers an update

| Change | What to update |
|--------|---------------|
| New or modified API endpoint | README API catalog table |
| Prisma schema change (new field, enum value, model) | README Data Structure + Status Values |
| New env var | README Environment Variables table |
| Booking flow change | README status diagram + guide FLOW_STEPS array |
| New user-facing feature | guide page (relevant section or FAQ) |
| FAQ answer no longer accurate | guide FAQ_ITEMS |

## Rules

- Update only the sections affected — do not rewrite accurate content.
- README is in English. Guide page content is in Spanish.
- Commit documentation changes together with code changes in the same commit, or immediately after.
- Always push with `--no-verify` from `cwd: Citas`.
