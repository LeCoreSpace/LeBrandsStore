---
name: Migration test foundations
description: Validate migrations against real foundational DDL, not invented base-table fixtures
---

Offline migration tests must use the project's real foundational schema
wherever available rather than hand-written substitutes for existing tables.

**Why:** A simplified test schema can repeat the migration author's mistaken
assumption, allowing a migration to pass offline and then fail against the
real database. Passing permission tests alone does not prove compatibility.

**How to apply:** Load authoritative base migrations into the isolated test
database before testing new foreign keys and functions. Keep unrelated
stubs explicit and do not treat them as verification of the production
schema. Do not run migrations against the user's database to test a fix.

For authenticated journeys, establish a complete valid synthetic credential
record and exercise persisted session creation with a cheap HTTP check before
launching browser coverage.

**Why:** A successful injected password-verification callback alone does not
prove that database credential and session prerequisites are satisfied.

**How to apply:** Keep authentication fixtures consistent with real persistence
contracts, not just renderer or verifier stubs; do not weaken constraints to
make the fixture pass.

For financial reporting, verify persisted records at the application boundary,
not only totals calculated from hand-built financial fixtures.

**Why:** Schema and permission checks can pass while an adapter mismatch leaves
the intended transactions absent or in the wrong period. Checkout rate limits
and uniqueness failures are reasons to inspect the fixture, not relax guards.

**How to apply:** Exercise the actual checkout/cost-capture transaction in an
isolated database and independently establish record identity and period
membership before relying on those records to prove financial aggregates.
