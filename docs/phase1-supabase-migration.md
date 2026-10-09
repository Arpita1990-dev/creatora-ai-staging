# Phase 1: SQLite to Supabase PostgreSQL

This phase migrates relational data only. It does not use Supabase Auth,
Supabase Storage, or RLS, and it does not call Razorpay or any OAuth provider.

## Safety and preparation

- Resolve the active `DATABASE_URL` against the generated SQLite client's
   Prisma schema directory; do not assume it is relative to the shell.
   Keep the active database and the verified timestamped file under `backups/`.
- Keep the existing `TOKEN_ENCRYPTION_KEY`; changing it makes copied provider
  and social ciphertext undecryptable.
- Never point `SOURCE_DATABASE_URL` at PostgreSQL or `TARGET_DATABASE_URL` at a
  file URL. The scripts reject either mistake.
- The copy script refuses a target containing rows and copies all tables in a
  single PostgreSQL transaction.
- Migration scripts require Node.js with `node:sqlite` (Node 22.13 or newer).
   Source reads use a read-only connection. Use an offline backup without WAL,
   SHM, or journal sidecars, an absolute file URL, and its verified SHA-256 hash
   in `SOURCE_DATABASE_SHA256`.
- The copy script automatically runs the integrity audit before connecting to
   the target. Invalid timestamps, required values, enums, scalar types, declared
   foreign keys, or credential ownership prevent copying.

## Target creation and copy

Use server-only environment variables in the shell running these commands.
Do not add connection strings to browser variables or source control.

1. Generate both compatibility clients: `npm run db:generate`.
2. Apply `prisma/postgresql-migrations/20261005_phase1_baseline.sql` to a new,
   empty Supabase PostgreSQL database. With Prisma this can be done using
   Prisma's `db execute` can use a separate schema/configuration whose
   server-side `DATABASE_URL` is the target connection. Do not put a real
   connection URL in command-line arguments or switch the application's URL.
3. Set `SOURCE_DATABASE_URL` to the verified SQLite backup's absolute file URL,
   `SOURCE_DATABASE_SHA256` to its SHA-256 checksum, and `TARGET_DATABASE_URL`
   to the empty Supabase database. Keep the existing encryption key available
   only to the server-side validation process. The scripts read shell variables;
   they do not automatically load `.env` or `.env.local`.
4. Run `npm run db:audit:sqlite`. Stop if `migrationBlocking` is true.
5. Run `npm run db:migrate:phase1`.
6. With the unchanged `TOKEN_ENCRYPTION_KEY`, run
   `npm run db:validate:phase1`. Do not cut over unless it reports PASS.
7. Test the application in staging by setting only server-side `DATABASE_URL`
   to the validated PostgreSQL connection. Do not perform paid generation or
   billing charges as part of validation.

The historical files in `prisma/migrations/` are the preserved SQLite history
and contain SQLite-only PRAGMAs. Do not deploy that directory to PostgreSQL;
the clean PostgreSQL baseline above is the Phase 1 target schema.

## Rollback

1. Stop application and worker processes so no PostgreSQL writes occur during
   the switch.
2. Restore server-side `DATABASE_URL` to the exact original SQLite file URL.
   For this installation, `file:./dev.db` resolves relative to `prisma/`.
   An absolute URL such as `file:C:/creatora-ai/prisma/dev.db` avoids ambiguity.
3. Run `npm run db:generate:sqlite-source` if the generated compatibility
   client is absent.
4. Restart the application and worker. `lib/prisma.js` selects the SQLite
   client for `file:` URLs and the PostgreSQL client otherwise.
5. Verify sign-in, active workspace, current plan, project/asset reads, and job
   history. Do not delete the PostgreSQL target until the rollback is accepted.

Rollback does not merge writes made after cutover; schedule a maintenance
window or account for that delta before a production switch.

## Phase 2 storage inventory

