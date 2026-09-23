import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	buildRequestData,
	requestCredentialFromAuthorizationRequestURI,
} from '../src/authorization-request.js';
import { OID4VP_PROTOCOLS } from '../src/protocols.js';

function makeJwt(payload: Record<string, unknown>): string {
	const b64url = (obj: Record<string, unknown>) =>
		btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	return `${b64url({ alg: 'ES256', typ: 'oauth-authz-req+jwt' })}.${b64url(payload)}.sig`;
}

describe('buildRequestData', () => {
	it('uses an inline request param directly for signed protocol', async () => {
		const jwt = makeJwt({ nonce: 'abc' });
		const uri = `openid4vp://cb?client_id=x&request=${encodeURIComponent(jwt)}`;
		const data = await buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri);
		expect(data).toEqual({ request: jwt });
	});

	it('fetches request_uri and uses the raw JWT body for signed protocol', async () => {
		const jwt = makeJwt({ nonce: 'abc' });
		const fetchFn = vi.fn(async () => new Response(jwt, { status: 200 }));
		const uri = 'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1';
		const data = await buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri, { fetchFn });
		expect(data).toEqual({ request: jwt });
		expect(fetchFn).toHaveBeenCalledWith('https://verifier.example/request-object?id=1');
	});

	it('fetches request_uri and unwraps a JSON-string-wrapped JWT body', async () => {
		const jwt = makeJwt({ nonce: 'abc' });
		const fetchFn = vi.fn(async () => new Response(JSON.stringify(jwt), { status: 200 }));
		const uri = 'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1';
		const data = await buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri, { fetchFn });
		expect(data).toEqual({ request: jwt });
	});

	it('throws for signed protocol when neither request nor request_uri is present', async () => {
		await expect(
			buildRequestData(OID4VP_PROTOCOLS.SIGNED, 'openid4vp://cb?client_id=x'),
		).rejects.toThrow(/neither 'request' nor 'request_uri'/);
	});

	it('throws when request_uri fetch fails', async () => {
		const fetchFn = vi.fn(async () => new Response('nope', { status: 500 }));
		const uri = 'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1';
		await expect(buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri, { fetchFn })).rejects.toThrow(/HTTP 500/);
	});

	it('decodes the JWT payload as unsigned params when only request_uri is present', async () => {
		const jwt = makeJwt({ response_type: 'vp_token', nonce: 'abc123', dcql_query: { credentials: [] } });
		const fetchFn = vi.fn(async () => new Response(jwt, { status: 200 }));
		const uri = 'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1';
		const data = await buildRequestData(OID4VP_PROTOCOLS.UNSIGNED, uri, { fetchFn });
		expect(data).toEqual({ response_type: 'vp_token', nonce: 'abc123', dcql_query: { credentials: [] } });
	});

	it('decodes an inline signed request JWT payload for unsigned protocol', async () => {
		const jwt = makeJwt({ nonce: 'xyz' });
		const uri = `openid4vp://cb?client_id=x&request=${encodeURIComponent(jwt)}`;
		const data = await buildRequestData(OID4VP_PROTOCOLS.UNSIGNED, uri);
		expect(data).toEqual({ nonce: 'xyz' });
	});

	it('uses the URI query params directly for unsigned when neither request nor request_uri is present', async () => {
		const uri = 'openid4vp://cb?client_id=x&nonce=abc&response_type=vp_token';
		const data = await buildRequestData(OID4VP_PROTOCOLS.UNSIGNED, uri);
		expect(data).toEqual({ nonce: 'abc', response_type: 'vp_token' });
	});

	it('JSON-parses unsigned query param values that look like JSON', async () => {
		const uri = `openid4vp://cb?client_id=x&dcql_query=${encodeURIComponent(JSON.stringify({ credentials: [] }))}`;
		const data = await buildRequestData(OID4VP_PROTOCOLS.UNSIGNED, uri);
		expect(data).toEqual({ dcql_query: { credentials: [] } });
	});

	it('throws for a malformed JWT (fewer than 2 segments)', async () => {
		const uri = 'openid4vp://cb?client_id=x&request=not-a-jwt';
		await expect(buildRequestData(OID4VP_PROTOCOLS.UNSIGNED, uri)).rejects.toThrow(/Not a valid JWT/);
	});
});

