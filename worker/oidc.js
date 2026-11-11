// Proves a request comes from this repository's "Send Lab Note" workflow on main: a GitHub Actions OIDC token,
// checked against GitHub's published keys. No shared secret to leak or rotate. Same approach as Hello Little Human.
const ISSUER = "https://token.actions.githubusercontent.com";
export const AUDIENCE = "andrewedmond";
export const REPOSITORY = "nerolabs/andrewedmond.com";
export const WORKFLOW = `${REPOSITORY}/.github/workflows/send-note.yml@refs/heads/main`;
// The job that mails every subscriber runs in this environment, which waits for Andrew's approval in GitHub.
export const SEND_ENVIRONMENT = "lab-notes-email";

let jwksCache = null; // { at, keys }

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function keys(force = false) {
  if (!force && jwksCache && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(`${ISSUER}/.well-known/jwks`);
  if (!res.ok) throw new Error(`jwks ${res.status}`);
  jwksCache = { at: Date.now(), keys: (await res.json()).keys };
  return jwksCache.keys;
}

// Returns the token's claims, or null if anything about it is wrong.
export async function verifyGithub(authHeader, now = Date.now()) {
  const m = /^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(authHeader || "");
  if (!m) return null;
  try {
    const header = json(m[1]);
    const claims = json(m[2]);
    if (header.alg !== "RS256" || !header.kid) return null;
    let jwk = (await keys()).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(true)).find((k) => k.kid === header.kid); // GitHub rotated its keys
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`));
    if (!ok) return null;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const sec = now / 1000;
    if (claims.iss !== ISSUER || !aud.includes(AUDIENCE) || claims.repository !== REPOSITORY) return null;
    if (claims.workflow_ref !== WORKFLOW || claims.ref !== "refs/heads/main") return null;
    if (!(claims.exp > sec) || (claims.nbf && claims.nbf > sec + 60)) return null;
    return claims;
  } catch {
    return null;
  }
}
