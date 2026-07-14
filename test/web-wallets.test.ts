/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	enableWebWallets,
	disableWebWallets,
	isWebWalletsEnabled,
	selectWallet,
} from '../src/web-wallets.js';
import { getRegisteredWallets, unregisterWallet, installPolyfill, uninstallPolyfill } from '../src/polyfill.js';

beforeEach(() => {
	// Ensure clean navigator.credentials
	if (!navigator.credentials) {
		Object.defineProperty(navigator, 'credentials', {
			value: { get: vi.fn() },
			writable: true,
			configurable: true,
		});
	} else {
		navigator.credentials.get = vi.fn();
	}
	// @ts-expect-error — clean state
	delete (globalThis as any).DigitalWallets;
	// @ts-expect-error — clean state
	delete (globalThis as any).WalletCompanion;
	// @ts-expect-error — clean state
	delete (globalThis as any).DigitalCredential;
});

afterEach(() => {
	disableWebWallets();
	uninstallPolyfill();
	for (const w of getRegisteredWallets()) {
		unregisterWallet(w.id);
	}
});

describe('enableWebWallets / disableWebWallets', () => {
	it('is idempotent', () => {
		enableWebWallets();
		enableWebWallets();
		expect(isWebWalletsEnabled()).toBe(true);
	});

	it('exposes window.DigitalWallets', () => {
		enableWebWallets();
		expect((globalThis as any).DigitalWallets).toBeDefined();
	});

	it('removes window.DigitalWallets on disable', () => {
		enableWebWallets();
		disableWebWallets();
		expect((globalThis as any).DigitalWallets).toBeUndefined();
		expect(isWebWalletsEnabled()).toBe(false);
	});

	it('is a no-op when WalletCompanion extension is present', () => {
		(globalThis as any).WalletCompanion = {};
		enableWebWallets();
		expect(isWebWalletsEnabled()).toBe(false);
		expect((globalThis as any).DigitalWallets).toBeUndefined();
	});
});

describe('DigitalWallets.register / unregister', () => {
	it('registers and lists wallets', () => {
		enableWebWallets();
		(globalThis as any).DigitalWallets.register({
			id: 'w1', name: 'W1', url: 'https://w.example.com', protocols: ['openid4vp-v1-signed'],
		});
		expect((globalThis as any).DigitalWallets.list()).toHaveLength(1);
	});

	it('unregisters wallets', () => {
		enableWebWallets();
		(globalThis as any).DigitalWallets.register({
			id: 'w1', name: 'W1', url: 'https://w.example.com', protocols: ['openid4vp-v1-signed'],
		});
		(globalThis as any).DigitalWallets.unregister('w1');
		expect((globalThis as any).DigitalWallets.list()).toHaveLength(0);
	});

	it('rejects non-https URLs', () => {
		enableWebWallets();
		expect(() => {
			(globalThis as any).DigitalWallets.register({
				id: 'bad', name: 'Bad', url: 'javascript:alert(1)', protocols: ['openid4vp-v1-signed'],
			});
		}).toThrow(/https:/);
	});

	it('rejects invalid URLs', () => {
		enableWebWallets();
		expect(() => {
			(globalThis as any).DigitalWallets.register({
				id: 'bad', name: 'Bad', url: 'not-a-url', protocols: ['openid4vp-v1-signed'],
			});
		}).toThrow(/Invalid wallet URL/);
	});

	it('supportsProtocol returns correct values', () => {
		enableWebWallets();
		(globalThis as any).DigitalWallets.register({
			id: 'w1', name: 'W1', url: 'https://w.example.com', protocols: ['openid4vp-v1-signed'],
		});
		expect((globalThis as any).DigitalWallets.supportsProtocol('openid4vp-v1-signed')).toBe(true);
		expect((globalThis as any).DigitalWallets.supportsProtocol('org-iso-mdoc')).toBe(false);
	});
});

describe('selectWallet', () => {
	it('returns the only wallet when one matches', async () => {
		enableWebWallets();
		const wallet = { id: 'w1', name: 'W1', url: 'https://w.example.com', protocols: ['openid4vp-v1-signed'] };
		const result = await selectWallet([wallet], 'openid4vp-v1-signed');
		expect(result).toEqual(wallet);
	});

	it('returns null for empty list', async () => {
		enableWebWallets();
		const result = await selectWallet([], 'openid4vp-v1-signed');
		expect(result).toBeNull();
	});

	it('uses customSelector when provided', async () => {
		const custom = vi.fn().mockResolvedValue({ id: 'picked', name: 'P', url: 'https://p.example.com', protocols: [] });
		enableWebWallets({ customSelector: custom });

		const wallets = [
			{ id: 'w1', name: 'W1', url: 'https://a.example.com', protocols: ['openid4vp-v1-signed'] },
			{ id: 'w2', name: 'W2', url: 'https://b.example.com', protocols: ['openid4vp-v1-signed'] },
		];
		const result = await selectWallet(wallets, 'openid4vp-v1-signed');
		expect(custom).toHaveBeenCalledWith(wallets, 'openid4vp-v1-signed');
		expect(result?.id).toBe('picked');
	});

	it('returns first match when showSelector is false', async () => {
		enableWebWallets({ showSelector: false });
		const wallets = [
			{ id: 'w1', name: 'W1', url: 'https://a.example.com', protocols: ['openid4vp-v1-signed'] },
			{ id: 'w2', name: 'W2', url: 'https://b.example.com', protocols: ['openid4vp-v1-signed'] },
		];
		const result = await selectWallet(wallets, 'openid4vp-v1-signed');
		expect(result?.id).toBe('w1');
	});
});
