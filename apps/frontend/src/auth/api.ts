import type { CanvasDocument } from '../domain/canvas'

export interface SavedArchitecture {
  document: CanvasDocument
  updatedAt: string
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '/api'

export async function apiRequest<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(body?.error ?? `KloudLab API request failed (${response.status}).`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
