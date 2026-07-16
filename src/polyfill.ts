/**
 * DC API Protocol Polyfill — shims OpenID4VP protocol support in browsers
 * that have the DC API but lack native openid4vp-v1-* protocol handling.
 *
 * Scenario: Safari 26+ exposes navigator.credentials.get({ digital: ... })
 * but only routes `org-iso-mdoc`. Chrome on some platforms may not yet route
 * OpenID4VP to installed wallets. This polyfill fills the gap.
 *
 * What it does:
 *   1. Overrides navigator.credentials.get() to intercept digital requests
 *   2. If native DC API supports the requested protocol → delegates to native
 *   3. If not → opens a registered wallet in a popup, relays the request via
 *      URL params, and collects the response via postMessage
 *   4. Shims DigitalCredential.userAgentAllowsProtocol() to report the
 *      polyfilled protocols as available
 *
 * What it does NOT do:
 *   - Does NOT inject anything into wallet pages (that's wallet-companion's job)
 *   - Does NOT handle non-digital credential requests (passkeys, fedcm, etc.)
 *
 * Usage:
 *
 *   import { installPolyfill, registerWallet } from '@sirosfoundation/dc-api/polyfill';
 *
 *   installPolyfill();
 *   registerWallet({
 *     id: 'sirosid',
 *     name: 'SIROS ID Wallet',
 *     url: 'https://wallet.siros.org/dc-api',
 *     protocols: ['openid4vp-v1-signed', 'openid4vp-v1-unsigned'],
 *   });
 *
 *   // Then use the standard DC API — polyfill is transparent:
 *   const credential = await navigator.credentials.get({
 *     digital: { requests: [{ protocol: "openid4vp-v1-signed", data: { request: jwt } }] }
 *   });
 *
 * Wallet popup contract:
 *   The wallet URL is opened with query params:
 *     ?request_id=<uuid>&protocol=<id>&client_id=<origin>&request=<jwt>
 *   (for unsigned: individual OID4VP params instead of request=)
 *
 *   The wallet must:
 *   1. postMessage({ type: 'WC_ORIGIN_CHECK', requestId }) to window.opener
 *   2. Wait for { type: 'WC_ORIGIN_ACK', requestId } reply
 *   3. Validate opener origin matches client_id from URL
 *   4. Process the request, obtain holder consent
 *   5. postMessage({ type: 'WC_WALLET_RESPONSE', requestId, response: {...} })
 *      or { type: 'WC_WALLET_RESPONSE', requestId, error: "user_cancelled" }
 */

// DigitalCredential is declared in dc-api.d.ts as potentially undefined.
// The polyfill may define it at runtime if missing.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RegisteredWallet {
	/** Unique identifier */
	id: string;
	/** Human-readable name */
	name: string;
	/** URL to open for credential requests (popup target) */
	url: string;
	/** Protocol identifiers this wallet supports */
	protocols: string[];
	/** Optional icon URL */
	icon?: string;
}

export interface PolyfillOptions {
	/**
	 * Timeout for wallet response (ms). Default: 300000 (5 min).
	 */
	timeoutMs?: number;
	/**
	 * If true (default), delegate to native DC API when it supports the protocol.
	 * Set false to always use polyfill path (testing).
	 */
	preferNative?: boolean;
	/**
	 * Popup window features string. Default: 'popup=yes,width=480,height=700'.
	 */
	popupFeatures?: string;
}

// ─── State ───────────────────────────────────────────────────────────────────

const _wallets: RegisteredWallet[] = [];
let _installed = false;
let _originalGet: typeof navigator.credentials.get | null = null;
let _originalCreate: typeof navigator.credentials.create | null = null;
let _originalUAP: ((protocol: string) => boolean) | null = null;
let _polyfillCreatedDC = false;
let _opts: Required<PolyfillOptions> = {
	timeoutMs: 300000,
	preferNative: true,
	popupFeatures: 'popup=yes,width=480,height=700',
};

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Register a wallet endpoint that can handle DC API requests.
 */
export function registerWallet(wallet: RegisteredWallet): void {
	const idx = _wallets.findIndex((w) => w.id === wallet.id);
	if (idx >= 0) _wallets[idx] = wallet;
	else _wallets.push(wallet);
}

/**
 * Remove a registered wallet.
 */
export function unregisterWallet(walletId: string): void {
	const idx = _wallets.findIndex((w) => w.id === walletId);
	if (idx >= 0) _wallets.splice(idx, 1);
}

/**
 * Get registered wallets (read-only snapshot).
 */
export function getRegisteredWallets(): readonly RegisteredWallet[] {
	return [..._wallets];
}

