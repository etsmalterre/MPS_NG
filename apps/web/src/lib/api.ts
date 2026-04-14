// Shared API fetch helper. Centralized so every page sends cookies via
// `credentials: 'include'` (required for cross-origin cookie auth) and so we
// have one place to add global auth-error handling in the future.

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api'

// Default return type is `any` so existing call sites that rely on implicit
// typing (from the previous per-page apiFetch) keep working. Call with an
// explicit type parameter (`apiFetch<Foo>(...)`) when you want proper typing.
export async function apiFetch<T = any>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    // Surface a machine-readable error so callers can distinguish
    // "not authenticated" (401) from generic failure.
    const err: Error & { status?: number } = new Error(`API ${res.status}`)
    err.status = res.status
    throw err
  }
  // Some endpoints (logout) return 204 No Content, which has no body.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}
