/**
 * Native DC API credential issuance.
 *
 * Calls navigator.credentials.create() with the DC API options:
 *   { digital: { requests: [{ protocol, data }] } }
 *
 * This is the create() counterpart of request.ts's get(): the same options
 * shape, the same normalized { protocol, data } result, and the same error
 * classification (errors.ts applies unchanged — issuance failures surface as
 * the same DOMException names).
 *
 * This module is backend-agnostic — it only handles the browser API call and
 * response normalization. Fallback transports (a QR code carrying the same
 * credential offer, a deep link, a redirect) are the consumer's
 * responsibility, exactly as on the presentation side.
 */

import type { OID4VCIProtocol } from './protocols.js';
import {
	normalizeCredential,
	type DigitalCredentialResponse,
	type RequestCredentialOptions,
} from './request.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Options for issueCredential().
 *
 * Structurally identical to RequestCredentialOptions today; declared
 * separately so the issuance surface can gain options (which the get() side
 * has no use for) without widening the presentation surface.
 */
export interface IssueCredentialOptions extends RequestCredentialOptions {}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Issue a credential into a wallet via the native DC API.
 *
 * @param protocol  The issuance protocol identifier (e.g. "openid4vci-v1")
 * @param data      The request data object. For "openid4vci-v1" this is the
 *                  OpenID4VCI Credential Offer object itself — its parameters
 *                  flat, NOT wrapped in a `credential_offer` member. Use
 *                  buildIssuanceRequestData() to derive it from an
 *                  `openid-credential-offer://` URI.
 * @param options   Optional AbortSignal for cancellation.
 * @returns A normalized { protocol, data } response.
 * @throws DOMException with name "NotAllowedError" if the user cancels, or if
 *         no wallet accepted the offer
 * @throws DOMException with name "NotSupportedError" if the protocol is
 *         unsupported
 *
 * @example
 * ```ts
 * const result = await issueCredential(OID4VCI_PROTOCOLS.V1, {
 *   credential_issuer: "https://issuer.example",
 *   credential_configuration_ids: ["org.iso.18013.5.1.mDL"],
 *   grants: {
 *     "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
 *       "pre-authorized_code": "abc123",
 *     },
 *   },
 * });
 * ```
 */
export async function issueCredential(
	protocol: OID4VCIProtocol | string,
	data: object,
	options?: IssueCredentialOptions,
): Promise<DigitalCredentialResponse> {
	const dcOptions: CredentialCreationOptions & {
		digital: { requests: Array<{ protocol: string; data: object }> };
	} = {
		digital: {
			requests: [{
				protocol,
				data,
			}],
		},
	};

	if (options?.signal) {
		dcOptions.signal = options.signal;
	}

	const credential = await navigator.credentials.create(dcOptions);

	if (!credential) {
		throw new DOMException('No credential issued', 'NotAllowedError');
	}

	return normalizeCredential(credential, protocol);
}
