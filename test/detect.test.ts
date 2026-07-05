import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isDCAPIAvailable, isProtocolAllowed, getBestProtocol } from '../src/detect.js';

describe('isDCAPIAvailable', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
	});

	it('returns false when DigitalCredential is not defined', () => {
		expect(isDCAPIAvailable()).toBe(false);
	});

	it('returns true when DigitalCredential is defined', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = class {};
		expect(isDCAPIAvailable()).toBe(true);
	});
});

describe('isProtocolAllowed', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
	});

	it('returns false when DigitalCredential is not defined', () => {
		expect(isProtocolAllowed('openid4vp-v1-signed')).toBe(false);
	});

	it('returns false when userAgentAllowsProtocol is not a function', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = class {};
		expect(isProtocolAllowed('openid4vp-v1-signed')).toBe(false);
	});

	it('delegates to userAgentAllowsProtocol', () => {
		const mock = vi.fn((proto: string) => proto === 'openid4vp-v1-signed');
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = { userAgentAllowsProtocol: mock };

		expect(isProtocolAllowed('openid4vp-v1-signed')).toBe(true);
		expect(isProtocolAllowed('openid4vp-v1-unsigned')).toBe(false);
		expect(mock).toHaveBeenCalledTimes(2);
	});
});

describe('getBestProtocol', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
	});

	it('returns null when DC API is not available', () => {
		expect(getBestProtocol()).toBeNull();
	});

	it('returns the first allowed protocol in preference order', () => {
		const allowed = new Set(['openid4vp-v1-unsigned', 'openid4vp-v1-signed']);
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => allowed.has(p),
		};

		// Default preference: signed > multisigned > unsigned
		expect(getBestProtocol()).toBe('openid4vp-v1-signed');
	});

	it('falls back to unsigned if signed is not supported', () => {
		const allowed = new Set(['openid4vp-v1-unsigned']);
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => allowed.has(p),
		};

		expect(getBestProtocol()).toBe('openid4vp-v1-unsigned');
	});

	it('returns null when no protocols are supported', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: () => false,
		};

		expect(getBestProtocol()).toBeNull();
	});

	it('accepts a custom preference list', () => {
		const allowed = new Set(['openid4vp-v1-unsigned']);
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => allowed.has(p),
		};

		expect(getBestProtocol(['openid4vp-v1-unsigned', 'openid4vp-v1-signed'])).toBe(
			'openid4vp-v1-unsigned',
		);
	});
});
