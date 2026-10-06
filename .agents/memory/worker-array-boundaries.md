---
name: Worker PostgreSQL array boundaries
description: Why SQL array fields must cross the Worker driver boundary as JSON.
---

Keep PostgreSQL type discovery disabled in the Worker, but never assume native
array columns or parameters have array parsers/serializers. Use explicit JSON
conversion on both reads and writes.

**Why:** With discovery disabled, the installed postgres driver leaves native
array values as strings. Calling array methods then causes generic JavaScript
service errors, not SQLSTATE errors. JSON has built-in driver handlers.

**How to apply:** When adding or changing Worker queries involving native arrays,
check both result decoding and parameter serialization with discovery disabled.
Tests returning JavaScript arrays unconditionally can conceal this mismatch.
