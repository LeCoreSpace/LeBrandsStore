// Never log Postgres detail, context/where, query, parameters, stack or raw
// messages: any of those can include submitted values or session tokens.
const SETTING_FIELDS = new Set([
  "brand_name", "subdomain", "logo_media_id", "tagline", "description",
  "legal_name", "address", "support_email", "support_phone", "gstin", "category",
  "theme", "accent_color", "font_preset", "button_style",
]);
export function setupFieldNames(body) {
  const names = [];
  if (body?.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
    for (const key of Object.keys(body.settings)) names.push(SETTING_FIELDS.has(key) ? key : "[unknown setting]");
  }
  if (body?.progress && typeof body.progress === "object" && !Array.isArray(body.progress)) {
    for (const key of Object.keys(body.progress)) names.push(["step", "completed"].includes(key) ? `progress.${key}` : "[unknown progress field]");
  }
  if (body && typeof body === "object") {
    if (Object.keys(body).some((key) => !["settings", "progress"].includes(key))) names.push("[unknown request field]");
  }
  return [...new Set(names)].sort();
}
const name = (value) => typeof value === "string" && /^[a-zA-Z_][a-zA-Z0-9_.]{0,95}$/.test(value) ? value : null;
const MESSAGES = {
  "23502": "A required database column received null.",
  "23503": "A foreign key constraint rejected the reference.",
  "23505": "A unique constraint rejected a duplicate.",
  "23514": "A database check constraint rejected the row.",
  "42501": "Database permission denied or row-level security rejected the operation.",
  "42P01": "A required database relation does not exist.",
  "42703": "A required database column does not exist.",
  "42883": "A required database function or operator does not exist.",
  "22P02": "Invalid input syntax for the database type.",
  "22001": "A value exceeds the database column length.",
  "22003": "A numeric value is outside the database type range.",
};
export function storeFailureDetails(error, request, fieldNames = []) {
  const sqlstate = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? error.code : null;
  const knownCodes = ["INVALID_DATABASE_ROLE", "MISSING_HYPERDRIVE_BINDING", "UNDEFINED_VALUE"];
  // SQLSTATE-normalized error messages are deliberately value-free. In
  // particular, Postgres messages for invalid casts include the offending value.
  let message = sqlstate ? MESSAGES[sqlstate] ?? "Database operation failed; raw message redacted." :
    error?.status ? "Request rejected; see field errors in the response." : "Unexpected store service failure; raw message redacted.";
  if (!sqlstate && error?.name === "TypeError") message = /filter is not a function/.test(error.message ?? "") ?
    "Expected an array but received a value without an array filter method." : "Unexpected value type while processing a store request.";
  const functionMatch = (typeof error?.where === "string" ?
    error.where.match(/^PL\/pgSQL function ([a-zA-Z_][a-zA-Z0-9_.]*)\(/) ??
      error.where.match(/^SQL function "([a-zA-Z_][a-zA-Z0-9_.]*)"/) : null) ??
    (sqlstate === "42883" && typeof error?.message === "string" ?
      error.message.match(/^function ([a-zA-Z_][a-zA-Z0-9_.]*)\(/) : null) ??
    (sqlstate === "42501" && typeof error?.message === "string" ?
      error.message.match(/^permission denied for function ([a-zA-Z_][a-zA-Z0-9_.]*)$/) : null);
  return {
    code: sqlstate ?? (knownCodes.includes(error?.code) ? error.code : error?.status ? "REQUEST_REJECTED" : "STORE_SERVICE_ERROR"),
    sqlstate, constraint: name(error?.constraint_name), table: name(error?.table_name),
    column: name(error?.column_name), function: name(functionMatch?.[1]), routine: name(error?.routine),
    message, method: request.method, fields: fieldNames,
  };
}
