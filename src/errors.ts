/**
 * Error classification and user-friendly messages for DC API errors.
 */

/**
 * User-friendly error messages keyed by DOMException name.
 */
export const ERROR_MESSAGES: Record<string, string> = {
	NotAllowedError: 'You denied the credential request or no wallet is available.',
	NotSupportedError: 'Your browser or wallet does not support this credential type.',
	SecurityError: 'Security error — ensure you are on HTTPS.',
	AbortError: 'The request was cancelled or timed out.',
	InvalidStateError: 'A credential request is already in progress.',
	TypeError: 'The credential request data is malformed.',
};

const DEFAULT_MESSAGE = 'An unexpected error occurred. Please try again.';

/**
 * Get a user-friendly message for a DC API error.
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
	if (error instanceof DOMException) {
		return ERROR_MESSAGES[error.name] ?? DEFAULT_MESSAGE;
	}
	if (error instanceof Error) {
		return ERROR_MESSAGES[error.name] ?? DEFAULT_MESSAGE;
	}
	return DEFAULT_MESSAGE;
}

/**
 * Check if the error represents a user cancellation (not a failure).
 */
export function isUserCancel(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === 'NotAllowedError' || error.name === 'AbortError')
	);
}

/**
 * Check if the error means the protocol is not supported by this browser.
 */
export function isProtocolUnsupported(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'NotSupportedError';
}
