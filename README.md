# @sirosfoundation/dc-api

W3C Digital Credentials API utilities for OpenID4VP.

Backend-agnostic library providing:

- **Protocol constants** — versioned OpenID4VP protocol identifiers per the W3C DC API spec
- **Feature detection** — check DC API availability and protocol support
- **Native DC API invocation** — call `navigator.credentials.get()` with proper parameters
- **Error helpers** — classify errors and generate user-friendly messages

## Install

```sh
npm install @sirosfoundation/dc-api
```

## Usage

### Verifier (requesting credentials)

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

    // 3. Submit result.data to your verifier backend
    await submitToBackend(result.data);
  } catch (err) {
    if (isUserCancel(err)) {
      // User cancelled — show QR fallback
    } else {
      throw err;
    }
  }
} else {
  // No DC API support — use QR code / redirect fallback
  showQRCode();
}
```

### Browser extension (wallet-companion)

```ts
import {
  OID4VP_PROTOCOLS,
  isOID4VPProtocol,
  isDCAPIAvailable,
} from '@sirosfoundation/dc-api';

// Use shared protocol constants instead of maintaining your own enum
const supportedProtocols = [
  OID4VP_PROTOCOLS.UNSIGNED,
  OID4VP_PROTOCOLS.SIGNED,
  OID4VP_PROTOCOLS.MULTISIGNED,
];

// Filter incoming requests by known protocols
const supported = requests.filter(r => isOID4VPProtocol(r.protocol));
```

## API

### Protocol Constants

```ts
OID4VP_PROTOCOLS.UNSIGNED     // "openid4vp-v1-unsigned"
OID4VP_PROTOCOLS.SIGNED       // "openid4vp-v1-signed"
OID4VP_PROTOCOLS.MULTISIGNED  // "openid4vp-v1-multisigned"
OID4VP_PROTOCOLS.LEGACY       // "openid4vp"
```

### Detection

| Function | Description |
|---|---|
| `isDCAPIAvailable()` | `typeof DigitalCredential !== "undefined"` |
| `isProtocolAllowed(protocol)` | Calls `DigitalCredential.userAgentAllowsProtocol()` |
| `getBestProtocol(preference?)` | First allowed protocol from preference list |

### Request

| Function | Description |
|---|---|
| `requestCredential(protocol, data, options?)` | Calls native DC API, returns `{ protocol, data }` |

### Errors

| Function | Description |
|---|---|
| `getUserFriendlyErrorMessage(error)` | Human-readable error message |
| `isUserCancel(error)` | True for NotAllowedError / AbortError |
| `isProtocolUnsupported(error)` | True for NotSupportedError |

## Design Principles

- **Backend-agnostic** — no knowledge of specific verifier endpoints
- **Transport-agnostic** — no QR codes, redirects, or SSE; those are the consumer's job
- **Extension-agnostic** — doesn't assume wallet-companion is installed
- **Spec-aligned** — uses the W3C DC API spec's detection and invocation patterns exactly

## License

BSD-2-Clause
