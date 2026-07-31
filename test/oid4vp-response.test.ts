import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	extractOID4VPResponse,
	requestOID4VPPresentation,
} from '../src/oid4vp-response.js';
import { OID4VP_PROTOCOLS } from '../src/protocols.js';

function makeJwt(payload: Record<string, unknown>): string {
	const b64url = (obj: Record<string, unknown>) =>
		btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `${b64url({ alg: 'ES256', typ: 'oauth-authz-req+jwt' })}.${b64url(payload)}.sig`;
}

describe('extractOID4VPResponse', () => {
	it('extracts a dc_api.jwt (encrypted) response', () => {
		const result = extractOID4VPResponse({
			protocol: OID4VP_PROTOCOLS.SIGNED,
			data: { response: 'header.payload.signature' },
		});
		expect(result).toEqual({ responseMode: 'dc_api.jwt', jwe: 'header.payload.signature' });
	});

	it('extracts a dc_api (unencrypted) response', () => {
		const vpToken = { mdl: 'signed-vp-token' };
		const result = extractOID4VPResponse({
			protocol: OID4VP_PROTOCOLS.UNSIGNED,
			data: { vp_token: vpToken },
		});
		expect(result).toEqual({ responseMode: 'dc_api', vpToken });
	});

	it('prefers dc_api.jwt shape when both response and vp_token happen to be present', () => {
		const result = extractOID4VPResponse({
			protocol: OID4VP_PROTOCOLS.SIGNED,
			data: { response: 'jwe-string', vp_token: { mdl: 'x' } },
		});
		expect(result.responseMode).toBe('dc_api.jwt');
	});

	it('throws for an unrecognized data shape', () => {
		expect(() =>
			extractOID4VPResponse({ protocol: OID4VP_PROTOCOLS.SIGNED, data: { redirect_uri: 'https://x' } }),
		).toThrow(/Unrecognized DC API response shape/);
	});

	it('throws when data is missing entirely', () => {
		expect(() => extractOID4VPResponse({ protocol: OID4VP_PROTOCOLS.SIGNED, data: undefined })).toThrow(
			/Unrecognized DC API response shape/,
		);
	});
});

describe('requestOID4VPPresentation', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
		vi.unstubAllGlobals();
	});

	it('returns null when no protocol is supported (no DC API)', async () => {
		const result = await requestOID4VPPresentation(
			'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1',
		);
		expect(result).toBeNull();
	});

	it('requests the credential and returns the normalized OpenID4VP response', async () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => p === OID4VP_PROTOCOLS.SIGNED,
		};
		const jwt = makeJwt({ nonce: 'abc' });
		const getMock = vi.fn(async () => ({
			protocol: OID4VP_PROTOCOLS.SIGNED,
			data: { response: 'the-jwe' },
		}));
		vi.stubGlobal('navigator', { credentials: { get: getMock } });

		const uri = `openid4vp://cb?client_id=x&request=${encodeURIComponent(jwt)}`;
		const result = await requestOID4VPPresentation(uri);

		expect(result).toEqual({ responseMode: 'dc_api.jwt', jwe: 'the-jwe' });
	});
});
