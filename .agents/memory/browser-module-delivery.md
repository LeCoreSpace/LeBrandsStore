---
name: Browser module delivery
description: Prevent blank application panels caused by blocked transitive browser modules
---
Check transitive browser module delivery through the actual Worker asset gate, not just filesystem existence or successful server-side imports.

**Why:** An uploaded shared product-details helper was blocked by the explicit public asset gate. Its 404 prevented Ann's module graph from starting, leaving the conversation and preview blank even though the database and entry script were available.

**How to apply:** Every new browser dependency must be publicly registered and served as JavaScript on the account host. Use the module-delivery regression test and confirm the live asset after publishing; a missing browser module is not a reason to rerun migrations.
