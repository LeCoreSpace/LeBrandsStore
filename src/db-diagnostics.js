// Report fixed categories only. Never send provider messages, SQL, credentials
// or request/session values to logs or public responses.
export function databaseConnectionReason(error) {
  if (error?.code !== "58000") return undefined;
  const message = typeof error.message === "string" ? error.message : "";
  const categories = [
    ["CONNECTOR_QUERY_LIMIT", /query.*limit|daily.*limit|quota|free.*limit|usage.*limit/i],
    ["ORIGIN_AUTHENTICATION_FAILED", /authentication failed|wrong password|password.*invalid/i],
    ["ORIGIN_CONNECTION_REFUSED", /connection_refused|econnrefused|connection refused/i],
    ["ORIGIN_TLS_FAILED", /certificate|TLS|SSL/i],
    ["ORIGIN_CONNECTION_TIMEOUT", /connection_timeout|etimedout|connection.*timed out/i],
    ["PREPARED_STATEMENT_ERROR", /prepared statement|COM_STMT_PREPARE/i],
    ["UNSUPPORTED_STARTUP_PARAMETER", /startup parameter|unsupported.*parameter/i],
    ["CONNECTOR_NOT_FOUND", /config(?:uration)?.*(?:not found|does not exist)|no such.*hyperdrive/i],
    ["CONNECTION_POOL_UNAVAILABLE", /failed to acquire.*connection|pool.*exhaust/i],
    ["CONNECTOR_INTERNAL_ERROR", /internal error/i],
  ];
  return categories.find(([, pattern]) => pattern.test(message))?.[0] ?? "CONNECTOR_UNCLASSIFIED_ERROR";
}

const CONNECTION_SIGNALS = new Set([
  "account", "authentication", "binding", "cache", "closed", "config",
  "configuration", "connection", "connections", "daily", "database",
  "denied", "disabled", "enabled", "error", "exceeded", "failed", "failure",
  "free", "handshake", "host", "hyperdrive", "internal", "invalid", "limit",
  "maximum", "missing", "not", "origin", "permission", "pool", "port",
  "prepared", "protocol", "queries", "query", "quota", "rate", "request",
  "requests", "restricted", "role", "server", "session", "ssl", "statement",
  "timeout", "tls", "token", "transaction", "unable", "unexpected",
  "unsupported", "upstream", "usage", "user", "validation", "version",
]);

// Only words in this fixed vocabulary may leave the error object.
export function databaseConnectionSignals(error) {
  if (error?.code !== "58000" || typeof error.message !== "string") return undefined;
  return [...new Set(error.message.toLowerCase().match(/[a-z]+/g) ?? [])]
    .filter(word => CONNECTION_SIGNALS.has(word)).slice(0, 16);
}
