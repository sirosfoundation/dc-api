/**
 * @sirosfoundation/dc-api/full
 *
 * The polyfill and web-wallet registration in ONE module instance.
 *
 * Use this entry point whenever you need both halves. The separate
 * `./polyfill` and `./web-wallets` bundles cannot be combined: each is a
 * self-contained esbuild output that inlines its own copy of `polyfill.ts`,
 * so loading both gives two wallet registries, two `installPolyfill`s, and
 * two `_installed` flags. A wallet registered through one bundle's
 * `window.DigitalWallets` is then invisible to the other bundle's
 * `navigator.credentials.create()` shim, and issuance rejects with
 * `NotAllowedError` even though a provider is sitting right there.
 *
 * Bundler-based consumers never hit that, because `./polyfill` and
 * `./web-wallets` resolve to the tsc outputs, which share one instance
 * through a normal import. It is consumers that vendor the pre-built bundles
 * as raw JS - no bundler of their own - that need this file.
 *
 * Usage (page):
 *
 *   import { installPolyfill, enableWebWallets } from '@sirosfoundation/dc-api/full';
 *   installPolyfill();
 *   enableWebWallets();
 *
 * Vendoring the bundle:
 *
 *   <script type="module" src="/static/dc-api-full.js"></script>
 *
 * Usage (wallet script) is unchanged - see ./web-wallets.
 */

export * from './polyfill.js';
export * from './web-wallets.js';
