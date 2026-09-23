/**
 * Internal: bind a fetch implementation and an AbortSignal together.
 *
 * Every network option this library takes travels as one value from here on.
 * The alternative - passing `fetchImpl` and `signal` as separate parameters -
 * is what produced #22: a call site hand-picked `fetchFn` out of the options
 * object, the signal silently stopped applying to one of two fetches, and the
 * types still checked. With a single bound value there is nothing left to
 * pick, so a path cannot honour the fetch override while quietly dropping
 * cancellation.
 *
 * @internal not exported from index.ts
 */
export interface FetchOptions {
	/** Override fetch (e.g. for testing, or a non-global fetch). */
	fetchFn?: typeof fetch;
	/** Abort any network call this operation makes. */
	signal?: AbortSignal;
}

/** A fetch already carrying its caller's override and cancellation. */
export type BoundFetch = (url: string) => Promise<Response>;

export function boundFetch(options?: FetchOptions): BoundFetch {
	const fetchImpl = options?.fetchFn ?? fetch;
	const signal = options?.signal;

	// Only pass an init object when there is something to put in it, so a
	// caller with no signal sees the same single-argument call as before.
	return (url) => (signal ? fetchImpl(url, { signal }) : fetchImpl(url));
}
