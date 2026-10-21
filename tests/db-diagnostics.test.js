import test from "node:test";
import assert from "node:assert/strict";
import { databaseConnectionReason, databaseConnectionSignals } from "../src/db-diagnostics.js";

test("database connection diagnostics classify provider failures without echoing sensitive values", () => {
  const cases = [
    ["daily query limit exceeded", "CONNECTOR_QUERY_LIMIT"],
    ["password authentication failed", "ORIGIN_AUTHENTICATION_FAILED"],
    ["Server connection attempt failed: connection_refused", "ORIGIN_CONNECTION_REFUSED"],
    ["TLS certificate verification failed", "ORIGIN_TLS_FAILED"],
    ["connection timed out", "ORIGIN_CONNECTION_TIMEOUT"],
    ["prepared statement does not exist", "PREPARED_STATEMENT_ERROR"],
    ["unsupported startup parameter", "UNSUPPORTED_STARTUP_PARAMETER"],
    ["Hyperdrive configuration not found", "CONNECTOR_NOT_FOUND"],
    ["Failed to acquire a connection from the pool.", "CONNECTION_POOL_UNAVAILABLE"],
    ["Internal error.", "CONNECTOR_INTERNAL_ERROR"],
  ];
  for (const [message, expected] of cases) {
    const sensitive = "fake-password-and-private-session-value";
    assert.equal(databaseConnectionReason({ code: "58000", message: `${message}: ${sensitive}` }), expected);
    assert.ok(!databaseConnectionReason({ code: "58000", message: `${message}: ${sensitive}` }).includes(sensitive));
  }
});

test("connection signals expose only fixed diagnostic vocabulary, never arbitrary message words", () => {
  assert.deepEqual(databaseConnectionSignals({code:"58000",message:"Hyperdrive QUERY limit exceeded; Privateperson Supersecretpassword123 user@example.test"}), ["hyperdrive","query","limit","exceeded","user"]);
  assert.equal(databaseConnectionSignals({code:"42501",message:"private query"}), undefined);
  assert.equal(databaseConnectionSignals({code:"58000"}), undefined);
});

test("unknown and non-connector errors never expose raw messages", () => {
  assert.equal(databaseConnectionReason({ code: "58000", message: "private value" }), "CONNECTOR_UNCLASSIFIED_ERROR");
  assert.equal(databaseConnectionReason({ code: "58000" }), "CONNECTOR_UNCLASSIFIED_ERROR");
  assert.equal(databaseConnectionReason({ code: "42501", message: "private value" }), undefined);
  assert.equal(databaseConnectionReason(null), undefined);
});
