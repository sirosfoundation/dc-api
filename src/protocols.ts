/**
 * W3C DigitalCredentialPresentationProtocol enum values for OpenID4VP.
 *
 * Per the DC API spec (§5, §7.8.2), protocol strings are versioned:
 *   "openid4vp-v1-unsigned"    — unsigned request (client_id from origin)
 *   "openid4vp-v1-signed"     — signed request (JAR with single signature)
 *   "openid4vp-v1-multisigned" — multi-signed request (JWS JSON Serialization)
 *
 * The legacy "openid4vp" string is NOT a valid DC API protocol identifier
 * but is included for compatibility with older implementations.
 */
export const OID4VP_PROTOCOLS = {
	/** Unsigned request — client_id derived from web-origin */
	UNSIGNED: 'openid4vp-v1-unsigned',
	/** Signed request — JAR with single JWS compact serialization */
	SIGNED: 'openid4vp-v1-signed',
	/** Multi-signed request — JWS JSON serialization */
	MULTISIGNED: 'openid4vp-v1-multisigned',
	/** Legacy protocol string (pre-spec, used by some implementations) */
	LEGACY: 'openid4vp',
} as const;

export type OID4VPProtocol = (typeof OID4VP_PROTOCOLS)[keyof typeof OID4VP_PROTOCOLS];

/**
 * All spec-defined OpenID4VP protocol identifiers (excludes legacy).
 */
export const OID4VP_SPEC_PROTOCOLS: readonly OID4VPProtocol[] = [
	OID4VP_PROTOCOLS.UNSIGNED,
	OID4VP_PROTOCOLS.SIGNED,
	OID4VP_PROTOCOLS.MULTISIGNED,
];

/**
 * All protocol identifiers including legacy.
 */
export const OID4VP_ALL_PROTOCOLS: readonly OID4VPProtocol[] = [
	...OID4VP_SPEC_PROTOCOLS,
	OID4VP_PROTOCOLS.LEGACY,
];

/**
 * Check if a string is a known OpenID4VP protocol identifier.
 */
export function isOID4VPProtocol(value: unknown): value is OID4VPProtocol {
	return OID4VP_ALL_PROTOCOLS.includes(value as OID4VPProtocol);
}
