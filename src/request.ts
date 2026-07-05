/**
 * Native DC API credential request.
 *
 * Calls navigator.credentials.get() with the DC API options:
 *   { digital: { requests: [{ protocol, data }] } }
 *
 * This module is backend-agnostic — it only handles the browser API call
 * and response normalization. Fallback transports (QR, redirect, SSE)
 * are the consumer's responsibility.
 */

import type { OID4VPProtocol } from './protocols.js';

/**
 * Normalized response from a DC API credential request.
 */
export interface DigitalCredentialResponse {
	/** The protocol used for this credential exchange */
	protocol: string;
	/** The credential response data (opaque to this library) */
	data: unknown;
}

/**
 * Options for requestCredential().
 */
export interface RequestCredentialOptions {
	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

/**
 * Request a credential via the native DC API.
 *
 * @param protocol  The protocol identifier (e.g. "openid4vp-v1-signed")
 * @param data      The request data object. For JAR: { request: "<JWT>" }.
 *                  For unsigned: the individual OID4VP parameters as an object.
 * @param options   Optional AbortSignal for cancellation.
 * @returns A normalized { protocol, data } response.
 * @throws DOMException with name "NotAllowedError" if user cancels
 * @throws DOMException with name "NotSupportedError" if protocol unsupported
 *
 * @example
 * ```ts
 * // Signed request (JAR)
 * const result = await requestCredential("openid4vp-v1-signed", {
 *   request: signedJWT,
 * });
 *
 * // Unsigned request
 * const result = await requestCredential("openid4vp-v1-unsigned", {
 *   response_type: "vp_token",
 *   nonce: "abc123",
 *   dcql_query: { credentials: [...] },
 * });
 * ```
 */
export async function requestCredential(
	protocol: OID4VPProtocol | string,
	data: object,
	options?: RequestCredentialOptions,
): Promise<DigitalCredentialResponse> {
	const dcOptions: CredentialRequestOptions & {
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

	const credential = await navigator.credentials.get(dcOptions);

	if (!credential) {
		throw new DOMException('No credential received', 'NotAllowedError');
	}

	return normalizeCredential(credential, protocol);
}

/**
 * Normalize a Credential into our standard response shape.
 */
function normalizeCredential(
	credential: Credential,
	fallbackProtocol: string,
): DigitalCredentialResponse {
	// The DC API returns a DigitalCredential with .protocol and .data
	const dc = credential as Credential & {
		protocol?: string;
		data?: unknown;
	};

	return {
		protocol: dc.protocol ?? fallbackProtocol,
		data: dc.data ?? credential,
	};
}
