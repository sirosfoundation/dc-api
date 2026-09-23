/**
 * Bridges a standard OpenID4VCI credential offer - the same
 * `openid-credential-offer://?credential_offer=...` URI an issuer already
 * emits for QR codes and deep links - into the request `data` a native DC
 * API `openid4vci-v1` issuance call carries.
 *
 * This is the issuance-side twin of authorization-request.ts: an issuer only
 * ever needs to produce ONE credential offer (the one it already renders as a
 * QR code), and this module adapts it for `navigator.credentials.create()`
 * rather than requiring every issuer page to hand-roll the payload.
 *
 * Per OpenID4VCI 1.0 §4.1 an offer travels either by value
 * (`credential_offer=<url-encoded JSON>`) or by reference
 * (`credential_offer_uri=<url>`, whose JSON response body IS the offer). Both
 * forms are accepted here, along with a bare query string and an
 * already-parsed offer object.
 *
 * Wire shape: for `openid4vci-v1` the DC API request `data` is the Credential
 * Offer object itself - its parameters flat, NOT wrapped in a
 * `credential_offer` member.
 */

import { isIssuanceAvailable } from './detect.js';
import { issueCredential, type IssueCredentialOptions } from './issue.js';
import { OID4VCI_PROTOCOLS, type OID4VCIProtocol } from './protocols.js';
import type { DigitalCredentialResponse } from './request.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CredentialOfferOptions extends IssueCredentialOptions {
	/**
	 * Issuance protocol to request. Defaults to "openid4vci-v1".
	 */
	protocol?: OID4VCIProtocol | string;
	/** Override fetch (e.g. for testing, or a non-global fetch). */
	fetchFn?: typeof fetch;
}

/**
 * A credential offer in any of the forms this module accepts:
 * an `openid-credential-offer://` URI, a bare query string, or an
 * already-parsed offer object.
 *
 * Deliberately `object` rather than `Record<string, unknown>`: a caller's own
 * `interface CredentialOffer { credential_issuer: string; ... }` does not
 * satisfy a string index signature without a cast, and there is no reason to
 * make callers cast a well-typed offer. The shape is narrowed at runtime by
 * _assertOffer instead.
 */
export type CredentialOffer = string | object;

// ─── Offer parsing ───────────────────────────────────────────────────────────

/**
 * Extract the query parameters of an offer URI.
 *
 * Deliberately string-based rather than `new URL()`: a credential offer URI
 * is customarily `openid-credential-offer://?credential_offer=...` - a scheme
 * with an empty authority - and round-tripping that through a URL parser is a
 * known way to lose the `//` and mangle the URI.
 */
function _offerParams(offer: string): URLSearchParams {
	const q = offer.indexOf('?');
	return new URLSearchParams(q >= 0 ? offer.slice(q + 1) : offer);
}

function _parseOfferJson(json: string): unknown {
	try {
		return JSON.parse(json);
	} catch (err) {
		throw new TypeError(`Malformed credential offer: 'credential_offer' is not valid JSON (${String(err)})`);
	}
}

/**
 * Reject anything that is not recognisably an OpenID4VCI Credential Offer.
 *
 * `credential_issuer` and `credential_configuration_ids` are both REQUIRED by
 * OpenID4VCI 1.0 §4.1.1, and the latter is a non-empty array of strings naming
 * the configurations on offer; without them there is nothing a wallet could
 * act on, and handing the browser a malformed payload turns a clear error here
 * into an opaque one from the platform.
 */
function _assertOffer(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError('Malformed credential offer: expected a JSON object');
	}
	const offer = value as Record<string, unknown>;
	if (typeof offer.credential_issuer !== 'string' || offer.credential_issuer === '') {
		throw new TypeError("Malformed credential offer: missing required 'credential_issuer'");
	}
	if (!Array.isArray(offer.credential_configuration_ids)) {
		throw new TypeError("Malformed credential offer: missing required 'credential_configuration_ids'");
	}
	if (
		offer.credential_configuration_ids.length === 0 ||
		!offer.credential_configuration_ids.every((id) => typeof id === 'string' && id !== '')
	) {
		throw new TypeError(
			"Malformed credential offer: 'credential_configuration_ids' must be a non-empty array of " +
			'non-empty strings',
		);
	}
	return offer;
}

