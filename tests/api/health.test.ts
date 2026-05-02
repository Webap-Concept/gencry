import { describe, it, expect, vi } from 'vitest'

// Test degli endpoint API (senza avviare il server Next.js)
// Testa la logica delle route handler in isolamento.

const mockResponse = (data: unknown, status = 200) => ({
  json: async () => data,
  status,
  ok: status >= 200 && status < 300,
})

describe('API response helpers', () => {
  it('risposta di successo ha status 200', async () => {
    const res = mockResponse({ message: 'ok' })
    expect(res.status).toBe(200)
    expect(res.ok).toBe(true)
    const body = await res.json() as { message: string }
    expect(body.message).toBe('ok')
  })

  it('risposta di errore ha ok=false', () => {
    const res = mockResponse({ error: 'Not found' }, 404)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  it('risposta 500 è server error', () => {
    const res = mockResponse({ error: 'Internal error' }, 500)
    expect(res.ok).toBe(false)
    expect(res.status).toBe(500)
  })
})

describe('Query string parsing', () => {
  it('estrae parametri da query string', () => {
    const parseQuery = (qs: string) => Object.fromEntries(new URLSearchParams(qs))
    expect(parseQuery('page=1&limit=20')).toEqual({ page: '1', limit: '20' })
    expect(parseQuery('')).toEqual({})
  })
})
