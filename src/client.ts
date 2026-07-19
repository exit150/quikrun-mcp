// Thin QuikRun REST API client. One place for base URL, auth, and error shape.
// Uses Node 20+ global fetch — no third-party HTTP deps.

const DEFAULT_BASE_URL = "https://api.quik.run";

/** Error carrying the HTTP status + response body so tools can surface it verbatim. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Trim trailing slash so we can always join `${base}${path}` cleanly. */
function baseUrl(): string {
  return (process.env.QUIKRUN_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/** Resolve the bearer token, or throw a friendly setup error if it's missing. */
function token(): string {
  const t = process.env.QUIKRUN_TOKEN;
  if (!t) {
    throw new ApiError(
      "QUIKRUN_TOKEN is not set. Mint a token at https://quik.run (dashboard → Tokens) " +
        "and set QUIKRUN_TOKEN in your MCP client config.",
    );
  }
  return t;
}

/**
 * Perform an authenticated JSON request against the QuikRun API.
 * Returns the parsed JSON body typed as `T`; throws `ApiError` on missing
 * token or any non-2xx response (with the status + body text attached).
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    const body = text.trim() || "(empty response body)";
    throw new ApiError(`${res.status} ${res.statusText}: ${body}`, res.status);
  }

  // Some endpoints (e.g. DELETE) may return an empty body on success.
  return (text ? JSON.parse(text) : {}) as T;
}
