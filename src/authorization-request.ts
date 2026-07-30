/**
 * Bridges a standard OpenID4VP redirect-flow authorization request - the same
 * `openid4vp://...?client_id=...&request_uri=...` URI already used for QR
 * codes and deep links - into whatever request `data` shape the browser's
 * native DC API protocol actually needs.
 *
 * This is the actual "shim to whatever the platform supports" promised by
 * this library: a verifier only ever needs to produce ONE authorization
 * request (the one it already builds for QR/redirect), and this module
 * adapts it per protocol rather than requiring every caller to hand-roll a
 * protocol-specific payload (a real bug found in practice: passing the
 * redirect URI itself as the DC API `request` value produces a request no
 * wallet can parse, since neither `openid4vp-v1-signed`'s JWT-only `request`
 * nor `openid4vp-v1-unsigned`'s raw-params shape match a URI string).
 */

import { getBestProtocol } from './detect.js';
import { requestCredential, type DigitalCredentialResponse, type RequestCredentialOptions } from './request.js';
import { OID4VP_PROTOCOLS, type OID4VPProtocol } from './protocols.js';

export interface AuthorizationRequestOptions extends RequestCredentialOptions {
	/** Protocol preference order, passed through to getBestProtocol(). */
	protocolPreference?: readonly string[];
	/** Override fetch (e.g. for testing, or a non-global fetch). */
	fetchFn?: typeof fetch;
}

/**
 * Build the DC API `data` object for `protocol` from a standard OpenID4VP
 * authorization request URI.
 *
 * - SIGNED / MULTISIGNED need `{ request: "<jwt>" }`. If the URI carries
 *   `request` inline, it's used directly; if it carries `request_uri`
 *   instead (the common case - most verifiers only ever produce a JAR
 *   request), that URL is fetched to obtain the JWT. The fetch tolerates
 *   both a raw JWT response body and a JSON-string-wrapped one (`"<jwt>"`),
 *   since verifier implementations vary (sirosfoundation/vc's does the
 *   latter).
 * - UNSIGNED needs the raw OpenID4VP parameters as a plain object. If the
 *   URI only carries `request_uri` (no inline unsigned params were ever
 *   produced), the referenced JWT is fetched and its payload claims are used
 *   directly as the parameter object - unverified, since this is a
 *   same-origin browser call transcribing already-signed content, not a new
 *   trust boundary, and a RequestObject's JSON fields are exactly those
 *   parameters. If the URI has neither `request` nor `request_uri`, its own
 *   query parameters (minus `client_id`, which DC API's unsigned protocol
 *   derives from the origin instead) are used as-is.
 */
export async function buildRequestData(
	protocol: OID4VPProtocol | string,
	authorizationRequestUri: string,
	options?: { fetchFn?: typeof fetch },
): Promise<Record<string, unknown>> {
	const fetchImpl = options?.fetchFn ?? fetch;
	const url = new URL(authorizationRequestUri);
	const params = url.searchParams;

	const inlineRequest = params.get('request');
	const requestUri = params.get('request_uri');

	if (protocol === OID4VP_PROTOCOLS.SIGNED || protocol === OID4VP_PROTOCOLS.MULTISIGNED) {
		const jwt = inlineRequest ?? (requestUri ? await _fetchJwt(requestUri, fetchImpl) : null);
		if (!jwt) {
			throw new Error(
				`Cannot build ${protocol} request data: authorization request has neither 'request' nor 'request_uri'`,
			);
		}
		return { request: jwt };
	}

	// Unsigned: raw OID4VP params.
	if (inlineRequest) {
		// Only a signed request was ever produced, but this browser only
		// supports unsigned - the JWT's own payload IS the parameter object.
		return _decodeJwtPayload(inlineRequest);
	}
	if (requestUri) {
		const jwt = await _fetchJwt(requestUri, fetchImpl);
		return _decodeJwtPayload(jwt);
	}

	const data: Record<string, unknown> = {};
	for (const [key, value] of params.entries()) {
		if (key === 'client_id') continue;
		try {
			data[key] = JSON.parse(value);
		} catch {
			data[key] = value;
		}
	}
	return data;
}

async function _fetchJwt(requestUri: string, fetchImpl: typeof fetch): Promise<string> {
	const res = await fetchImpl(requestUri);
	if (!res.ok) {
		throw new Error(`Failed to fetch request_uri ${requestUri}: HTTP ${res.status}`);
	}
	const text = await res.text();
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed === 'string') return parsed;
	} catch {
		// Not JSON - the body is the raw JWT itself.
	}
	return text;
}

function _decodeJwtPayload(jwt: string): Record<string, unknown> {
	const parts = jwt.split('.');
	if (parts.length < 2) {
		throw new Error('Not a valid JWT: expected at least 2 dot-separated parts');
	}
	let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
	while (base64.length % 4) base64 += '=';
	return JSON.parse(atob(base64));
}

/**
 * High-level convenience: detect the best supported protocol, build the
 * matching request data from a standard authorization request URI, and
 * invoke the native DC API - the full "shim to whatever this platform
 * supports" flow in one call.
 *
 * @returns null if no supported protocol was found (caller should fall back
 *   to QR/redirect), otherwise the DC API response.
 */
export async function requestCredentialFromAuthorizationRequestURI(
	authorizationRequestUri: string,
	options?: AuthorizationRequestOptions,
): Promise<DigitalCredentialResponse | null> {
	const protocol = getBestProtocol(options?.protocolPreference);
	if (!protocol) return null;

	const data = await buildRequestData(protocol, authorizationRequestUri, { fetchFn: options?.fetchFn });
	return requestCredential(protocol, data, options);
}
