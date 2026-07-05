# @sirosfoundation/dc-api

W3C Digital Credentials API utilities for OpenID4VP.

Zero-dependency, backend-agnostic library providing:

- **Protocol constants** — versioned OpenID4VP protocol identifiers per the W3C DC API spec
- **Feature detection** — check DC API availability and protocol support
- **Native DC API invocation** — call `navigator.credentials.get()` with proper parameters
- **Error helpers** — classify errors and generate user-friendly messages

## Install

```sh
npm install @sirosfoundation/dc-api
```

A pre-built ESM bundle is also available at `dist/dc-api.bundle.js` for use in
importmaps or environments without a bundler.

## Usage

### Requesting credentials

```ts
import {
  isDCAPIAvailable,
  getBestProtocol,
  requestCredential,
  isUserCancel,
} from '@sirosfoundation/dc-api';

// 1. Check if DC API + openid4vp is available
const protocol = getBestProtocol();

if (protocol) {
  try {
    // 2. Call the native DC API
    const result = await requestCredential(protocol, {
      request: signedJWT, // JAR for "openid4vp-v1-signed"
    });

    // 3. Submit result.data to your backend
    await submitToBackend(result.data);
  } catch (err) {
    if (isUserCancel(err)) {
      // User cancelled — show alternative flow
    } else {
      throw err;
    }
  }
} else {
  // No DC API support — use QR code / redirect fallback
  showQRCode();
}
```

### Protocol constants

```ts
import { OID4VP_PROTOCOLS, isOID4VPProtocol } from '@sirosfoundation/dc-api';

// Use shared constants instead of hardcoding protocol strings
const supportedProtocols = [
  OID4VP_PROTOCOLS.UNSIGNED,
  OID4VP_PROTOCOLS.SIGNED,
  OID4VP_PROTOCOLS.MULTISIGNED,
];

// Type guard for filtering
const known = requests.filter(r => isOID4VPProtocol(r.protocol));
```

## API

### Protocol Constants

```ts
OID4VP_PROTOCOLS.UNSIGNED     // "openid4vp-v1-unsigned"
OID4VP_PROTOCOLS.SIGNED       // "openid4vp-v1-signed"
OID4VP_PROTOCOLS.MULTISIGNED  // "openid4vp-v1-multisigned"
OID4VP_PROTOCOLS.LEGACY       // "openid4vp"

OID4VP_SPEC_PROTOCOLS         // [UNSIGNED, SIGNED, MULTISIGNED]
OID4VP_ALL_PROTOCOLS          // [UNSIGNED, SIGNED, MULTISIGNED, LEGACY]
isOID4VPProtocol(value)       // Type guard — true for any known protocol
```

### Detection

| Function | Description |
|---|---|
| `isDCAPIAvailable()` | `true` when `typeof DigitalCredential !== "undefined"` |
| `isProtocolAllowed(protocol)` | Delegates to `DigitalCredential.userAgentAllowsProtocol()` |
| `getBestProtocol(preference?)` | Returns the first allowed protocol from a preference-ordered list (default: signed > multisigned > unsigned) |

### Request

| Function | Description |
|---|---|
| `requestCredential(protocol, data, options?)` | Calls `navigator.credentials.get({digital: {requests: [{protocol, data}]}})`, returns `{ protocol, data }` |

`options.signal` accepts an `AbortSignal` for cancellation.

### Error Helpers

| Function | Description |
|---|---|
| `getUserFriendlyErrorMessage(error)` | Returns a human-readable message for DC API errors |
| `isUserCancel(error)` | `true` for `NotAllowedError` or `AbortError` |
| `isProtocolUnsupported(error)` | `true` for `NotSupportedError` |
| `ERROR_MESSAGES` | Map of DOMException names to user-facing strings |

## Design Principles

- **Zero dependencies** — no runtime dependencies
- **Backend-agnostic** — no knowledge of specific verifier or wallet endpoints
- **Transport-agnostic** — no QR codes, redirects, or SSE; those belong in the consumer
- **Spec-aligned** — uses the W3C DC API spec's detection and invocation patterns exactly

## References

- [W3C Digital Credentials API](https://w3c-fedid.github.io/digital-credentials/)
- [OpenID4VP (DC API profile)](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)

## License

BSD-2-Clause
