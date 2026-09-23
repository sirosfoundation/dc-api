/**
 * Regression tests for the built ESM bundles in dist/.
 *
 * These exist because a bundle can be produced, imported and type-checked and
 * still be dead on arrival: the `bundle` script used to post-process esbuild's
 * output with `sed 's/^var /const /g'`, which turned every reassigned
 * module-level binding into a `const`. ESM is strict mode, so the published
 * v0.6.0 polyfill bundle threw `TypeError: Assignment to constant variable.`
 * on the first `installPolyfill()` call, and web-wallets did the same on
 * `enableWebWallets()`. A test that only imported the bundle would have passed
 * against that build — so each bundle is actually exercised here.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// fileURLToPath rather than import.meta.dirname: the latter needs node 20.11+.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = resolve(ROOT, 'dist');

function bundleUrl(name: string): string {
	return pathToFileURL(resolve(DIST, name)).href;
}

beforeAll(() => {
	// Build the bundles from the current sources rather than trusting whatever
	// dist/ happens to hold — a stale bundle would make this suite meaningless.
	execFileSync('npm', ['run', 'bundle'], {
		cwd: ROOT,
		stdio: 'pipe',
	});
}, 120_000);

beforeEach(() => {
	// navigator and window are getter-only / absent in node: defineProperty is
	// the only way to put a credentials container in place.
	Object.defineProperty(globalThis, 'navigator', {
		value: {
			credentials: {
				get: async () => null,
				create: async () => null,
			},
		},
		configurable: true,
		writable: true,
	});
	Object.defineProperty(globalThis, 'window', {
		value: globalThis,
		configurable: true,
		writable: true,
	});
});

afterEach(() => {
	for (const name of ['navigator', 'window', 'DigitalCredential', 'DigitalWallets', 'WalletCompanion']) {
		try {
			delete (globalThis as Record<string, unknown>)[name];
		} catch {
			// Non-configurable — nothing to undo.
		}
	}
});


/**
 * Stand in for the browser bits _invokeWalletPopup needs: window.open, a
 * message listener list, and a location. Returns a handle that lets a test
 * deliver the wallet's response, so navigator.credentials.create() can be
 * driven to completion without a browser.
 */
function installFakePopupWindow(): {
	respond: (payload: unknown) => void;
	fail: (error: string) => void;
	opened: () => string | null;
} {
	const listeners: Array<(e: unknown) => void> = [];
	let openedUrl: string | null = null;
	let requestId: string | null = null;
	const popup = { closed: false, close() { this.closed = true; }, postMessage() {} };

	const win = globalThis as unknown as Record<string, unknown>;
	win.location = { origin: 'https://verifier.example' };
	win.open = (url: string) => {
		openedUrl = url;
		requestId = new URL(url).searchParams.get('request_id');
		return popup;
	};
	win.addEventListener = (type: string, handler: (e: unknown) => void) => {
		if (type === 'message') listeners.push(handler);
	};
	win.removeEventListener = (type: string, handler: (e: unknown) => void) => {
		const i = listeners.indexOf(handler);
		if (i >= 0) listeners.splice(i, 1);
	};

	function deliver(data: Record<string, unknown>) {
		// Copy: cleanup() mutates the list while we iterate.
		for (const h of [...listeners]) {
			h({ source: popup, origin: 'https://wallet.example.com', data });
		}
	}

	return {
		opened: () => openedUrl,
		respond: (response) =>
			deliver({ type: 'WC_WALLET_RESPONSE', requestId, response }),
		fail: (error) => deliver({ type: 'WC_WALLET_RESPONSE', requestId, error }),
	};
}

