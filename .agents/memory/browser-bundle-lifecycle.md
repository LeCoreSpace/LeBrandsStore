---
name: Browser bundle lifecycle
description: Safe versioned browser assets, cross-deployment editing sessions, and Wrangler build working directories.
---
Keep versioned browser dependencies statically loaded unless cross-deployment retention of old chunks is guaranteed. Cache only public fingerprinted assets immutably, never private HTML or merchant drafts.

**Why:** An editor left open across a deployment can retain unsaved changes. A later dynamic import of a removed old chunk would fail and force a potentially destructive refresh.

**How to apply:** Preserve the static dependency graph check when changing browser compilation. Do not introduce lazy hashed imports merely to reduce initial bytes without addressing retention first. Preview intentionally overrides responses to no-store; verify production cache policy against the production Worker rather than treating preview's development headers as a cache regression.

Wrangler custom build commands use the invoking process's working directory, not automatically the configuration file's directory.

**Why:** The managed API workflow invokes Wrangler from its artifact directory while its configuration and browser build script live at the repository root. Assuming configuration-relative execution caused the preview workflow to fail.

**How to apply:** Keep explicit working-directory handling when changing custom builds or managed artifact commands. Resolve internal script paths from import.meta.url.

Validate fingerprinted output contents and dependency graphs rather than assuming identical source always produces identical output names across separate compiler runs.

**Why:** Equivalent builds produced different fingerprints in this workspace. Cache correctness depends on compiled output versioning, not a source-level determinism promise.

**How to apply:** Check allowed output names, valid dependency delivery, entry coverage, and retention of earlier build files instead of asserting identical manifests across recompilations.
