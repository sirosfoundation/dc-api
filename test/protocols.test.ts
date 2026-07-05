import { describe, it, expect } from 'vitest';
import {
	OID4VP_PROTOCOLS,
	isOID4VPProtocol,
	OID4VP_SPEC_PROTOCOLS,
	OID4VP_ALL_PROTOCOLS,
} from '../src/protocols.js';

describe('OID4VP_PROTOCOLS', () => {
	it('has the correct protocol strings', () => {
		expect(OID4VP_PROTOCOLS.UNSIGNED).toBe('openid4vp-v1-unsigned');
		expect(OID4VP_PROTOCOLS.SIGNED).toBe('openid4vp-v1-signed');
		expect(OID4VP_PROTOCOLS.MULTISIGNED).toBe('openid4vp-v1-multisigned');
		expect(OID4VP_PROTOCOLS.LEGACY).toBe('openid4vp');
	});
});

describe('OID4VP_SPEC_PROTOCOLS', () => {
	it('includes only spec-defined protocols', () => {
		expect(OID4VP_SPEC_PROTOCOLS).toContain('openid4vp-v1-unsigned');
		expect(OID4VP_SPEC_PROTOCOLS).toContain('openid4vp-v1-signed');
		expect(OID4VP_SPEC_PROTOCOLS).toContain('openid4vp-v1-multisigned');
		expect(OID4VP_SPEC_PROTOCOLS).not.toContain('openid4vp');
	});
});

describe('OID4VP_ALL_PROTOCOLS', () => {
	it('includes spec + legacy protocols', () => {
		expect(OID4VP_ALL_PROTOCOLS).toContain('openid4vp-v1-unsigned');
		expect(OID4VP_ALL_PROTOCOLS).toContain('openid4vp');
	});
});

describe('isOID4VPProtocol', () => {
	it('returns true for valid protocols', () => {
		expect(isOID4VPProtocol('openid4vp-v1-signed')).toBe(true);
		expect(isOID4VPProtocol('openid4vp-v1-unsigned')).toBe(true);
		expect(isOID4VPProtocol('openid4vp-v1-multisigned')).toBe(true);
		expect(isOID4VPProtocol('openid4vp')).toBe(true);
	});

	it('returns false for unknown protocols', () => {
		expect(isOID4VPProtocol('org-iso-mdoc')).toBe(false);
		expect(isOID4VPProtocol('unknown')).toBe(false);
		expect(isOID4VPProtocol('')).toBe(false);
		expect(isOID4VPProtocol(null)).toBe(false);
		expect(isOID4VPProtocol(undefined)).toBe(false);
		expect(isOID4VPProtocol(42)).toBe(false);
	});
});
