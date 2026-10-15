# Ann and Standard Builder: Stage 1

Stage 1 adds an authenticated builder chooser at `/stores/:storeId/build`.
New-store creation redirects to this chooser. Existing stores still open their
dashboard normally. Dashboard navigation exposes Build your store, Standard
Builder and the existing Aura editor.

Standard Builder posts `mode=standard`, merges only `builder_mode` into the
existing store setup JSON and redirects to the unchanged four-step `/setup`
route. Wizard progress, catalogue, policies, page layouts and publications
are not reset or replaced. GET and HEAD do not save preferences.

Ann is visibly disabled while its guided workflow is being implemented.
`ANN_WORKFLOW_READY` is false; an environment flag cannot bypass that readiness
gate. Its reserved route returns to the chooser, never to the former AI
interface. There is no Ann generation, palette selection or conversation
implementation in Stage 1.

The old AI start API rejects new builds with HTTP 410 after checking store
permissions. Existing job records, recovery functions, drafts, media and usage
history remain intact. No jobs or completed drafts are deleted.

Only store owners/admins can save a builder preference. Requests must have a
valid account-site origin and an authorized tenant session. Preference writes
use the existing forced-RLS table; there are no new tables or migrations.

## Release

Run the offline checks, then deploy the Worker:

    pnpm run test:offline && pnpm run deploy

Do not run a migration for Stage 1. The user performs deployment.

## Following stages

Professional whole-store styles and instant previews; cleaned attribute
reference data and Ann session progress; interactive conversation UI; real
product and selling configuration; bounded copy personalisation; full
publication and compatibility verification.
