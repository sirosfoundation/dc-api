/**
 * Extracts and normalizes the OpenID4VP response payload a wallet returns
 * via the Digital Credentials API, per OpenID4VP 1.0 Appendix A (the DC API
 * response modes).
 *
 * A verifier declares one of two response modes in its authorization
 * request, and the wallet's DC API response shape follows accordingly:
 *   - `dc_api`: the wallet returns `{ vp_token: {...} }` directly - the VP
 *     token(s), keyed by DCQL credential query id, in the clear.
 *   - `dc_api.jwt`: the wallet returns `{ response: "<jwe>" }` - the same
 *     vp_token payload, but JWE-encrypted to the verifier's own ephemeral
 *     key (advertised in the request's `client_metadata.jwks`) so it's
 *     never visible to the browser/OS layer in between.
 *
 * Backend-agnostic like the rest of this library: it only recognizes the
 * response shape and hands back structured data - what a verifier does with
 * it (decrypt the JWE, submit it to their own backend, validate it
 * in-browser) is entirely up to the caller.
 */

import type { DigitalCredentialResponse } from './request.js';
import {
	requestCredentialFromAuthorizationRequestURI,
	type AuthorizationRequestOptions,
} from './authorization-request.js';

/**
 * Normalized OpenID4VP response extracted from a DC API result. Exactly one
 * of `vpToken`/`jwe` is populated, matching `responseMode`.
 */
export type OID4VPDCAPIResponse =
	| { responseMode: 'dc_api'; vpToken: Record<string, unknown> }
	| { responseMode: 'dc_api.jwt'; jwe: string };

/**
 * Extract and normalize the OpenID4VP response payload from a DC API
 * result's `.data`. Works the same for both the native DC API and this
 * library's popup-based polyfill (see polyfill.ts) - both ultimately
 * resolve to the same `{ protocol, data }` shape (see
 * [DigitalCredentialResponse]), so the wallet's actual OpenID4VP payload
 * lives in the same place either way.
 *
 * @throws Error if `data` matches neither known response shape - this
 *   indicates either a non-OpenID4VP protocol response, or a wallet/verifier
 *   bug (e.g. the historical bug where a bare, unwrapped inner response was
 *   returned instead of the DC API's own `{protocol, data}` envelope).
 */
export function extractOID4VPResponse(result: DigitalCredentialResponse): OID4VPDCAPIResponse {
	const data = result.data as Record<string, unknown> | undefined;

	if (data && typeof data.response === 'string') {
		return { responseMode: 'dc_api.jwt', jwe: data.response };
	}
	if (data && typeof data.vp_token === 'object' && data.vp_token !== null) {
		return { responseMode: 'dc_api', vpToken: data.vp_token as Record<string, unknown> };
	}

	throw new Error(
		'Unrecognized DC API response shape: expected { response: "<jwe>" } (dc_api.jwt response ' +
			'mode) or { vp_token: {...} } (dc_api response mode) per OpenID4VP 1.0 Appendix A',
	);
}

/**
 * High-level convenience combining [requestCredentialFromAuthorizationRequestURI]
 * and [extractOID4VPResponse]: resolve a standard OpenID4VP authorization
 * request URI into whatever the detected protocol needs, invoke the native
 * DC API, and normalize the wallet's response - the full request→response
 * round trip any OpenID4VP-over-DC-API verifier needs, in one call.
 *
 * @returns null if no supported protocol was found (caller should fall back
 *   to QR/redirect), otherwise the normalized OpenID4VP response. What to do
 *   with that response (decrypt/submit/validate) is caller-specific - this
 *   library stops at "here is the wallet's OpenID4VP payload."
 */
export async function requestOID4VPPresentation(
	authorizationRequestUri: string,
	options?: AuthorizationRequestOptions,
): Promise<OID4VPDCAPIResponse | null> {
	const result = await requestCredentialFromAuthorizationRequestURI(authorizationRequestUri, options);
	if (!result) return null;
	return extractOID4VPResponse(result);
}