Database URL fields are copied unchanged. Binary files stay in `uploads/`,
`.data/project-assets/`, and `.data/voice-inputs/`. Generated media, TTS,
reference files, and project assets must be migrated and URL-reconciled in the
separate storage phase.

## Verification report: 2026-10-05

### Source

- Database: SQLite, still the application's active database.
- Active file: `C:/creatora-ai/prisma/dev.db`.
- Size: 1,601,536 bytes. Prisma: 6.19.3. Models: 32. SQLite migrations: 20.
- Backup: `backups/pre-supabase-phase1-20261005-205912.db`.
- Backup read-only integrity validation: PASS.
- Active file and backup SHA-256:
   `18208e99e2c960b0de12fd618da5e5463fb57db7bf8b46ad0ed0a6626ded36f9`.
- Backup checksum verified: PASS. No source records were edited.

### Target

- Database: Supabase PostgreSQL, prepared but not connected.
- Connection: NOT RUN; `TARGET_DATABASE_URL` is not configured.
- Schema creation: NOT RUN. A PostgreSQL baseline exists, but applying it and
   confirming Supabase schema state require the target connection.
- Cutover is blocked. No target preservation or parity result is claimed.

### Security fixes

- Generation retry authentication: PASS in focused tests. The existing route
   authenticates, requires active membership, scopes the job to the active
   workspace, and rejects viewers/reviewers before retry.
- Organization/Personal asset isolation: PASS in focused tests. Organization
   reads and publish requests are organization-only. Personal asset listing now
   uses valid Prisma `OR` conditions for the personal workspace and legacy null
   ownership; it excludes the user's organization-owned assets.
- Legacy plaintext MuAPI storage removed: FAIL / incomplete across the entire
   repository. The current Next.js studio uses server-scoped ProviderCredential
   resolution without organization-to-personal fallback. The separate Vite/
   Electron client in `src/` still depends on `localStorage['muapi_key']` and
   proxies directly to MuAPI rather than the authenticated Next.js backend.
   Replacing that client connection architecture safely remains required before
   claiming this repository-wide security item is complete. It was not silently
   disabled or rewritten during database preparation.

### Data migration

All target counts are unverified, not zero. No PostgreSQL copy has been run.

| Model | SQLite Rows | PostgreSQL Rows | Status |
| --- | ---: | --- | --- |
| Asset | 76 | Not checked | Blocked |
| User | 9 | Not checked | Blocked |
| OAuthAccount | 2 | Not checked | Blocked |
| EmailVerificationToken | 9 | Not checked | Blocked |
| PasswordResetToken | 1 | Not checked | Blocked |
| RefreshSession | 536 | Not checked | Blocked |
| Organization | 9 | Not checked | Blocked |
| OrganizationMember | 10 | Not checked | Blocked |
| TeamInvitation | 0 | Not checked | Blocked |
| Plan | 4 | Not checked | Blocked |
| BillingAccount | 9 | Not checked | Blocked |
| Subscription | 9 | Not checked | Blocked |
| CreditWallet | 8 | Not checked | Blocked |
| CreditTransaction | 0 | Not checked | Blocked |
| AuditLog | 140 | Not checked | Blocked |
| Project | 40 | Not checked | Blocked |
| Campaign | 20 | Not checked | Blocked |
| GenerationJob | 34 | Not checked | Blocked |
| ProviderAttempt | 30 | Not checked | Blocked |
| VoiceInput | 11 | Not checked | Blocked |
| VoiceVideoJob | 9 | Not checked | Blocked |
| BrandKit | 1 | Not checked | Blocked |
| Template | 141 | Not checked | Blocked |
| Workflow | 0 | Not checked | Blocked |
| WorkflowRun | 0 | Not checked | Blocked |
| IntegrationConnection | 0 | Not checked | Blocked |
| SocialConnection | 42 | Not checked | Blocked |
| SocialDestination | 10 | Not checked | Blocked |
| ProviderCredential | 3 | Not checked | Blocked |
| PublishJob | 5 | Not checked | Blocked |
| ApiKey | 0 | Not checked | Blocked |
| Notification | 0 | Not checked | Blocked |

