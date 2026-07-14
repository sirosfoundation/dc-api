# @sirosfoundation/dc-api

[![npm version](https://img.shields.io/npm/v/@sirosfoundation/dc-api)](https://www.npmjs.com/package/@sirosfoundation/dc-api)
[![CI](https://github.com/sirosfoundation/dc-api/actions/workflows/ci.yml/badge.svg)](https://github.com/sirosfoundation/dc-api/actions/workflows/ci.yml)
[![CodeQL](https://github.com/sirosfoundation/dc-api/actions/workflows/codeql.yml/badge.svg)](https://github.com/sirosfoundation/dc-api/actions/workflows/codeql.yml)
[![License: BSD-2-Clause](https://img.shields.io/badge/License-BSD--2--Clause-blue.svg)](https://opensource.org/licenses/BSD-2-Clause)

W3C Digital Credentials API toolkit for OpenID4VP.

Zero-dependency, backend-agnostic library providing:

- **Protocol constants** — versioned OpenID4VP protocol identifiers per the W3C DC API spec
- **Feature detection** — check DC API availability and protocol support
- **Native DC API invocation** — call `navigator.credentials.get()` with proper parameters
- **Error helpers** — classify errors and generate user-friendly messages
- **Protocol polyfill** — shim OpenID4VP support in browsers lacking native protocol handling
- **Web wallet support** — enable web wallets to self-register without a browser extension

## Modules

| Import path | Description |
|-------------|-------------|
| `@sirosfoundation/dc-api` | Core: constants, detection, native invocation, errors |
| `@sirosfoundation/dc-api/polyfill` | Protocol polyfill: shims `navigator.credentials.get()` for OpenID4VP |
| `@sirosfoundation/dc-api/web-wallets` | Web wallet self-registration API (`window.DigitalWallets`) |
| `@sirosfoundation/dc-api/bundle` | Pre-built ESM bundle of core (for importmaps) |
| `@sirosfoundation/dc-api/polyfill/bundle` | Pre-built ESM bundle of polyfill |
| `@sirosfoundation/dc-api/web-wallets/bundle` | Pre-built ESM bundle of web-wallets |

## Install

```sh
npm install @sirosfoundation/dc-api
```

## Usage

### Core: Requesting credentials natively

```ts
import {
  isDCAPIAvailable,
  getBestProtocol,
  requestCredential,
  isUserCancel,
} from '@sirosfoundation/dc-api';

const protocol = getBestProtocol(); // "openid4vp-v1-signed" (preferred)

if (protocol) {
  try {
    const result = await requestCredential(protocol, {
      request: signedJWT, // JAR for "openid4vp-v1-signed"
    });
    await submitToBackend(result.data);
  } catch (err) {
    if (isUserCancel(err)) {
      showAlternativeFlow();
    } else {
      throw err;
    }
  }
} else {
  showQRCode(); // No DC API support
}
```

### Polyfill: OpenID4VP on browsers without native support

```ts
import { installPolyfill, registerWallet } from '@sirosfoundation/dc-api/polyfill';

installPolyfill();
registerWallet({
  id: 'sirosid',
  name: 'SIROS ID Wallet',
  url: 'https://wallet.siros.org/dc-api',
  protocols: ['openid4vp-v1-signed'],
});

// Now the standard DC API call works even without native protocol support:
const credential = await navigator.credentials.get({
  digital: { requests: [{ protocol: "openid4vp-v1-signed", data: { request: jwt } }] }
});
```

When the native DC API supports the requested protocol, the polyfill delegates transparently. When it doesn't, the polyfill opens the registered wallet in a popup and handles the request/response via `postMessage`.

### Web Wallets: Self-registration without an extension

```ts
import { installPolyfill } from '@sirosfoundation/dc-api/polyfill';
import { enableWebWallets } from '@sirosfoundation/dc-api/web-wallets';

installPolyfill();
enableWebWallets();

// Web wallets can now self-register:
window.DigitalWallets.register({
  id: 'my-wallet',
  name: 'My Wallet',
  url: 'https://wallet.example.com/dc-api',
  protocols: ['openid4vp-v1-signed'],
  icon: 'https://wallet.example.com/icon.svg',
});
```

If the [wallet-companion](https://github.com/sirosfoundation/wallet-companion) browser extension is already installed, `enableWebWallets()` is a no-op.

## API Reference

### Protocol Constants

```ts
OID4VP_PROTOCOLS.UNSIGNED     // "openid4vp-v1-unsigned"
OID4VP_PROTOCOLS.SIGNED       // "openid4vp-v1-signed"
OID4VP_PROTOCOLS.MULTISIGNED  // "openid4vp-v1-multisigned"
OID4VP_PROTOCOLS.LEGACY       // "openid4vp"

OID4VP_SPEC_PROTOCOLS         // [UNSIGNED, SIGNED, MULTISIGNED]
OID4VP_ALL_PROTOCOLS          // [UNSIGNED, SIGNED, MULTISIGNED, LEGACY]
isOID4VPProtocol(value)       // Type guard
```

### Detection

| Function | Description |
|---|---|
| `isDCAPIAvailable()` | `true` when `DigitalCredential` is defined |
| `isProtocolAllowed(protocol)` | Delegates to `DigitalCredential.userAgentAllowsProtocol()` |
| `getBestProtocol(preference?)` | First allowed protocol (default: signed > multisigned > unsigned) |

### Request

| Function | Description |
|---|---|
| `requestCredential(protocol, data, options?)` | Native DC API call, returns `{ protocol, data }` |

### Error Helpers

| Function | Description |
|---|---|
| `getUserFriendlyErrorMessage(error)` | Human-readable message for DC API errors |
| `isUserCancel(error)` | `true` for `NotAllowedError` / `AbortError` |
| `isProtocolUnsupported(error)` | `true` for `NotSupportedError` |

### Polyfill

| Function | Description |
|---|---|
| `installPolyfill(options?)` | Override `navigator.credentials.get()` for OpenID4VP |
| `uninstallPolyfill()` | Restore original behavior |
| `registerWallet(wallet)` | Register a wallet endpoint |
| `unregisterWallet(id)` | Remove a registered wallet |
| `getRegisteredWallets()` | List registered wallets |

### Web Wallets

| Function | Description |
|---|---|
| `enableWebWallets(options?)` | Expose `window.DigitalWallets` API |
| `disableWebWallets()` | Remove the API |
| `selectWallet(wallets, protocol)` | Show wallet selector (built-in or custom) |

## Design Principles

- **Zero dependencies** — no runtime dependencies
- **Backend-agnostic** — no knowledge of specific verifier or wallet endpoints
- **Spec-aligned** — uses the W3C DC API spec's detection and invocation patterns
- **Progressive** — core works standalone; polyfill and web-wallets are opt-in layers
- **Extension-compatible** — no-ops when wallet-companion handles the flow

## Related

- [wallet-companion](https://github.com/sirosfoundation/wallet-companion) — browser extension for DC API + web wallet routing
- [WE BUILD CS-007](https://github.com/webuild-consortium/wp4-architecture/pull/246) — conformance specification for DC API presentation

## References

- [W3C Digital Credentials API](https://w3c-fedid.github.io/digital-credentials/)
- [OpenID4VP (DC API profile)](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
- [DC API Ecosystem Support](https://digitalcredentials.dev/ecosystem-support)

## License

BSD-2-Clause