/**
 * Install the polyfill. Idempotent.
 *
 * After this call:
 *   - navigator.credentials.get() handles { digital: { requests: [...] } }
 *     for protocols registered via registerWallet()
 *   - navigator.credentials.create() handles { digital: { requests: [...] } }
 *     for issuance protocols (openid4vci-v1)
 *   - DigitalCredential.userAgentAllowsProtocol() reports those protocols
 */
export function installPolyfill(options?: PolyfillOptions): void {
	if (_installed) return;
	_opts = { ..._opts, ...options };

	_originalGet = navigator.credentials.get.bind(navigator.credentials);
	navigator.credentials.get = _polyfillGet as typeof navigator.credentials.get;

	_originalCreate = navigator.credentials.create.bind(navigator.credentials);
	navigator.credentials.create = _polyfillCreate as typeof navigator.credentials.create;

	_shimUserAgentAllowsProtocol();
	_installed = true;
}

/**
 * Remove the polyfill and restore original behavior.
 */
export function uninstallPolyfill(): void {
	if (!_installed) return;
	if (_originalGet) {
		navigator.credentials.get = _originalGet;
		_originalGet = null;
	}
	if (_originalCreate) {
		navigator.credentials.create = _originalCreate;
		_originalCreate = null;
	}
	_restoreUserAgentAllowsProtocol();
	_installed = false;
}

/**
 * Check if polyfill is active.
 */
export function isPolyfillInstalled(): boolean {
	return _installed;
}

// ─── DigitalCredential.userAgentAllowsProtocol shim ──────────────────────────

function _polyfillProtocols(): Set<string> {
	const s = new Set<string>();
	for (const w of _wallets) {
		for (const p of w.protocols) s.add(p);
	}
	return s;
}

function _shimUserAgentAllowsProtocol(): void {
	// typeof is required: DigitalCredential may not exist as a runtime binding
	if (typeof DigitalCredential === 'undefined') { // NOSONAR
		// No DC API at all — define minimal global
		(globalThis as any).DigitalCredential = {
			userAgentAllowsProtocol: (protocol: string) => _polyfillProtocols().has(protocol),
		};
		_originalUAP = null;
		_polyfillCreatedDC = true;
	} else {
		// DC API exists — wrap its userAgentAllowsProtocol
		_originalUAP = (DigitalCredential as any).userAgentAllowsProtocol ?? null;
		(DigitalCredential as any).userAgentAllowsProtocol = (protocol: string) => {
			if (_polyfillProtocols().has(protocol)) return true;
			return _originalUAP?.(protocol) ?? false;
		};
		_polyfillCreatedDC = false;
	}
}

function _restoreUserAgentAllowsProtocol(): void {
	if (_polyfillCreatedDC) {
		// We created the global — remove it entirely
		delete (globalThis as any).DigitalCredential;
		_polyfillCreatedDC = false;
	} else if (_originalUAP) {
		(DigitalCredential as any).userAgentAllowsProtocol = _originalUAP;
		_originalUAP = null;
	}
}

// ─── navigator.credentials.get() override ────────────────────────────────────

type DigitalOpts = CredentialRequestOptions & {
	digital?: { requests: Array<{ protocol: string; data: unknown }> };
};

async function _polyfillGet(options?: DigitalOpts): Promise<Credential | null> {
	const requests = options?.digital?.requests;

	// Not a digital credential request — pass through
	if (!requests || requests.length === 0) {
		return _originalGet!(options);
	}

	// If preferNative, try native first
	if (_opts.preferNative) {
		const nativeResult = await _tryNative(requests, options);
		if (nativeResult) return nativeResult;
	}

	// Polyfill path: find a wallet that handles a requested protocol
	const match = _matchWallet(requests);
	if (!match) {
		throw new DOMException(
			'No digital credential provider supports the requested protocol',
			'NotAllowedError',
		);
	}

	const response = await _invokeWalletPopup(match.wallet, match.request);
	return _toCredential(match.request.protocol, response);
}

/**
 * Attempt native DC API for protocols it supports.
 * Returns null if native can't handle or fails gracefully.
 */
async function _tryNative(
	requests: Array<{ protocol: string; data: unknown }>,
	options: DigitalOpts | undefined,
): Promise<Credential | null> {
	const nativeSupported = requests.filter((r) => _nativeSupports(r.protocol));
	if (nativeSupported.length === 0) return null;

	try {
		const nativeOpts = { ...options, digital: { requests: nativeSupported } } as CredentialRequestOptions;
		const result = await _originalGet!(nativeOpts);
		if (result) return result;
	} catch (err: any) {
		if (err.name !== 'NotSupportedError' && err.name !== 'NotAllowedError') {
			throw err;
		}
	}
	return null;
}

/**
 * Check if the NATIVE DC API (not our shim) supports a protocol.
 */
function _nativeSupports(protocol: string): boolean {
	if (!_originalUAP) return false;
	return _originalUAP(protocol);
}

