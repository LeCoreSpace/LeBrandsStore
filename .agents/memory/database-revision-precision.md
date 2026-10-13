---
name: Database revision precision
description: Preserve PostgreSQL microseconds in optimistic-concurrency tokens
---

Keep database-generated revision timestamps as exact text when exchanging optimistic-concurrency tokens with JavaScript.

**Why:** PostgreSQL timestamps can contain microseconds; JavaScript Date serialization keeps only milliseconds. A round-trip through Date can therefore make an unchanged row look stale and block an otherwise valid atomic draft save.

**How to apply:** Preserve the database's textual timestamp precision across API/job boundaries. Do not parse and reserialize revision tokens as Date objects before comparing them with the source row.
