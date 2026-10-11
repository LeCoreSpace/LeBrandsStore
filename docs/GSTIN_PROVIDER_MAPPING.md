# GSTIN public-search response mapping

Implemented in `src/gstin/provider.js`. The supplied real fixture remains
unchanged. Tests use fictional fixtures for active, cancelled, Composition,
not-found and malformed responses; they never print the real taxpayer details.

## Contract

Only HTTP **200** and top-level boolean `flag: true` can produce a normalized
result. `flag: false` fails verification. HTTP 404 is not-found, 429 is
rate-limited, and all other non-200 responses are provider errors.
Invalid JSON, incorrect types, invalid GSTIN/checksum, mismatched requested
GSTIN, impossible dates, invalid PIN or mismatched registered state fail closed.
Provider error text and raw responses are not included in exceptions.

| Normalized field | Observed provider field |
| --- | --- |
| `gstin` | `data.gstin` |
| `legal_name` | `data.lgnm` |
| `trade_name` | `data.tradeNam` |
| `status` | `data.sts` |
| `taxpayer_type` | `data.dty` |
| `constitution` | `data.ctb` |
| `registration_date` | `data.rgdt` |
| `cancellation_date` | `data.cxdt` |
| `nature_of_business` | `data.nba` |
| `principal_address.line1` | Nonempty `data.pradr.addr.bno`, `bnm`, `flno`, joined with commas |
| `principal_address.line2` | Nonempty `data.pradr.addr.st` (street/local address component) and `loc`, joined with commas |
| `principal_address.city` | `data.pradr.addr.city`, including the observed empty string |
| `principal_address.district` | `data.pradr.addr.dst` |
| `principal_address.state` | `data.pradr.addr.stcd` (state name, not a numeric code) |
| `principal_address.state_code` | Resolve the supplied state name through the existing Indian state list, then match it against the GSTIN prefix |
| `principal_address.pin` | `data.pradr.addr.pncd` |
| `additional_addresses` | `data.adadr` is empty in the supplied fixture |

Dates retain their provider `DD/MM/YYYY` format. The empty cancellation date
stays empty. The mapper does not substitute locality or district for a blank
city, treat `stcd` as a two-digit GST code, or invent absent address fields.

The actual additional-address item structure has not been supplied. Nonempty
`adadr` therefore returns `UNSUPPORTED_ADDRESS_SCHEMA`, rather than silently
discarding addresses or accepting a guessed schema.

Cancelled and Composition responses are mapped faithfully, not rewritten to
Active or Regular. A normalized response is **not** an authorization to publish
or issue invoices.

## Not yet connected

The response mapper and `Response` parser are offline building blocks only.
The provider's request URL, HTTP method and authentication/request format
remain unspecified. No paid calls, guessed endpoint, transport integration,
wizard/Settings integration, verification persistence, quotas, cache, retries
or invoice verification gate are added by this change.
Existing schema, grants, policies, Wrangler configs and migrations are unchanged.
Do not run migrations or deploy automatically.
