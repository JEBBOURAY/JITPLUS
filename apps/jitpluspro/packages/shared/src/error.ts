/**
 * Sanitize a server error message — hide internal error details that should
 * never be shown to users (stack traces, SQL, ORM internals).
 */
export function sanitizeErrorMessage(msg: string, fallback: string): string {
  const internalPatterns =
    /Error:|Exception|at\s+\w|SELECT|INSERT|UPDATE|DELETE|prisma|TypeError|Cannot read|stack.*trace/i;
  if (internalPatterns.test(msg)) return fallback;
  return msg;
}

/**
 * Extract a human-readable message from an unknown error.
 * Handles Axios-style response objects and generic Error instances.
 */
export function getErrorMessage(error: unknown, fallback = 'Une erreur est survenue'): string {
  let msg: string | undefined;

  if (error && typeof error === 'object') {
    // Axios-style error
    const axiosData = (error as any)?.response?.data;
    if (typeof axiosData?.message === 'string') {
      msg = axiosData.message;
    } else if (Array.isArray(axiosData?.message) && axiosData.message.length > 0) {
      msg = String(axiosData.message[0]);
    } else if (error instanceof Error) {
      msg = error.message;
    }
  } else if (typeof error === 'string') {
    msg = error;
  }

  if (!msg) return fallback;
  return sanitizeErrorMessage(msg, fallback);
}

/**
 * Extract HTTP status code from an Axios-style error.
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    return (error as any)?.response?.status;
  }
  return undefined;
}
