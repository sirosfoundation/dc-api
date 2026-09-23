import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	buildIssuanceRequestData,
	issueCredentialFromOffer,
} from '../src/credential-offer.js';
import { OID4VCI_PROTOCOLS } from '../src/protocols.js';

const OFFER = {
	credential_issuer: 'https://issuer.example',
	credential_configuration_ids: ['org.iso.18013.5.1.mDL'],
	grants: {
		'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
			'pre-authorized_code': 'abc123',
		},
	},
};

function byValueUri(offer: unknown): string {
	return `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offer))}`;
}

function byReferenceUri(url: string): string {
	return `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(url)}`;
}

describe('buildIssuanceRequestData', () => {
	it('unwraps a by-value openid-credential-offer:// URI', async () => {
		const data = await buildIssuanceRequestData(byValueUri(OFFER));
		expect(data).toEqual(OFFER);
	});

	it('unwraps a by-value offer carried on an https: URI too', async () => {
		const uri = `https://issuer.example/offer?credential_offer=${encodeURIComponent(JSON.stringify(OFFER))}`;
		expect(await buildIssuanceRequestData(uri)).toEqual(OFFER);
	});

	it('unwraps a bare query string with no scheme', async () => {
		const bare = `credential_offer=${encodeURIComponent(JSON.stringify(OFFER))}`;
		expect(await buildIssuanceRequestData(bare)).toEqual(OFFER);
	});

	it('fetches a by-reference credential_offer_uri and uses its JSON body', async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(OFFER), { status: 200 }));
		const uri = byReferenceUri('https://issuer.example/offers/1');

		const data = await buildIssuanceRequestData(uri, { fetchFn });

		expect(data).toEqual(OFFER);
		expect(fetchFn).toHaveBeenCalledWith('https://issuer.example/offers/1');
	});

	it('throws when the credential_offer_uri fetch fails', async () => {
		const fetchFn = vi.fn(async () => new Response('nope', { status: 500 }));
		await expect(
			buildIssuanceRequestData(byReferenceUri('https://issuer.example/offers/1'), { fetchFn }),
		).rejects.toThrow(/HTTP 500/);
	});

	it('throws when the credential_offer_uri body is not JSON', async () => {
		const fetchFn = vi.fn(async () => new Response('<html>', { status: 200 }));
		await expect(
			buildIssuanceRequestData(byReferenceUri('https://issuer.example/offers/1'), { fetchFn }),
		).rejects.toThrow(/not valid JSON/);
	});

	it('accepts an already-parsed offer object', async () => {
		expect(await buildIssuanceRequestData(OFFER)).toEqual(OFFER);
	});

	it('prefers credential_offer over credential_offer_uri when both are present', async () => {
		const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
		const uri =
			`openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(OFFER))}` +
			`&credential_offer_uri=${encodeURIComponent('https://issuer.example/offers/1')}`;

		expect(await buildIssuanceRequestData(uri, { fetchFn })).toEqual(OFFER);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('throws for an offer URI carrying neither parameter', async () => {
		await expect(buildIssuanceRequestData('openid-credential-offer://?foo=bar')).rejects.toThrow(
			/neither 'credential_offer' nor 'credential_offer_uri'/,
		);
	});

	it('throws when credential_offer is not valid JSON', async () => {
		await expect(
			buildIssuanceRequestData('openid-credential-offer://?credential_offer=not-json'),
		).rejects.toThrow(/not valid JSON/);
	});

	it('throws when the offer is missing credential_issuer', async () => {
		await expect(
			buildIssuanceRequestData(byValueUri({ credential_configuration_ids: ['x'] })),
		).rejects.toThrow(/missing required 'credential_issuer'/);
	});

	it('throws when the offer is missing credential_configuration_ids', async () => {
		await expect(
			buildIssuanceRequestData(byValueUri({ credential_issuer: 'https://issuer.example' })),
		).rejects.toThrow(/missing required 'credential_configuration_ids'/);
	});

	it('throws when the offer is a JSON array rather than an object', async () => {
		await expect(buildIssuanceRequestData(byValueUri([OFFER]))).rejects.toThrow(
			/expected a JSON object/,
		);
	});

	it('refuses a raw JSON string rather than guessing', async () => {
		await expect(buildIssuanceRequestData(JSON.stringify(OFFER))).rejects.toThrow(
			/pass the parsed offer object/,
		);
	});
});

