// Pure validation: callers supply SUPABASE_DB_URL. Never consult other secrets.
export function validateSupabaseUrl(rawUrl) {
  if (!rawUrl) {
    throw new Error("SUPABASE_DB_URL must be set in Replit Secrets. No other database variable is used.");
  }

  let url;
  let username;
  try {
    url = new URL(rawUrl);
    username = decodeURIComponent(url.username);
  } catch {
    // URL parser errors can contain the original secret. Never forward them.
    throw new Error("SUPABASE_DB_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("SUPABASE_DB_URL must use postgres:// or postgresql://.");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "supabase.com" && !hostname.endsWith(".supabase.com")) {
    throw new Error("SUPABASE_DB_URL hostname must end with supabase.com. Replit's built-in database is forbidden.");
  }
  if (!username || !url.pathname.slice(1)) {
    throw new Error("SUPABASE_DB_URL must include a username and database name; PG* variables are never used.");
  }
  const port = Number(url.port || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SUPABASE_DB_URL must specify a valid PostgreSQL port.");
  }
  // Metadata is for validation/logging ONLY. Never pass it to postgres().
  return { username, hostname, port };
}

export function clearPgEnvironment(env = process.env) {
  // Delete by name without inspecting or printing any environment values.
  for (const key of Object.keys(env)) {
    if (/^PG/i.test(key)) delete env[key];
  }
}

export function printConnectionTarget(target) {
  // JSON escapes control characters. Never print a password, database or URL.
  console.info(JSON.stringify({
    username: target.username,
    hostname: target.hostname,
    port: target.port,
  }));
}

export function logDatabaseFailure(label, error, rawUrl) {
  const sensitive = [rawUrl];
  try {
    const password = new URL(rawUrl).password;
    if (password) {
      sensitive.push(password);
      try { sensitive.push(decodeURIComponent(password)); } catch { /* Keep encoded redaction. */ }
    }
  } catch { /* Invalid URL errors still need full-input redaction. */ }
  const redact = (value) => {
    let text = String(value);
    for (const secret of sensitive.filter(Boolean).sort((a, b) => b.length - a.length)) {
      text = text.split(secret).join("[REDACTED]");
    }
    return text.replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED URL]")
      .replace(/[\r\n]/g, " ");
  };
  console.error(`${label} (${redact(error?.code ?? "unknown")}): ${redact(error?.message ?? "Unknown failure")}`);
}