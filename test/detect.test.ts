import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isDCAPIAvailable,
	isProtocolAllowed,
	getBestProtocol,
	isIssuanceAvailable,
} from '../src/detect.js';
import { enableWebWallets, disableWebWallets } from '../src/web-wallets.js';
import { registerWallet, getRegisteredWallets, unregisterWallet } from '../src/polyfill.js';
import { OID4VCI_PROTOCOLS } from '../src/protocols.js';

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

describe('isIssuanceAvailable', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalWallets;
		// @ts-expect-error — cleaning up global stub
		delete globalThis.WalletCompanion;
		disableWebWallets();
		for (const w of getRegisteredWallets()) unregisterWallet(w.id);
	});

	it('returns false when no DC API and no wallet registry are present', () => {
		expect(isIssuanceAvailable()).toBe(false);
	});

	it('does not throw when navigator and window are absent', () => {
		expect(() => isIssuanceAvailable()).not.toThrow();
	});

	it('defaults to openid4vci-v1', () => {
		const mock = vi.fn((p: string) => p === OID4VCI_PROTOCOLS.V1);
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = { userAgentAllowsProtocol: mock };

		expect(isIssuanceAvailable()).toBe(true);
		expect(mock).toHaveBeenCalledWith('openid4vci-v1');
	});

	it('returns true when the native user agent allows the protocol', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = { userAgentAllowsProtocol: () => true };
		expect(isIssuanceAvailable('openid4vci-v1')).toBe(true);
	});

	it('returns false when the native user agent allows a different protocol only', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => p === 'openid4vp-v1-signed',
		};
		expect(isIssuanceAvailable()).toBe(false);
	});

	it('returns true for a polyfill-registered wallet with no native DC API', () => {
		enableWebWallets();
		registerWallet({
			id: 'w',
			name: 'Web Wallet',
			url: 'https://wallet.example/dc-api',
			protocols: [OID4VCI_PROTOCOLS.V1],
		});

		expect(isDCAPIAvailable()).toBe(false);
		expect(isProtocolAllowed(OID4VCI_PROTOCOLS.V1)).toBe(false);
		expect(isIssuanceAvailable()).toBe(true);
	});

	it('returns false when the registered wallet supports presentation only', () => {
		enableWebWallets();
		registerWallet({
			id: 'w',
			name: 'Web Wallet',
			url: 'https://wallet.example/dc-api',
			protocols: ['openid4vp-v1-signed'],
		});

		expect(isIssuanceAvailable()).toBe(false);
	});

	it('consults the wallet-companion extension global too', () => {
		// @ts-expect-error — stubbing the extension's page global
		globalThis.WalletCompanion = { supportsProtocol: (p: string) => p === OID4VCI_PROTOCOLS.V1 };
		expect(isIssuanceAvailable()).toBe(true);
	});

	it('returns false rather than throwing when a registry global throws', () => {
		// @ts-expect-error — stubbing a hostile global
		globalThis.DigitalWallets = {
			supportsProtocol: () => {
				throw new Error('boom');
			},
		};
		expect(isIssuanceAvailable()).toBe(false);
	});

	it('returns false rather than throwing when userAgentAllowsProtocol throws', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: () => {
				throw new Error('boom');
			},
		};
		expect(isIssuanceAvailable()).toBe(false);
	});

	it('ignores a registry global that is not shaped like one', () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalWallets = { list: () => [] };
		expect(isIssuanceAvailable()).toBe(false);
	});
});
