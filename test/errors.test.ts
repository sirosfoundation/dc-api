import { describe, it, expect } from 'vitest';
import {
	getUserFriendlyErrorMessage,
	isUserCancel,
	isProtocolUnsupported,
	ERROR_MESSAGES,
} from '../src/errors.js';

describe('getUserFriendlyErrorMessage', () => {
	it('returns message for known DOMException names', () => {
		const err = new DOMException('test', 'NotAllowedError');
		expect(getUserFriendlyErrorMessage(err)).toBe(ERROR_MESSAGES.NotAllowedError);
	});

	it('returns default for unknown errors', () => {
		expect(getUserFriendlyErrorMessage(new Error('oops'))).toContain('unexpected');
	});

	it('returns default for non-Error values', () => {
		expect(getUserFriendlyErrorMessage('string')).toContain('unexpected');
		expect(getUserFriendlyErrorMessage(null)).toContain('unexpected');
	});
});

describe('isUserCancel', () => {
	it('returns true for NotAllowedError', () => {
		expect(isUserCancel(new DOMException('', 'NotAllowedError'))).toBe(true);
	});

	it('returns true for AbortError', () => {
		expect(isUserCancel(new DOMException('', 'AbortError'))).toBe(true);
	});

	it('returns false for other errors', () => {
		expect(isUserCancel(new DOMException('', 'NotSupportedError'))).toBe(false);
		expect(isUserCancel(new Error('test'))).toBe(false);
	});
});

describe('isProtocolUnsupported', () => {
	it('returns true for NotSupportedError', () => {
		expect(isProtocolUnsupported(new DOMException('', 'NotSupportedError'))).toBe(true);
	});

	it('returns false for other errors', () => {
		expect(isProtocolUnsupported(new DOMException('', 'NotAllowedError'))).toBe(false);
		expect(isProtocolUnsupported(new Error('test'))).toBe(false);
	});
});