describe('dist/dc-api-polyfill.bundle.js', () => {
	it('installs without throwing on a reassigned module-level binding', async () => {
		const mod = await import(bundleUrl('dc-api-polyfill.bundle.js'));

		expect(() => mod.installPolyfill()).not.toThrow();
		expect(mod.isPolyfillInstalled()).toBe(true);

		mod.uninstallPolyfill();
		expect(mod.isPolyfillInstalled()).toBe(false);
	});

	it('registers a wallet and reports it through the shimmed userAgentAllowsProtocol', async () => {
		const mod = await import(bundleUrl('dc-api-polyfill.bundle.js'));

		mod.registerWallet({
			id: 'bundle-test',
			name: 'Bundle Test Wallet',
			url: 'https://wallet.example/dc-api',
			protocols: ['openid4vci-v1'],
		});
		mod.installPolyfill();

		expect((globalThis as any).DigitalCredential.userAgentAllowsProtocol('openid4vci-v1')).toBe(true);

		mod.uninstallPolyfill();
		mod.unregisterWallet('bundle-test');
	});
});

describe('dist/dc-api-web-wallets.bundle.js', () => {
	it('enables without throwing on a reassigned module-level binding', async () => {
		const mod = await import(bundleUrl('dc-api-web-wallets.bundle.js'));

		expect(() => mod.enableWebWallets()).not.toThrow();
		expect(mod.isWebWalletsEnabled()).toBe(true);
		expect(typeof (globalThis as any).DigitalWallets?.supportsProtocol).toBe('function');

		mod.disableWebWallets();
		expect(mod.isWebWalletsEnabled()).toBe(false);
	});
});

describe('dist/dc-api.bundle.js', () => {
	it('exposes the issuance API surface', async () => {
		const mod = await import(bundleUrl('dc-api.bundle.js'));

		expect(typeof mod.issueCredential).toBe('function');
		expect(typeof mod.isIssuanceAvailable).toBe('function');
		expect(typeof mod.buildIssuanceRequestData).toBe('function');
		expect(typeof mod.issueCredentialFromOffer).toBe('function');
		expect(mod.OID4VCI_PROTOCOLS.V1).toBe('openid4vci-v1');
	});

	it('runs the issuance helpers rather than merely exporting them', async () => {
		const mod = await import(bundleUrl('dc-api.bundle.js'));

		expect(mod.isIssuanceAvailable()).toBe(false);

		const offer = {
			credential_issuer: 'https://issuer.example',
			credential_configuration_ids: ['org.iso.18013.5.1.mDL'],
		};
		const uri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;
		expect(await mod.buildIssuanceRequestData(uri)).toEqual(offer);
	});

	it('carries no polyfill code — the entry-point boundary holds', async () => {
		const { readFileSync } = await import('node:fs');
		const source = readFileSync(resolve(DIST, 'dc-api.bundle.js'), 'utf8');

		expect(source).not.toContain('installPolyfill');
		expect(source).not.toContain('WC_ORIGIN_CHECK');
		expect(source).not.toContain('_invokeWalletPopup');
	});
});

// Regression for #23. dc-api-polyfill.bundle.js and
// dc-api-web-wallets.bundle.js are each self-contained: both inline their own
// copy of polyfill.ts, so a page loading both gets two wallet registries and
// two create() shims. A wallet registered through one bundle's
// window.DigitalWallets was invisible to the other bundle's
// navigator.credentials.create(), and issuance rejected with NotAllowedError
// with a provider sitting right there. dc-api-full.bundle.js is the fix: one
// module instance carrying both halves.
describe('dist/dc-api-full.bundle.js', () => {
	const wallet = {
		id: 'w',
		name: 'W',
		url: 'https://wallet.example.com/dc-api',
		protocols: ['openid4vci-v1'],
	};

	it('shares one registry between the polyfill and window.DigitalWallets', async () => {
		const mod = await import(bundleUrl('dc-api-full.bundle.js'));

		mod.installPolyfill();
		mod.enableWebWallets();

		// Registered through the page-facing API...
		globalThis.window.DigitalWallets.register(wallet);

		// ...and visible to the create() shim's own registry. This is the
		// assertion the split bundles fail.
		expect(mod.getRegisteredWallets().map((w: { id: string }) => w.id)).toContain('w');
		expect(DigitalCredential.userAgentAllowsProtocol('openid4vci-v1')).toBe(true);

		mod.disableWebWallets();
		mod.uninstallPolyfill();
	});

	it('unregisters through either half', async () => {
		const mod = await import(bundleUrl('dc-api-full.bundle.js'));

		mod.installPolyfill();
		mod.enableWebWallets();
		globalThis.window.DigitalWallets.register(wallet);
		expect(globalThis.window.DigitalWallets.supportsProtocol('openid4vci-v1')).toBe(true);

		mod.unregisterWallet('w');
		expect(globalThis.window.DigitalWallets.supportsProtocol('openid4vci-v1')).toBe(false);

		mod.disableWebWallets();
		mod.uninstallPolyfill();
	});

	// The defect this entry point exists for, pinned so nobody "simplifies"
	// the full bundle back into loading the two separate ones.
	it('is needed: the separate bundles do NOT share a registry', async () => {
		const polyfill = await import(bundleUrl('dc-api-polyfill.bundle.js'));
		const webWallets = await import(bundleUrl('dc-api-web-wallets.bundle.js'));

		polyfill.installPolyfill();
		webWallets.enableWebWallets();

		globalThis.window.DigitalWallets.register(wallet);

		// web-wallets' own inlined polyfill copy took the registration...
		expect(globalThis.window.DigitalWallets.supportsProtocol('openid4vci-v1')).toBe(true);
		// ...while the polyfill bundle that actually shimmed create() saw nothing.
		expect(polyfill.getRegisteredWallets()).toHaveLength(0);

		webWallets.disableWebWallets();
		polyfill.uninstallPolyfill();
	});
});

