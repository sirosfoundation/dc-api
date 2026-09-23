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
 *
 * (d) isIssuanceAvailable(protocol?) — whether an issuance request can
 *     actually be fulfilled right now, natively OR by a registered wallet.
 */

import {
	OID4VP_PROTOCOLS,
	OID4VCI_PROTOCOLS,
	type OID4VPProtocol,
} from './protocols.js';

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

// ─── Issuance availability ───────────────────────────────────────────────────

/**
 * Page-level wallet registries this library knows how to interrogate.
 *
 * `DigitalWallets` is installed by this package's web-wallets entry point;
 * `WalletCompanion` is the browser extension that web-wallets.ts steps aside
 * for. Both expose `supportsProtocol(protocol)`. They are read off the global
 * object rather than imported, because index.ts must not pull polyfill.ts in —
 * they are separate package export entry points, and a page that never
 * installs the polyfill must not pay for it.
 */
const _WALLET_REGISTRY_GLOBALS = ['DigitalWallets', 'WalletCompanion'] as const;

interface _WalletRegistry {
	supportsProtocol?: (protocol: string) => boolean;
}

/**
 * Whether this context could actually run `navigator.credentials.create()` at
 * all.
 *
 * Checked before either support signal is consulted: in an SSR render, a
 * worker, or any context without a credentials container, a stale or injected
 * `DigitalCredential` / wallet registry would otherwise make this predicate
 * claim support that ends in a thrown `create()` rather than the QR fallback
 * the caller wanted.
 */
function _canInvokeCreate(): boolean {
	try {
		return (
			typeof navigator !== 'undefined' &&
			typeof navigator.credentials?.create === 'function'
		);
	} catch {
		return false;
	}
}

/**
 * Whether any wallet registered with an installed polyfill/extension claims
 * the protocol. Never throws — an absent, half-installed or hostile global is
 * simply "no wallet".
 */
function _registeredWalletSupports(protocol: string): boolean {
	for (const name of _WALLET_REGISTRY_GLOBALS) {
		try {
			const registry = (globalThis as unknown as Record<string, unknown>)[name] as
				| _WalletRegistry
				| undefined;
			if (!registry || typeof registry.supportsProtocol !== 'function') continue;
			if (registry.supportsProtocol(protocol) === true) return true;
		} catch {
			// Unusable registry — treat as "no wallet" and try the next one.
		}
	}
	return false;
}

/**
 * Check whether a credential issuance request can actually be fulfilled right
 * now — the question a caller deciding whether to render an "Add to wallet"
 * button is really asking.
 *
 * True when EITHER:
 *   - the native user agent allows the protocol
 *     (`DigitalCredential.userAgentAllowsProtocol`), OR
 *   - a wallet registered with the polyfill (`window.DigitalWallets`) or the
 *     wallet-companion extension (`window.WalletCompanion`) supports it.
 *
 * This is deliberately stronger than isProtocolAllowed(), which reports
 * browser capability only: a browser that "allows" openid4vci-v1 with no
 * wallet present still produces a NotAllowedError on click, and a browser
 * that allows nothing still works when the polyfill has a web wallet
 * registered.
 *
 * Never throws. Returns false when there is no `navigator.credentials.create`
 * to invoke in the first place (SSR, workers), when `DigitalCredential` and
 * the wallet registries are absent, and in every unknown case.
 *
 * @param protocol  Issuance protocol identifier. Defaults to "openid4vci-v1".
 *
 * @example
 * ```ts
 * if (isIssuanceAvailable()) {
 *   addToWalletButton.hidden = false;
 * } else {
 *   showCredentialOfferQRCode(); // cross-device fallback
 * }
 * ```
 */
export function isIssuanceAvailable(protocol: string = OID4VCI_PROTOCOLS.V1): boolean {
	if (!_canInvokeCreate()) return false;

	try {
		if (isProtocolAllowed(protocol) === true) return true;
	} catch {
		// userAgentAllowsProtocol threw (e.g. on an unknown protocol string) —
		// not fatal, a registered wallet may still handle it.
	}
	return _registeredWalletSupports(protocol);
}