function _matchWallet(
	requests: Array<{ protocol: string; data: unknown }>,
): { wallet: RegisteredWallet; request: { protocol: string; data: unknown } } | null {
	for (const req of requests) {
		const w = _wallets.find((w) => w.protocols.includes(req.protocol));
		if (w) return { wallet: w, request: req };
	}
	return null;
}

// ─── Wallet popup + postMessage handshake ────────────────────────────────────

async function _invokeWalletPopup(
	wallet: RegisteredWallet,
	request: { protocol: string; data: unknown },
): Promise<unknown> {
	const requestId = crypto.randomUUID();
	const url = _buildUrl(wallet, request, requestId);
	const walletOrigin = new URL(wallet.url).origin;

	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			cleanup();
			reject(new DOMException('Wallet response timeout', 'AbortError'));
		}, _opts.timeoutMs);

		const popup = window.open(url, '_blank', _opts.popupFeatures);
		if (!popup) {
			clearTimeout(timeout);
			reject(new DOMException('Popup blocked', 'NotAllowedError'));
			return;
		}

		const closePoll = setInterval(() => {
			if (popup.closed) {
				cleanup();
				reject(new DOMException('User closed wallet', 'NotAllowedError'));
			}
		}, 500);

		function onMessage(event: MessageEvent) {
			if (event.source !== popup) return;

			// Wallet ready handshake
			if (event.data?.type === 'WC_ORIGIN_CHECK' && event.data.requestId === requestId) {
				popup!.postMessage({ type: 'WC_ORIGIN_ACK', requestId }, walletOrigin);
				return;
			}

			// Wallet response
			if (event.data?.type === 'WC_WALLET_RESPONSE' && event.data.requestId === requestId) {
				if (event.origin !== walletOrigin) return;
				cleanup();
				if (event.data.error) {
					reject(new DOMException(event.data.error, 'NotAllowedError'));
				} else {
					resolve(event.data.response);
				}
			}
		}

		function cleanup() {
			clearTimeout(timeout);
			clearInterval(closePoll);
			window.removeEventListener('message', onMessage);
			try { popup?.close(); } catch { /* popup may already be closed */ }
		}

		window.addEventListener('message', onMessage);
	});
}

function _buildUrl(
	wallet: RegisteredWallet,
	request: { protocol: string; data: unknown },
	requestId: string,
): string {
	const url = new URL(wallet.url);
	url.searchParams.set('request_id', requestId);
	url.searchParams.set('protocol', request.protocol);
	url.searchParams.set('client_id', window.location.origin);

	const data = request.data as Record<string, unknown> | undefined;
	if (!data) return url.toString();

	// Signed request (JAR): pass via URL fragment to avoid server logs / Referer leakage
	if (typeof data.request === 'string') {
		url.hash = data.request;
		return url.toString();
	}

	// Unsigned request: individual params
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null) continue;
		const serialized = typeof value === 'object'
			? JSON.stringify(value)
			: String(value);
		url.searchParams.set(key, serialized);
	}
	return url.toString();
}

// ─── navigator.credentials.create() override (issuance) ─────────────────────

type DigitalCreateOpts = CredentialCreationOptions & {
	digital?: { requests: Array<{ protocol: string; data: unknown }> };
};

async function _polyfillCreate(options?: DigitalCreateOpts): Promise<Credential | null> {
	const requests = options?.digital?.requests;

	// Not a digital credential issuance request — pass through
	if (!requests || requests.length === 0) {
		return _originalCreate!(options);
	}

	// If preferNative, try native for protocols it supports
	if (_opts.preferNative) {
		const nativeSupported = requests.filter((r) => _nativeSupports(r.protocol));
		if (nativeSupported.length > 0) {
			try {
				const nativeOpts = { ...options, digital: { requests: nativeSupported } } as CredentialCreationOptions;
				const result = await _originalCreate!(nativeOpts);
				if (result) return result;
			} catch (err: any) {
				if (err.name !== 'NotSupportedError' && err.name !== 'NotAllowedError') {
					throw err;
				}
			}
		}
	}

	// Polyfill path: find a wallet that handles the issuance protocol
	const match = _matchWallet(requests);
	if (!match) {
		throw new DOMException(
			'No digital credential provider supports the requested issuance protocol',
			'NotAllowedError',
		);
	}

	const response = await _invokeWalletPopup(match.wallet, match.request);
	return _toCredential(match.request.protocol, response);
}

// ─── Response shaping ────────────────────────────────────────────────────────

function _toCredential(protocol: string, data: unknown): Credential & { protocol: string; data: unknown } {
	const cred = {
		type: 'digital' as const,
		id: '' as const,
		protocol,
		data,
		toJSON() { return { type: 'digital', protocol, data }; },
	};
	return cred as unknown as Credential & { protocol: string; data: unknown };
}
