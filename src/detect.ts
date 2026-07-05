/**
 * DC API feature detection.
 *
 * (a) isDCAPIAvailable() — checks typeof DigitalCredential !== "undefined"
 *     Per spec §2.1.
 *
 * (b) isProtocolAllowed(protocol) — calls DigitalCredential.userAgentAllowsProtocol()
 *     Per spec §2.2, §7.7.3. Returns false safely for unknown protocols.
 *
 * (c) getBestProtocol(preference?) — finds the best supported protocol
 *     from a preference-ordered list.
 */

import { OID4VP_PROTOCOLS, type OID4VPProtocol, OID4VP_SPEC_PROTOCOLS } from './protocols.js';

/**
 * Check if the W3C Digital Credentials API is available in this browser.
 *
 * Returns true when:
 *   - Chrome 141+ (native)
 *   - Safari/iOS 26+ (native, but may only support org-iso-mdoc)
 *   - Any browser with wallet-companion installed (shims DigitalCredential)
 */
export function isDCAPIAvailable(): boolean {
	return typeof DigitalCredential !== 'undefined';
}

/**
 * Check if the browser allows a specific protocol for digital credentials.
 *
 * Uses the static method DigitalCredential.userAgentAllowsProtocol()
 * defined in the DC API spec §7.7.3.
 *
 * Returns false safely when:
 *   - DigitalCredential is not defined
 *   - userAgentAllowsProtocol is not implemented
 *   - The protocol is unknown to the browser
 *
 * NOTE: This method reflects browser capability, NOT wallet availability.
 * A true result means the browser will accept the protocol in a
 * navigator.credentials.get() call, but a wallet must still be present
 * to fulfill the request.
 */
export function isProtocolAllowed(protocol: string): boolean {
	if (typeof DigitalCredential === 'undefined') return false;
	if (typeof DigitalCredential.userAgentAllowsProtocol !== 'function') return false;
	return DigitalCredential.userAgentAllowsProtocol(protocol);
}

/**
 * Default protocol preference order.
 * Signed first (most verifiers use JAR), then multisigned, then unsigned.
 */
const DEFAULT_PREFERENCE: readonly OID4VPProtocol[] = [
	OID4VP_PROTOCOLS.SIGNED,
	OID4VP_PROTOCOLS.MULTISIGNED,
	OID4VP_PROTOCOLS.UNSIGNED,
];

/**
 * Find the best OpenID4VP protocol supported by this browser.
 *
 * @param preference  Ordered list of protocols to try (most preferred first).
 *                    Defaults to [SIGNED, MULTISIGNED, UNSIGNED].
 * @returns The first allowed protocol, or null if none are supported.
 *
 * @example
 * ```ts
 * const protocol = getBestProtocol();
 * if (protocol) {
 *   const result = await requestCredential(protocol, requestData);
 * } else {
 *   // No DC API support for OpenID4VP — use QR/redirect fallback
 * }
 * ```
 */
export function getBestProtocol(preference?: readonly string[]): OID4VPProtocol | null {
	const candidates = preference ?? DEFAULT_PREFERENCE;
	for (const proto of candidates) {
		if (isProtocolAllowed(proto)) return proto as OID4VPProtocol;
	}
	return null;
}
