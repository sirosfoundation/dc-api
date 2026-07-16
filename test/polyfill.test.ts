/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	installPolyfill,
	uninstallPolyfill,
	isPolyfillInstalled,
	registerWallet,
	unregisterWallet,
	getRegisteredWallets,
} from '../src/polyfill.js';

// Save and stub navigator.credentials.get and .create
const originalGet = vi.fn();
const originalCreate = vi.fn();

beforeEach(() => {
	// Ensure navigator.credentials exists in happy-dom
	if (!navigator.credentials) {
		Object.defineProperty(navigator, 'credentials', {
			value: { get: originalGet, create: originalCreate },
			writable: true,
			configurable: true,
		});
	} else {
		navigator.credentials.get = originalGet;
		if (!navigator.credentials.create) {
			(navigator.credentials as any).create = originalCreate;
		} else {
			navigator.credentials.create = originalCreate;
		}
	}
	// @ts-expect-error — ensure clean state
	delete globalThis.DigitalCredential;
});

afterEach(() => {
	uninstallPolyfill();
	// Restore stubs for next test
	if (navigator.credentials) {
		navigator.credentials.get = originalGet;
		(navigator.credentials as any).create = originalCreate;
	}
	// Clear wallet registry
	for (const w of getRegisteredWallets()) {
		unregisterWallet(w.id);
	}
});

describe('installPolyfill / uninstallPolyfill', () => {
	it('is idempotent', () => {
		installPolyfill();
		installPolyfill(); // second call should be no-op
		expect(isPolyfillInstalled()).toBe(true);
	});

	it('restores original get on uninstall', () => {
		installPolyfill();
		expect(navigator.credentials.get).not.toBe(originalGet);
		uninstallPolyfill();
		// After uninstall, get should no longer be our polyfill
		expect(isPolyfillInstalled()).toBe(false);
	});

	it('creates DigitalCredential global when missing', () => {
		installPolyfill();
		expect(globalThis.DigitalCredential).toBeDefined();
	});

	it('removes DigitalCredential global on uninstall if it created it', () => {
		installPolyfill();
		uninstallPolyfill();
		expect(globalThis.DigitalCredential).toBeUndefined();
	});

	it('wraps existing userAgentAllowsProtocol and restores on uninstall', () => {
		const originalUAP = vi.fn().mockReturnValue(false);
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = { userAgentAllowsProtocol: originalUAP };

		registerWallet({ id: 'w1', name: 'W1', url: 'https://w.example.com', protocols: ['openid4vp-v1-signed'] });
		installPolyfill();

		// Polyfill reports registered protocols as allowed
		expect(DigitalCredential!.userAgentAllowsProtocol('openid4vp-v1-signed')).toBe(true);
		// Delegates unknown protocols to original
		expect(DigitalCredential!.userAgentAllowsProtocol('org-iso-mdoc')).toBe(false);
		expect(originalUAP).toHaveBeenCalledWith('org-iso-mdoc');

		uninstallPolyfill();
		expect(DigitalCredential!.userAgentAllowsProtocol).toBe(originalUAP);
	});
});

describe('registerWallet / unregisterWallet', () => {
	it('adds and removes wallets', () => {
		registerWallet({ id: 'w1', name: 'W1', url: 'https://w.example.com', protocols: ['openid4vp-v1-signed'] });
		expect(getRegisteredWallets()).toHaveLength(1);

		unregisterWallet('w1');
		expect(getRegisteredWallets()).toHaveLength(0);
	});

	it('replaces wallet with same id', () => {
		registerWallet({ id: 'w1', name: 'W1', url: 'https://a.example.com', protocols: ['openid4vp-v1-signed'] });
		registerWallet({ id: 'w1', name: 'W1 Updated', url: 'https://b.example.com', protocols: ['openid4vp-v1-signed'] });
		expect(getRegisteredWallets()).toHaveLength(1);
		expect(getRegisteredWallets()[0].url).toBe('https://b.example.com');
	});
});

describe('polyfilled navigator.credentials.get', () => {
	it('passes non-digital requests through to original', async () => {
		originalGet.mockResolvedValue({ type: 'public-key' });
		installPolyfill();

		const result = await navigator.credentials.get({ publicKey: {} } as any);
		expect(originalGet).toHaveBeenCalled();
		expect(result).toEqual({ type: 'public-key' });
	});

	it('passes through empty digital requests', async () => {
		originalGet.mockResolvedValue(null);
		installPolyfill();

		const result = await navigator.credentials.get({ digital: { requests: [] } } as any);
		expect(originalGet).toHaveBeenCalled();
		expect(result).toBeNull();
	});

	it('throws NotAllowedError when no wallet matches', async () => {
		installPolyfill({ preferNative: false });

		try {
			await navigator.credentials.get({
				digital: { requests: [{ protocol: 'openid4vp-v1-signed', data: {} }] },
			} as any);
			expect.fail('should have thrown');
		} catch (err: any) {
			expect(err.name).toBe('NotAllowedError');
		}
	});

	it('delegates to native when native supports the protocol', async () => {
		const nativeUAP = vi.fn((p: string) => p === 'org-iso-mdoc');
		// @ts-expect-error — stubbing
		globalThis.DigitalCredential = { userAgentAllowsProtocol: nativeUAP };

		// originalGet must return a result for native delegation to work
		originalGet.mockResolvedValue({ type: 'digital', protocol: 'org-iso-mdoc', data: {} });

		// Install AFTER setting up DigitalCredential so it captures the native UAP
		// and ensure preferNative is true (default)
		installPolyfill({ preferNative: true });

		// Also register a wallet so we don't get NotAllowedError on fallback
		registerWallet({ id: 'test', name: 'T', url: 'https://t.example.com', protocols: ['org-iso-mdoc'] });

		const result = await navigator.credentials.get({
			digital: { requests: [{ protocol: 'org-iso-mdoc', data: {} }] },
		} as any);

		expect(originalGet).toHaveBeenCalled();
		expect(result).toEqual({ type: 'digital', protocol: 'org-iso-mdoc', data: {} });
	});
});

describe('_buildUrl', () => {
	// Test URL construction indirectly via the polyfill's popup behavior
	// We can't easily test popup opening in unit tests, but we can test
	// that the polyfill attempts to open a popup when a wallet matches.

	it('attempts popup when wallet matches and native unavailable', async () => {
		const openSpy = vi.fn().mockReturnValue(null); // popup blocked
		globalThis.window = { ...globalThis.window, open: openSpy, location: { origin: 'https://verifier.example.com' } } as any;

		registerWallet({ id: 'w1', name: 'W1', url: 'https://wallet.example.com/dc', protocols: ['openid4vp-v1-signed'] });
		installPolyfill({ preferNative: false });

		await expect(
			navigator.credentials.get({
				digital: { requests: [{ protocol: 'openid4vp-v1-signed', data: { request: 'eyJ...' } }] },
			} as any),
		).rejects.toThrow('Popup blocked');

		expect(openSpy).toHaveBeenCalled();
		const url = openSpy.mock.calls[0][0] as string;
		expect(url).toContain('https://wallet.example.com/dc');
		expect(url).toContain('protocol=openid4vp-v1-signed');
		expect(url).toContain('client_id=https%3A%2F%2Fverifier.example.com');
		// JWT should be in fragment, not query
		expect(url).toContain('#eyJ...');
		expect(url).not.toContain('request=eyJ');
	});
});