describe('issueCredentialFromOffer', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalWallets;
		vi.unstubAllGlobals();
	});

	it('returns null when issuance cannot be fulfilled', async () => {
		const createMock = vi.fn();
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		expect(await issueCredentialFromOffer(byValueUri(OFFER))).toBeNull();
		expect(createMock).not.toHaveBeenCalled();
	});

	it('does not dereference credential_offer_uri when issuance is unavailable', async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(OFFER), { status: 200 }));

		expect(
			await issueCredentialFromOffer(byReferenceUri('https://issuer.example/offers/1'), { fetchFn }),
		).toBeNull();
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('unwraps the offer and invokes navigator.credentials.create', async () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => p === OID4VCI_PROTOCOLS.V1,
		};
		const createMock = vi.fn(async (opts: any) => ({
			protocol: opts.digital.requests[0].protocol,
			data: { credential: 'issued' },
		}));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		const result = await issueCredentialFromOffer(byValueUri(OFFER));

		expect(createMock).toHaveBeenCalledWith(
			expect.objectContaining({
				digital: { requests: [{ protocol: OID4VCI_PROTOCOLS.V1, data: OFFER }] },
			}),
		);
		expect(result).toEqual({ protocol: OID4VCI_PROTOCOLS.V1, data: { credential: 'issued' } });
	});

	it('proceeds on a polyfill-registered wallet with no native DC API', async () => {
		// @ts-expect-error — stubbing the polyfill's page global
		globalThis.DigitalWallets = {
			supportsProtocol: (p: string) => p === OID4VCI_PROTOCOLS.V1,
		};
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(OFFER), { status: 200 }));
		const createMock = vi.fn(async () => ({ protocol: OID4VCI_PROTOCOLS.V1, data: { ok: true } }));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		const result = await issueCredentialFromOffer(byReferenceUri('https://issuer.example/offers/1'), {
			fetchFn,
		});

		expect(fetchFn).toHaveBeenCalledWith('https://issuer.example/offers/1');
		expect(createMock).toHaveBeenCalledWith(
			expect.objectContaining({
				digital: { requests: [{ protocol: OID4VCI_PROTOCOLS.V1, data: OFFER }] },
			}),
		);
		expect(result).toEqual({ protocol: OID4VCI_PROTOCOLS.V1, data: { ok: true } });
	});

	it('honours a custom protocol option', async () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => p === 'openid4vci-v2',
		};
		const createMock = vi.fn(async () => ({ protocol: 'openid4vci-v2', data: {} }));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		await issueCredentialFromOffer(byValueUri(OFFER), { protocol: 'openid4vci-v2' });

		expect(createMock).toHaveBeenCalledWith(
			expect.objectContaining({
				digital: { requests: [{ protocol: 'openid4vci-v2', data: OFFER }] },
			}),
		);
	});
});

describe('buildIssuanceRequestData — credential_configuration_ids validation', () => {
	it('throws when credential_configuration_ids is empty', async () => {
		await expect(
			buildIssuanceRequestData(
				byValueUri({ credential_issuer: 'https://issuer.example', credential_configuration_ids: [] }),
			),
		).rejects.toThrow(/non-empty array of non-empty strings/);
	});

	it('throws when credential_configuration_ids holds a non-string entry', async () => {
		await expect(
			buildIssuanceRequestData(
				byValueUri({
					credential_issuer: 'https://issuer.example',
					credential_configuration_ids: ['ok', 42],
				}),
			),
		).rejects.toThrow(/non-empty array of non-empty strings/);
	});

	it('throws when credential_configuration_ids holds an empty string', async () => {
		await expect(
			buildIssuanceRequestData(
				byValueUri({
					credential_issuer: 'https://issuer.example',
					credential_configuration_ids: [''],
				}),
			),
		).rejects.toThrow(/non-empty array of non-empty strings/);
	});

	it('throws when credential_issuer is an empty string', async () => {
		await expect(
			buildIssuanceRequestData(
				byValueUri({ credential_issuer: '', credential_configuration_ids: ['x'] }),
			),
		).rejects.toThrow(/missing required 'credential_issuer'/);
	});

	it('accepts a caller-declared interface without a cast', async () => {
		interface TypedOffer {
			credential_issuer: string;
			credential_configuration_ids: string[];
		}
		const typed: TypedOffer = {
			credential_issuer: 'https://issuer.example',
			credential_configuration_ids: ['org.iso.18013.5.1.mDL'],
		};

		// Compiles only because CredentialOffer accepts `object`, not
		// Record<string, unknown> — an interface has no index signature.
		// npm run lint excludes test/, so this half is proven by running tsc
		// over src + test: reverting the type fails with TS2345.
		expect(await buildIssuanceRequestData(typed)).toEqual(typed);
	});
});

describe('buildIssuanceRequestData — parameter presence, not truthiness', () => {
	it('fails an empty credential_offer rather than falling back to credential_offer_uri', async () => {
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(OFFER), { status: 200 }));
		const uri =
			'openid-credential-offer://?credential_offer=' +
			`&credential_offer_uri=${encodeURIComponent('https://issuer.example/offers/1')}`;

		await expect(buildIssuanceRequestData(uri, { fetchFn })).rejects.toThrow(/not valid JSON/);
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('fails an empty credential_offer_uri rather than reporting neither parameter', async () => {
		const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));

		await expect(
			buildIssuanceRequestData('openid-credential-offer://?credential_offer_uri=', { fetchFn }),
		).rejects.toThrow(/'credential_offer_uri' is empty/);
		expect(fetchFn).not.toHaveBeenCalled();
	});
});