describe('requestCredentialFromAuthorizationRequestURI', () => {
	afterEach(() => {
		// @ts-expect-error — cleaning up global stub
		delete globalThis.DigitalCredential;
		vi.unstubAllGlobals();
	});

	it('returns null when no protocol is supported (no DC API)', async () => {
		const result = await requestCredentialFromAuthorizationRequestURI(
			'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1',
		);
		expect(result).toBeNull();
	});

	it('builds data and invokes navigator.credentials.get for the best supported protocol', async () => {
		// @ts-expect-error — stubbing global
		globalThis.DigitalCredential = {
			userAgentAllowsProtocol: (p: string) => p === OID4VP_PROTOCOLS.SIGNED,
		};
		const jwt = makeJwt({ nonce: 'abc' });
		const getMock = vi.fn(async (opts: any) => ({
			protocol: opts.digital.requests[0].protocol,
			data: { redirect_uri: 'https://example.com/cb' },
		}));
		vi.stubGlobal('navigator', { credentials: { get: getMock } });

		const uri = `openid4vp://cb?client_id=x&request=${encodeURIComponent(jwt)}`;
		const result = await requestCredentialFromAuthorizationRequestURI(uri);

		expect(getMock).toHaveBeenCalledWith(
			expect.objectContaining({
				digital: { requests: [{ protocol: OID4VP_PROTOCOLS.SIGNED, data: { request: jwt } }] },
			}),
		);
		expect(result).toEqual({ protocol: OID4VP_PROTOCOLS.SIGNED, data: { redirect_uri: 'https://example.com/cb' } });
	});
});

// Regression for #22. AuthorizationRequestOptions accepts `signal` and it
// reached requestCredential(), but buildRequestData() was called with only
// `fetchFn` picked out of it, so the request_uri fetch - the FIRST thing that
// happens for a JAR request, and the common case - was never abortable.
describe('signal threading into the request_uri fetch', () => {
	const uri =
		'openid4vp://cb?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest-object%3Fid%3D1';

	it('passes the signal to the request_uri fetch', async () => {
		const controller = new AbortController();
		const fetchFn = vi.fn(async () => new Response(makeJwt({ nonce: 'abc' }), { status: 200 }));

		await buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri, {
			fetchFn,
			signal: controller.signal,
		});

		expect(fetchFn).toHaveBeenCalledWith('https://verifier.example/request-object?id=1', {
			signal: controller.signal,
		});
	});

	it('aborts a request_uri fetch that is already in flight', async () => {
		const controller = new AbortController();

		// A fetch that only ever settles by being aborted - i.e. exactly the
		// window the old code could not interrupt.
		const fetchFn = vi.fn(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
						once: true,
					});
				}),
		) as unknown as typeof fetch;

		const pending = buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri, {
			fetchFn,
			signal: controller.signal,
		});

		controller.abort();

		await expect(pending).rejects.toThrow(/abort/i);
	});

	// The UNSIGNED path fetches request_uri too, and the first cut of the #22
	// fix only threaded the signal through the SIGNED/MULTISIGNED branch.
	it('passes the signal on the unsigned request_uri path as well', async () => {
		const controller = new AbortController();
		const fetchFn = vi.fn(async () => new Response(makeJwt({ nonce: 'abc' }), { status: 200 }));

		await buildRequestData(OID4VP_PROTOCOLS.UNSIGNED, uri, {
			fetchFn,
			signal: controller.signal,
		});

		expect(fetchFn).toHaveBeenCalledWith('https://verifier.example/request-object?id=1', {
			signal: controller.signal,
		});
	});

	it('still calls fetch with a single argument when no signal is given', async () => {
		const fetchFn = vi.fn(async () => new Response(makeJwt({ nonce: 'abc' }), { status: 200 }));
		await buildRequestData(OID4VP_PROTOCOLS.SIGNED, uri, { fetchFn });
		expect(fetchFn).toHaveBeenCalledWith('https://verifier.example/request-object?id=1');
	});
});
