/**
 * W3C Digital Credentials API type declarations.
 *
 * These types are not yet in lib.dom.d.ts. This file provides the
 * minimal declarations needed to compile against the DC API.
 *
 * See: https://w3c-fedid.github.io/digital-credentials/
 */

interface DigitalCredentialStatic {
	userAgentAllowsProtocol(protocol: string): boolean;
}

declare const DigitalCredential: DigitalCredentialStatic | undefined;

interface DigitalCredentialRequestOptions {
	requests: Array<{
		protocol: string;
		data: object;
	}>;
}

interface CredentialRequestOptions {
	digital?: DigitalCredentialRequestOptions;
	signal?: AbortSignal;
}
