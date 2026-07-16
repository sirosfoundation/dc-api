/**
 * @sirosfoundation/dc-api
 *
 * W3C Digital Credentials API utilities for OpenID4VP.
 *
 * Backend-agnostic library providing:
 *   - Protocol constants (versioned OpenID4VP protocol identifiers)
 *   - DC API feature detection (API availability + protocol support)
 *   - Native DC API invocation with response normalization
 *   - Error classification helpers
 *
 * Does NOT include:
 *   - Fallback transports (QR, redirect, SSE, polling) — those are verifier-specific
 *   - Wallet popup management — that's the wallet-companion's job
 *   - Backend endpoint URLs — pass your own
 *
 * References:
 *   - W3C Digital Credentials API: https://w3c-fedid.github.io/digital-credentials/
 *   - OpenID4VP (DC API profile): https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
 */

export {
	OID4VP_PROTOCOLS,
	OID4VP_ALL_PROTOCOLS,
	OID4VP_SPEC_PROTOCOLS,
	isOID4VPProtocol,
	OID4VCI_PROTOCOLS,
	isOID4VCIProtocol,
	type OID4VPProtocol,
	type OID4VCIProtocol,
} from './protocols.js';
export {
	isDCAPIAvailable,
	isProtocolAllowed,
	getBestProtocol,
} from './detect.js';
export {
	requestCredential,
	type DigitalCredentialResponse,
	type RequestCredentialOptions,
} from './request.js';
export {
	getUserFriendlyErrorMessage,
	isUserCancel,
	isProtocolUnsupported,
	ERROR_MESSAGES,
} from './errors.js';