// #23 is ultimately about whether create() REACHES the wallet, so assert that
// directly rather than inferring it from the registry: a broken
// _polyfillCreate or routing path would pass a registry-only check while the
// advertised wallet stayed unusable.
describe('dist/dc-api-full.bundle.js create() routing', () => {
	const wallet = {
		id: 'w',
		name: 'W',
		url: 'https://wallet.example.com/dc-api',
		protocols: ['openid4vci-v1'],
	};
	const request = {
		digital: { requests: [{ protocol: 'openid4vci-v1', data: { credential_issuer: 'https://issuer.example' } }] },
	};

	it('routes create() to a wallet registered through window.DigitalWallets', async () => {
		const mod = await import(bundleUrl('dc-api-full.bundle.js'));
		const popup = installFakePopupWindow();

		mod.installPolyfill();
		mod.enableWebWallets();
		globalThis.window.DigitalWallets.register(wallet);

		const pending = navigator.credentials.create(request);
		// The popup must have been opened for THIS wallet.
		expect(popup.opened()).toContain('https://wallet.example.com/dc-api');

		popup.respond({ credential: 'issued' });
		const credential = await pending;

		expect(credential).toMatchObject({
			protocol: 'openid4vci-v1',
			data: { credential: 'issued' },
		});

		mod.disableWebWallets();
		mod.uninstallPolyfill();
	});

	it('surfaces a wallet-reported error rather than resolving', async () => {
		const mod = await import(bundleUrl('dc-api-full.bundle.js'));
		const popup = installFakePopupWindow();

		mod.installPolyfill();
		mod.enableWebWallets();
		globalThis.window.DigitalWallets.register(wallet);

		const pending = navigator.credentials.create(request);
		popup.fail('user refused');

		await expect(pending).rejects.toThrow(/user refused/);

		mod.disableWebWallets();
		mod.uninstallPolyfill();
	});

	// The bug in one assertion: same registration, separate bundles, and
	// create() cannot find the wallet that window.DigitalWallets reports.
	it('is needed: with the separate bundles create() rejects despite a registered wallet', async () => {
		const polyfill = await import(bundleUrl('dc-api-polyfill.bundle.js'));
		const webWallets = await import(bundleUrl('dc-api-web-wallets.bundle.js'));
		installFakePopupWindow();

		polyfill.installPolyfill();
		webWallets.enableWebWallets();
		globalThis.window.DigitalWallets.register(wallet);

		expect(globalThis.window.DigitalWallets.supportsProtocol('openid4vci-v1')).toBe(true);
		await expect(navigator.credentials.create(request)).rejects.toThrow(/No digital credential provider/i);

		webWallets.disableWebWallets();
		polyfill.uninstallPolyfill();
	});
});
