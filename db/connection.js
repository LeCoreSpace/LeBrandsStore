// Pure validation: callers supply SUPABASE_DB_URL. Never consult other secrets.
export function supabaseConnectionOptions(rawUrl) {
  if (!rawUrl) {
    throw new Error("SUPABASE_DB_URL must be set in Replit Secrets. No other database variable is used.");
  }

  let url;
  let username;
  let password;
  let database;
  try {
    url = new URL(rawUrl);
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
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
  if (!username || !database) {
    throw new Error("SUPABASE_DB_URL must include a username and database name; PG* variables are never used.");
  }
  const port = Number(url.port || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SUPABASE_DB_URL must specify a valid PostgreSQL port.");
  }
  const sslmode = url.searchParams.get("sslmode") ?? "require";
  if (!["require", "verify-full", "verify-ca", "disable"].includes(sslmode)) {
    throw new Error("SUPABASE_DB_URL has an unsupported sslmode.");
  }

  // Pass an options object, not a URL. Explicit fields/defaults prevent
  // postgres.js from filling connection settings from PG* environment variables.
  return {
    host: hostname,
    port,
    username,
    password: () => password,
    database,
    ssl: sslmode === "disable" ? false : sslmode,
    sslnegotiation: null,
    max: 1,
    fetch_types: false,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: null,
    max_lifetime: 1800,
    max_pipeline: 100,
    backoff: (retries) => Math.min(3 ** retries / 100, 20),
    keep_alive: 60,
    debug: false,
    publications: "alltables",
    target_session_attrs: "read-write",
    connection: { application_name: "lebrands-db-admin" },
  };
}

export function printConnectionTarget(options) {
  // JSON escapes control characters. Never print a password, database or URL.
  console.info(JSON.stringify({
    username: options.username,
    hostname: options.host,
    port: options.port,
  }));
}