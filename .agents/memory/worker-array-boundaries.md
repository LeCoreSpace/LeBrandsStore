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

When passing already serialized JSON through postgres.js, bind it as
`::text::jsonb`, not directly `::jsonb`. Direct inference selects the driver's
JSON serializer and encodes the string a second time.

**Why:** Ann progress failed with SQLSTATE 23514 even with the correct schema:
the database received a JSON string where its constraint required an object.
A read-only check with the installed driver reproduced this on both first and
repeated prepared queries. Raw-parameter PGlite adapters hid the difference.

**How to apply:** Keep native driver JSON helpers for native objects, or use
an explicit text boundary for pre-serialized JSON. Persistence regression tests
must exercise driver-equivalent parameter serialization, not just SQL casts.
