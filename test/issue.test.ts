import { describe, it, expect, vi, afterEach } from 'vitest';
import { issueCredential } from '../src/issue.js';
import { OID4VCI_PROTOCOLS } from '../src/protocols.js';

const OFFER = {
	credential_issuer: 'https://issuer.example',
	credential_configuration_ids: ['org.iso.18013.5.1.mDL'],
};

describe('issueCredential', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('calls navigator.credentials.create with the digital issuance options', async () => {
		const createMock = vi.fn(async () => ({ protocol: OID4VCI_PROTOCOLS.V1, data: { ok: true } }));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		const result = await issueCredential(OID4VCI_PROTOCOLS.V1, OFFER);

		expect(createMock).toHaveBeenCalledWith({
			digital: { requests: [{ protocol: OID4VCI_PROTOCOLS.V1, data: OFFER }] },
		});
		expect(result).toEqual({ protocol: OID4VCI_PROTOCOLS.V1, data: { ok: true } });
	});

	it('passes an AbortSignal through when given', async () => {
		const createMock = vi.fn(async () => ({ protocol: OID4VCI_PROTOCOLS.V1, data: {} }));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });
		const controller = new AbortController();

		await issueCredential(OID4VCI_PROTOCOLS.V1, OFFER, { signal: controller.signal });

		expect(createMock).toHaveBeenCalledWith(
			expect.objectContaining({ signal: controller.signal }),
		);
	});

	it('omits signal when no AbortSignal is given', async () => {
		const createMock = vi.fn(async () => ({ protocol: OID4VCI_PROTOCOLS.V1, data: {} }));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		await issueCredential(OID4VCI_PROTOCOLS.V1, OFFER);

		expect(createMock.mock.calls[0][0]).not.toHaveProperty('signal');
	});

	it('falls back to the requested protocol when the response omits one', async () => {
		const createMock = vi.fn(async () => ({ data: { ok: true } }));
		vi.stubGlobal('navigator', { credentials: { create: createMock } });

		const result = await issueCredential(OID4VCI_PROTOCOLS.V1, OFFER);

		expect(result).toEqual({ protocol: OID4VCI_PROTOCOLS.V1, data: { ok: true } });
	});

	it('throws NotAllowedError when create() resolves with null', async () => {
		vi.stubGlobal('navigator', { credentials: { create: vi.fn(async () => null) } });

		await expect(issueCredential(OID4VCI_PROTOCOLS.V1, OFFER)).rejects.toMatchObject({
			name: 'NotAllowedError',
		});
	});

	it('propagates a DOMException raised by the platform', async () => {
		vi.stubGlobal('navigator', {
			credentials: {
				create: vi.fn(async () => {
					throw new DOMException('nope', 'NotSupportedError');
				}),
			},
		});

		await expect(issueCredential(OID4VCI_PROTOCOLS.V1, OFFER)).rejects.toMatchObject({
			name: 'NotSupportedError',
		});
	});
});