async function _fetchOffer(offerUri: string, fetchImpl: typeof fetch): Promise<unknown> {
	const res = await fetchImpl(offerUri);
	if (!res.ok) {
		throw new Error(`Failed to fetch credential_offer_uri ${offerUri}: HTTP ${res.status}`);
	}
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new TypeError(
			`Malformed credential offer at ${offerUri}: response body is not valid JSON (${String(err)})`,
		);
	}
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build the DC API `data` object for an `openid4vci-v1` issuance request from
 * a credential offer.
 *
 * Accepts, in this order:
 *   - an already-parsed offer object - returned as-is after validation;
 *   - `openid-credential-offer://?credential_offer=<url-encoded JSON>` (by
 *     value), or any other scheme carrying the same query parameter;
 *   - the same URI with `credential_offer_uri=<url>` (by reference) - that
 *     URL is fetched and its JSON body is the offer, per OpenID4VCI 1.0
 *     §4.1.3;
 *   - a bare query string with no scheme or `?`.
 *
 * A raw JSON *string* is deliberately refused rather than guessed at: pass
 * the parsed object instead. The offer is validated before it is handed to
 * the browser - see _assertOffer.
 *
 * @throws TypeError for a malformed offer, or an offer string that is neither
 *         form
 * @throws Error when a `credential_offer_uri` fetch fails
 *
 * @example
 * ```ts
 * const data = await buildIssuanceRequestData(
 *   "openid-credential-offer://?credential_offer=" +
 *     encodeURIComponent(JSON.stringify(offer)),
 * );
 * await issueCredential(OID4VCI_PROTOCOLS.V1, data);
 * ```
 */
export async function buildIssuanceRequestData(
	offer: CredentialOffer,
	options?: { fetchFn?: typeof fetch },
): Promise<Record<string, unknown>> {
	if (typeof offer === 'object' && offer !== null) {
		return _assertOffer(offer);
	}
	if (typeof offer !== 'string') {
		throw new TypeError(`Cannot build an issuance request from a ${typeof offer}`);
	}

	const trimmed = offer.trim();
	if (trimmed.startsWith('{')) {
		throw new TypeError(
			'Cannot build an issuance request from a raw JSON string: pass the parsed offer object, ' +
			"or an 'openid-credential-offer://?credential_offer=...' URI",
		);
	}

	const params = _offerParams(trimmed);

	const byValue = params.get('credential_offer');
	if (byValue) {
		return _assertOffer(_parseOfferJson(byValue));
	}

	const byReference = params.get('credential_offer_uri');
	if (byReference) {
		const fetchImpl = options?.fetchFn ?? fetch;
		return _assertOffer(await _fetchOffer(byReference, fetchImpl));
	}

	throw new TypeError(
		"Cannot build an issuance request: offer has neither 'credential_offer' nor 'credential_offer_uri'",
	);
}

/**
 * High-level convenience: check that issuance can actually be fulfilled,
 * unwrap the credential offer, and invoke the native DC API - the issuance
 * twin of requestCredentialFromAuthorizationRequestURI().
 *
 * Availability is checked BEFORE a `credential_offer_uri` is dereferenced, so
 * a page with no DC API support never makes the fetch.
 *
 * @returns null if issuance cannot be fulfilled on this page (the caller
 *   should fall back to a QR code or a direct web-wallet link), otherwise the
 *   DC API response.
 *
 * @example
 * ```ts
 * const result = await issueCredentialFromOffer(offerUri);
 * if (!result) {
 *   showCredentialOfferQRCode(offerUri);
 * }
 * ```
 */
export async function issueCredentialFromOffer(
	offer: CredentialOffer,
	options?: CredentialOfferOptions,
): Promise<DigitalCredentialResponse | null> {
	const protocol = options?.protocol ?? OID4VCI_PROTOCOLS.V1;
	if (!isIssuanceAvailable(protocol)) return null;

	const data = await buildIssuanceRequestData(offer, { fetchFn: options?.fetchFn });
	return issueCredential(protocol, data, options);
}