### Preservation prerequisites

- AUTH: source users, IDs, password hashes, refresh sessions, and two Google
   OAuth records remain untouched. Authentication against PostgreSQL is not run.
- WORKSPACES: eight Personal and one Organization workspace, ten memberships;
   source IDs remain untouched. Target preservation is not run.
- RAZORPAY: four Plan records and nine Subscriptions remain untouched, including
   workspace IDs, provider subscription IDs, and cancellation fields.
   Remote subscriptions recreated: NO. No Razorpay API was called.
- PROVIDER CREDENTIALS: three source records. Existing-key controlled
   decryptability test: PASS. Snapshot logical records match Prisma exactly.
   Target ciphertext preservation/decryptability: NOT RUN.
- SOCIAL: 18 Meta, 14 LinkedIn, and 10 YouTube connections; ten destinations.
   Existing ciphertext, including refresh tokens when present, remains unchanged.
   No OAuth reconnect or token refresh was triggered. Target checks: NOT RUN.
- CONTENT: Projects, Campaigns, Assets, GenerationJobs, BrandKits, Templates,
   and Workflows remain unchanged. All 32 read-only model snapshots match Prisma
   logical-record hashes. PostgreSQL row-count/ID/hash parity: NOT RUN.

### Storage

Binary files migrated: NO. Database URL fields remain unchanged. Inventory:

| Directory | Files | Bytes |
| --- | ---: | ---: |
| uploads/ | 129 | 164,528,859 |
| .data/project-assets/ | 26 | 41,688,681 |
| .data/voice-inputs/ | 11 | 1,702,724 |

These inventories cover the requested local storage roots, not every remote
provider URL or externally stored binary. References and generated/TTS media
need a separate Phase 2 path/URL reconciliation before any file migration.

### Validation and unresolved issues

- Read-only source/backup integrity: PASS.
- Source snapshot/Prisma logical-record parity: PASS for all 32 models.
- SQLite and PostgreSQL Prisma validation: PASS.
- Tests: PASS, 129/129.
- Lint: PASS, with existing image and React-hook warnings.
- Production build: PASS, with existing warnings.
- Final source and backup checksum recheck: PASS; both remain byte-identical.
- Standalone typecheck: NOT AVAILABLE; `npm run typecheck` has no configured
   script. Build-time framework validation is a separate check.
- Supabase schema creation, copy, target parity, and staging application tests:
   BLOCKED by missing target configuration; do not cut over.
- Historical loose-reference warnings, left unchanged: Campaign organization
   (6), project (2), creator (6); Asset user (7), organization (7), campaign (4);
   GenerationJob organization (3), user (3). These fields have no declared
   Prisma foreign keys, so they are reported rather than silently cleaned or
   excluded from the copy. They require explicit review before cutover.
- Legacy standalone MuAPI plaintext dependency remains as described above.
- APPLICATION DATABASE SWITCHED: NO.
- RLS ENABLED: NO.
- SUPABASE AUTH IMPLEMENTED: NO.
- SUPABASE STORAGE IMPLEMENTED: NO.
- No commit or push was performed. Rollback instructions are above.

### Files modified in this follow-up

- `lib/assetWorkspaceScope.js`
- `scripts/phase1-sqlite-snapshot.mjs` (new)
- `scripts/audit-sqlite-integrity.mjs`
- `scripts/phase1-models.mjs`
- `scripts/migrate-sqlite-to-postgres.mjs`
- `scripts/validate-phase1-migration.mjs`
- `tests/assetWorkspaceScope.test.js`
- `tests/phase1Migration.test.js` (new)
- `docs/phase1-supabase-migration.md`
