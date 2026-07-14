/**
 * Web Wallet Support — enables web wallets to register with the DC API polyfill.
 *
 * This module extends the polyfill with:
 *   1. A page-level registration API (window.DigitalWallets) that web wallets
 *      call to make themselves discoverable
 *   2. A minimal wallet selector UI shown when multiple wallets match a request
 *   3. Auto-discovery of wallets that register after the polyfill is installed
 *
 * This replicates the wallet-companion browser extension's public API
 * (window.WalletCompanion) but without requiring an extension install.
 *
 * Usage (verifier page):
 *
 *   import { installPolyfill } from '@sirosfoundation/dc-api/polyfill';
 *   import { enableWebWallets } from '@sirosfoundation/dc-api/web-wallets';
 *
 *   installPolyfill();
 *   enableWebWallets();  // Exposes window.DigitalWallets for wallet self-registration
 *
 * Usage (wallet page, loaded as iframe or detected via well-known):
 *
 *   window.DigitalWallets?.register({
 *     id: 'my-wallet',
 *     name: 'My Wallet',
 *     url: 'https://wallet.example.com/dc-api',
 *     protocols: ['openid4vp-v1-signed', 'openid4vp-v1-unsigned'],
 *     icon: 'https://wallet.example.com/icon.svg',
 *   });
 *
 * Compatibility with wallet-companion:
 *   If window.WalletCompanion is already defined (extension installed),
 *   enableWebWallets() is a no-op — the extension handles everything.
 */

import { registerWallet, unregisterWallet, getRegisteredWallets, type RegisteredWallet } from './polyfill.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WebWalletDescriptor {
	/** Unique identifier for this wallet */
	id: string;
	/** Human-readable name shown in wallet selector */
	name: string;
	/** URL to open for credential requests (popup target) */
	url: string;
	/** Protocol identifiers this wallet supports */
	protocols: string[];
	/** Optional icon URL (displayed in selector) */
	icon?: string;
}

export interface DigitalWalletsAPI {
	/** Register a web wallet */
	register(wallet: WebWalletDescriptor): void;
	/** Unregister a wallet by ID */
	unregister(walletId: string): void;
	/** List registered wallets */
	list(): readonly RegisteredWallet[];
	/** Check if a protocol is supported by any registered wallet */
	supportsProtocol(protocol: string): boolean;
}

export interface WebWalletOptions {
	/**
	 * Show a wallet selector UI when multiple wallets match.
	 * If false, the first matching wallet is used silently.
	 * @default true
	 */
	showSelector?: boolean;

	/**
	 * Custom selector implementation. If provided, called instead of
	 * the built-in modal when multiple wallets match.
	 */
	customSelector?: (wallets: RegisteredWallet[], protocol: string) => Promise<RegisteredWallet | null>;
}

// ─── State ───────────────────────────────────────────────────────────────────

let _enabled = false;
let _opts: Required<Pick<WebWalletOptions, 'showSelector'>> & Pick<WebWalletOptions, 'customSelector'> = {
	showSelector: true,
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Enable web wallet self-registration by exposing window.DigitalWallets.
 *
 * No-op if wallet-companion extension is already active (window.WalletCompanion exists).
 */
export function enableWebWallets(options?: WebWalletOptions): void {
	if (_enabled) return;

	// Don't compete with wallet-companion extension
	if (typeof (globalThis as any).WalletCompanion !== 'undefined') {
		return;
	}

	_opts = { ..._opts, ...options };

	const api: DigitalWalletsAPI = {
		register(wallet: WebWalletDescriptor) {
			registerWallet(wallet);
		},
		unregister(walletId: string) {
			unregisterWallet(walletId);
		},
		list() {
			return getRegisteredWallets();
		},
		supportsProtocol(protocol: string) {
			return getRegisteredWallets().some((w) => w.protocols.includes(protocol));
		},
	};

	Object.defineProperty(globalThis, 'DigitalWallets', {
		value: Object.freeze(api),
		writable: false,
		configurable: true,
	});

	_enabled = true;
}

/**
 * Remove the window.DigitalWallets API.
 */
export function disableWebWallets(): void {
	if (!_enabled) return;
	delete (globalThis as any).DigitalWallets;
	_enabled = false;
}

/**
 * Check if web wallet support is active.
 */
export function isWebWalletsEnabled(): boolean {
	return _enabled;
}

// ─── Wallet Selector (minimal built-in UI) ──────────────────────────────────

/**
 * Show a wallet selector dialog. Returns the selected wallet or null if cancelled.
 *
 * Used by the polyfill when multiple wallets match a request and showSelector is true.
 */
export async function selectWallet(
	wallets: RegisteredWallet[],
	protocol: string,
): Promise<RegisteredWallet | null> {
	if (_opts.customSelector) {
		return _opts.customSelector(wallets, protocol);
	}

	if (wallets.length === 1) {
		return wallets[0];
	}

	return _showBuiltinSelector(wallets);
}

/**
 * Minimal modal wallet selector — no framework dependencies.
 * Creates a dialog element with wallet buttons.
 */
function _showBuiltinSelector(wallets: RegisteredWallet[]): Promise<RegisteredWallet | null> {
	return new Promise((resolve) => {
		const dialog = document.createElement('dialog');
		dialog.setAttribute('aria-label', 'Select a wallet');
		dialog.style.cssText = `
			border: none; border-radius: 12px; padding: 24px;
			max-width: 360px; width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
			font-family: system-ui, -apple-system, sans-serif;
		`;

		const title = document.createElement('h2');
		title.textContent = 'Select a wallet';
		title.style.cssText = 'margin: 0 0 16px; font-size: 18px;';
		dialog.appendChild(title);

		const list = document.createElement('div');
		list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

		for (const wallet of wallets) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.style.cssText = `
				display: flex; align-items: center; gap: 12px;
				padding: 12px 16px; border: 1px solid #ddd; border-radius: 8px;
				background: white; cursor: pointer; width: 100%; text-align: left;
				font-size: 15px; transition: background 0.15s;
			`;
			btn.onmouseenter = () => { btn.style.background = '#f5f5f5'; };
			btn.onmouseleave = () => { btn.style.background = 'white'; };

			if (wallet.icon) {
				const img = document.createElement('img');
				img.src = wallet.icon;
				img.alt = '';
				img.width = 32;
				img.height = 32;
				img.style.cssText = 'border-radius: 6px;';
				btn.appendChild(img);
			}

			const label = document.createElement('span');
			label.textContent = wallet.name;
			btn.appendChild(label);

			btn.onclick = () => { cleanup(); resolve(wallet); };
			list.appendChild(btn);
		}

		dialog.appendChild(list);

		const cancelBtn = document.createElement('button');
		cancelBtn.type = 'button';
		cancelBtn.textContent = 'Cancel';
		cancelBtn.style.cssText = `
			margin-top: 16px; padding: 8px 16px; border: none;
			background: transparent; cursor: pointer; color: #666;
			font-size: 14px; width: 100%;
		`;
		cancelBtn.onclick = () => { cleanup(); resolve(null); };
		dialog.appendChild(cancelBtn);

		dialog.onclose = () => { cleanup(); resolve(null); };

		function cleanup() {
			dialog.close();
			dialog.remove();
		}

		document.body.appendChild(dialog);
		dialog.showModal();
	});
}
