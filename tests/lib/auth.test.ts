// @vitest-environment node
//
// L'environment node e' necessario perche' jose v6 usa crypto.subtle (Web Crypto API)
// che non e' disponibile in jsdom. Con 'node' il globalThis.crypto e' il modulo
// crypto nativo di Node 18+ che espone la Web Crypto API completa.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TextEncoder } from 'util'

// ---------------------------------------------------------------------------
// Helpers per costruire mock chain Drizzle
// ---------------------------------------------------------------------------

/** Chain riusabile per db.delete().where() — si risolve come Promise<void> */
function buildDeleteChain() {
  const resolved = Promise.resolve(undefined)
  const chain = {
    where: vi.fn().mockReturnValue(resolved),
    catch: resolved.catch.bind(resolved),
    then:  resolved.then.bind(resolved),
    finally: resolved.finally.bind(resolved),
  }
  return chain
}

/** Chain riusabile per db.insert().values() — si risolve come Promise<[]> */
function buildInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([]),
  }
}

/** Chain riusabile per db.update().set().where() — si risolve come Promise<[]> */
function buildUpdateChain() {
  const resolved = Promise.resolve([])
  const whereStep = {
    where: vi.fn().mockReturnValue(resolved),
  }
  return {
    set: vi.fn().mockReturnValue(whereStep),
  }
}

// ---------------------------------------------------------------------------
// Mock DB
// ---------------------------------------------------------------------------
const mockSelectFn = vi.fn()
const mockDeleteFn = vi.fn()
const mockInsertFn = vi.fn()
const mockUpdateFn = vi.fn()

vi.mock('@/lib/db/drizzle', () => ({
  db: {
    select: mockSelectFn,
    insert: mockInsertFn,
    delete: mockDeleteFn,
    update: mockUpdateFn,
  },
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get:    vi.fn().mockReturnValue({ value: 'mock-session-token' }),
    set:    vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockReturnValue(new Headers()),
}))

vi.mock('server-only', () => ({}))

// ---------------------------------------------------------------------------
// buildAuthChain — per db.select().from().where().limit()
// ---------------------------------------------------------------------------
function buildAuthChain(rows: unknown[] = []) {
  const p        = Promise.resolve(rows)
  const terminal = vi.fn().mockResolvedValue(rows)
  const orderBy  = { limit: terminal }
  const where    = Object.assign(
    vi.fn().mockImplementation(() => where),
    { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p), limit: terminal, orderBy },
  )
  const chain: Record<string, unknown> = {
    from:      vi.fn().mockImplementation(() => chain),
    innerJoin: vi.fn().mockImplementation(() => chain),
    where,
    limit:     terminal,
    orderBy,
    then:      p.then.bind(p),
    catch:     p.catch.bind(p),
    finally:   p.finally.bind(p),
  }
  mockSelectFn.mockReturnValue(chain)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  buildAuthChain([])
  mockDeleteFn.mockReturnValue(buildDeleteChain())
  mockInsertFn.mockReturnValue(buildInsertChain())
  mockUpdateFn.mockReturnValue(buildUpdateChain())
})

// ---------------------------------------------------------------------------
// SECTION 1: session.ts
// ---------------------------------------------------------------------------
describe('session.ts', () => {
  describe('hashPassword / comparePasswords', () => {
    it('produce un hash diverso dalla password originale', async () => {
      const { hashPassword } = await import('@/lib/auth/session')
      const hashed = await hashPassword('MySecurePass123!')
      expect(hashed).not.toBe('MySecurePass123!')
      expect(hashed.startsWith('$2b$')).toBe(true)
    })

    it('due hash della stessa password sono diversi (salt)', async () => {
      const { hashPassword } = await import('@/lib/auth/session')
      const ha1 = await hashPassword('password')
      const ha2 = await hashPassword('password')
      expect(ha1).not.toBe(ha2)
    })

    it('comparePasswords ritorna true per password corretta', async () => {
      const { hashPassword, comparePasswords } = await import('@/lib/auth/session')
      const hashed = await hashPassword('correct-horse-battery')
      expect(await comparePasswords('correct-horse-battery', hashed)).toBe(true)
    })

    it('comparePasswords ritorna false per password sbagliata', async () => {
      const { hashPassword, comparePasswords } = await import('@/lib/auth/session')
      const hashed = await hashPassword('correct-password')
      expect(await comparePasswords('wrong-password', hashed)).toBe(false)
    })
  })

  describe('signToken / verifyToken', () => {
    it('signa e verifica un token valido', async () => {
      const { SignJWT, jwtVerify } = await import('jose')

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode('test-secret-at-least-32-chars-long!!'),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
      )

      const token = await new SignJWT({ sub: 'a1b2c3d4-0000-0000-0000-000000000001', role: 'member' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1d')
        .sign(cryptoKey)

      expect(typeof token).toBe('string')
      expect(token.split('.').length).toBe(3)

      const { payload } = await jwtVerify(token, cryptoKey, { algorithms: ['HS256'] })
      expect(payload.sub).toBe('a1b2c3d4-0000-0000-0000-000000000001')
      expect((payload as Record<string, unknown>).role).toBe('member')
    })

    it('verifyToken fallisce su token malformato', async () => {
      const { verifyToken } = await import('@/lib/auth/session')
      await expect(verifyToken('token.not.valid')).rejects.toThrow()
    })

    it('verifyToken fallisce su stringa vuota', async () => {
      const { verifyToken } = await import('@/lib/auth/session')
      await expect(verifyToken('')).rejects.toThrow()
    })
  })
})

// ---------------------------------------------------------------------------
// SECTION 2: otp.ts
// ---------------------------------------------------------------------------
describe('otp.ts', () => {
  describe('generateOtpCode', () => {
    it('genera un codice di esattamente 6 cifre', async () => {
      const { generateOtpCode } = await import('@/lib/auth/otp')
      expect(generateOtpCode()).toMatch(/^\d{6}$/)
    })

    it('genera codici diversi ad ogni chiamata', async () => {
      const { generateOtpCode } = await import('@/lib/auth/otp')
      const codes = new Set(Array.from({ length: 10 }, () => generateOtpCode()))
      expect(codes.size).toBeGreaterThan(1)
    })

    it('il codice e sempre compreso tra 100000 e 999999', async () => {
      const { generateOtpCode } = await import('@/lib/auth/otp')
      for (let i = 0; i < 20; i++) {
        const num = parseInt(generateOtpCode(), 10)
        expect(num).toBeGreaterThanOrEqual(100000)
        expect(num).toBeLessThanOrEqual(999999)
      }
    })
  })

  describe('verifyOtpCode -- logica dominio (mock DB)', () => {
    const USER_ID = 'a1b2c3d4-0000-0000-0000-000000000001'
    const VALID_CODE = '123456'
    const FUTURE = new Date(Date.now() + 15 * 60 * 1000)

    it('rifiuta se nessun record trovato (codice non esiste)', async () => {
      buildAuthChain([])
      const { verifyOtpCode } = await import('@/lib/auth/otp')
      const result = await verifyOtpCode(USER_ID, VALID_CODE)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorCode).toBe('notFound')
    })

    it('rifiuta codice scaduto', async () => {
      buildAuthChain([{
        id: 1, userId: USER_ID, code: VALID_CODE,
        expiresAt: new Date(Date.now() - 1000), attempts: 0,
      }])
      const { verifyOtpCode } = await import('@/lib/auth/otp')
      const result = await verifyOtpCode(USER_ID, VALID_CODE)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorCode).toBe('expired')
    })

    it('rifiuta codice errato e incrementa attempts', async () => {
      buildAuthChain([{
        id: 1, userId: USER_ID, code: VALID_CODE,
        expiresAt: FUTURE, attempts: 0,
      }])
      const { verifyOtpCode } = await import('@/lib/auth/otp')
      const result = await verifyOtpCode(USER_ID, '000000')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorCode).toBe('wrong')
      expect(mockUpdateFn).toHaveBeenCalledTimes(1)
    })

    it('non chiama update su codice corretto (elimina direttamente)', async () => {
      buildAuthChain([{
        id: 1, userId: USER_ID, code: VALID_CODE,
        expiresAt: FUTURE, attempts: 0,
      }])
      const { verifyOtpCode } = await import('@/lib/auth/otp')
      const result = await verifyOtpCode(USER_ID, VALID_CODE)
      expect(result.success).toBe(true)
      expect(mockUpdateFn).not.toHaveBeenCalled()
      expect(mockDeleteFn).toHaveBeenCalledTimes(1)
    })

    it('blocca e invalida il record quando attempts >= MAX_OTP_ATTEMPTS', async () => {
      const { MAX_OTP_ATTEMPTS, verifyOtpCode } = await import('@/lib/auth/otp')
      buildAuthChain([{
        id: 1, userId: USER_ID, code: VALID_CODE,
        expiresAt: FUTURE, attempts: MAX_OTP_ATTEMPTS,
      }])
      const result = await verifyOtpCode(USER_ID, VALID_CODE)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorCode).toBe('notFound')
      expect(mockDeleteFn).toHaveBeenCalledTimes(1)
      expect(mockUpdateFn).not.toHaveBeenCalled()
    })

    it('blocca anche con attempts > MAX_OTP_ATTEMPTS (over-limit)', async () => {
      const { MAX_OTP_ATTEMPTS, verifyOtpCode } = await import('@/lib/auth/otp')
      buildAuthChain([{
        id: 1, userId: USER_ID, code: VALID_CODE,
        expiresAt: FUTURE, attempts: MAX_OTP_ATTEMPTS + 10,
      }])
      const result = await verifyOtpCode(USER_ID, '999999')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorCode).toBe('notFound')
      expect(mockDeleteFn).toHaveBeenCalledTimes(1)
    })

    it('al tentativo (MAX-1) non blocca ancora, incrementa', async () => {
      const { MAX_OTP_ATTEMPTS, verifyOtpCode } = await import('@/lib/auth/otp')
      buildAuthChain([{
        id: 1, userId: USER_ID, code: VALID_CODE,
        expiresAt: FUTURE, attempts: MAX_OTP_ATTEMPTS - 1,
      }])
      const result = await verifyOtpCode(USER_ID, '000000')
      expect(result.success).toBe(false)
      if (!result.success) expect(result.errorCode).toBe('wrong')
      expect(mockUpdateFn).toHaveBeenCalledTimes(1)
      expect(mockDeleteFn).not.toHaveBeenCalled()
    })
  })
})

// ---------------------------------------------------------------------------
// SECTION 3: password-reset.ts
// ---------------------------------------------------------------------------
describe('password-reset.ts', () => {
  const FUTURE = new Date(Date.now() + 30 * 60 * 1000)

  it('rifiuta token inesistente (DB ritorna [])', async () => {
    buildAuthChain([])
    const { verifyPasswordResetToken } = await import('@/lib/auth/password-reset')
    const result = await verifyPasswordResetToken('nonexistent-token')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errorCode).toBe('invalid')
    // Nessuna delete su token inesistente
    expect(mockDeleteFn).not.toHaveBeenCalled()
  })

  it('rifiuta token scaduto', async () => {
    buildAuthChain([{
      id: 1,
      userId: 'a1b2c3d4-0000-0000-0000-000000000010',
      token: 'expired-token',
      expiresAt: new Date(Date.now() - 1000),
    }])
    const { verifyPasswordResetToken } = await import('@/lib/auth/password-reset')
    const result = await verifyPasswordResetToken('expired-token')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errorCode).toBe('expired')
    // Nessuna delete su token scaduto (non bruciarlo — l\'utente potrebbe richiederne uno nuovo)
    expect(mockDeleteFn).not.toHaveBeenCalled()
  })

  it('token valido: ritorna userId e lo elimina atomicamente', async () => {
    const USER_ID = 'a1b2c3d4-0000-0000-0000-000000000020'
    buildAuthChain([{
      id: 2,
      userId: USER_ID,
      token: 'valid-token-abc',
      expiresAt: FUTURE,
    }])
    const { verifyPasswordResetToken } = await import('@/lib/auth/password-reset')
    const result = await verifyPasswordResetToken('valid-token-abc')
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.userId).toBe(USER_ID)
    // Il token deve essere eliminato subito dopo la verifica
    expect(mockDeleteFn).toHaveBeenCalledTimes(1)
  })

  it('token valido: delete non chiamata due volte se caller invoca anche deletePasswordResetToken', async () => {
    // Verifica che il pattern deprecato non causi doppia delete inaspettata
    const USER_ID = 'a1b2c3d4-0000-0000-0000-000000000021'
    buildAuthChain([{
      id: 3,
      userId: USER_ID,
      token: 'valid-token-xyz',
      expiresAt: FUTURE,
    }])
    const { verifyPasswordResetToken, deletePasswordResetToken } = await import('@/lib/auth/password-reset')
    const result = await verifyPasswordResetToken('valid-token-xyz')
    expect(result.valid).toBe(true)
    // Se il caller chiama anche deletePasswordResetToken (pattern vecchio)
    // il secondo delete e' un no-op sicuro (token gia' eliminato dal DB)
    await deletePasswordResetToken('valid-token-xyz')
    // Due chiamate a delete: una da verify, una dal caller — entrambe sicure
    expect(mockDeleteFn).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// SECTION 4: rate-limit.ts — checkGeneralRateLimit (DB-based, async)
// ---------------------------------------------------------------------------
describe('rate-limit.ts -- checkGeneralRateLimit (DB-based)', () => {
  beforeEach(() => {
    mockDeleteFn.mockReturnValue(buildDeleteChain())
    mockInsertFn.mockReturnValue(buildInsertChain())
  })

  it('non bloccata se DB non ha tentativi (count=0)', async () => {
    buildAuthChain([{ total: 0 }])
    const { checkGeneralRateLimit } = await import('@/lib/auth/rate-limit')
    const result = await checkGeneralRateLimit('test-key-zero', 3, 60)
    expect(result.blocked).toBe(false)
    expect(result.remaining).toBe(3)
  })

  it('non bloccata se tentativi < max', async () => {
    buildAuthChain([{ total: 2 }])
    const { checkGeneralRateLimit } = await import('@/lib/auth/rate-limit')
    const result = await checkGeneralRateLimit('test-key-partial', 3, 60)
    expect(result.blocked).toBe(false)
    expect(result.remaining).toBe(1)
  })

  it('bloccata se tentativi === max', async () => {
    buildAuthChain([{ total: 3 }])
    const { checkGeneralRateLimit } = await import('@/lib/auth/rate-limit')
    const result = await checkGeneralRateLimit('test-key-exact', 3, 60)
    expect(result.blocked).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('bloccata se tentativi > max', async () => {
    buildAuthChain([{ total: 10 }])
    const { checkGeneralRateLimit } = await import('@/lib/auth/rate-limit')
    const result = await checkGeneralRateLimit('test-key-over', 3, 60)
    expect(result.blocked).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('remaining non scende mai sotto zero', async () => {
    buildAuthChain([{ total: 999 }])
    const { checkGeneralRateLimit } = await import('@/lib/auth/rate-limit')
    const result = await checkGeneralRateLimit('test-key-floor', 3, 60)
    expect(result.remaining).toBeGreaterThanOrEqual(0)
  })

  it('recordGeneralAttempt chiama db.insert().values() con ip marker corretto', async () => {
    const { recordGeneralAttempt } = await import('@/lib/auth/rate-limit')
    await recordGeneralAttempt('otp:user-123')
    expect(mockInsertFn).toHaveBeenCalled()
    const insertValues = mockInsertFn.mock.results[0]?.value
    expect(insertValues.values).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '__general__', email: 'otp:user-123', success: false }),
    )
  })
})

// ---------------------------------------------------------------------------
// SECTION 5: Validazione input (logica pura)
// ---------------------------------------------------------------------------
describe('Auth input validation (unit)', () => {
  const validateLoginInput = (email: string, password: string) => {
    if (!email || !password) return { ok: false, error: 'Campi obbligatori' }
    if (!/^.+@.+\..+$/.test(email)) return { ok: false, error: 'Email non valida' }
    if (password.length < 8)        return { ok: false, error: 'Password troppo corta' }
    return { ok: true }
  }
  const normalizeEmail = (email: string) => email.trim().toLowerCase()

  it('rifiuta password vuota',                      () => expect(validateLoginInput('user@test.com', '').ok).toBe(false))
  it('rifiuta email vuota',                          () => expect(validateLoginInput('', 'password123').ok).toBe(false))
  it('rifiuta email non valida',                     () => expect(validateLoginInput('not-an-email', 'password123').error).toBe('Email non valida'))
  it('rifiuta password troppo corta (<8 caratteri)', () => expect(validateLoginInput('user@test.com', 'abc').error).toBe('Password troppo corta'))
  it('accetta credenziali valide',                   () => expect(validateLoginInput('user@test.com', 'password123').ok).toBe(true))
  it('normalizza email (lowercase + trim)',           () => expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com'))
})

// ---------------------------------------------------------------------------
// SECTION 6: queries.ts — getUser resiliente a JWT malformato
// ---------------------------------------------------------------------------
describe('queries.ts -- getUser con JWT non valido', () => {
  async function setCookieValue(value: string) {
    const nextHeaders = await import('next/headers')
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(value ? { value } : undefined),
      set: vi.fn(),
      delete: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof nextHeaders.cookies>>)
  }

  it('ritorna null su token malformato (non crasha)', async () => {
    await setCookieValue('questo.non.e.un.jwt')
    vi.resetModules()
    const { getUser } = await import('@/lib/db/queries')
    const result = await getUser()
    expect(result).toBeNull()
  })

  it('ritorna null su token con firma alterata', async () => {
    const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.firma-alterata-non-valida'
    await setCookieValue(fakeJwt)
    vi.resetModules()
    const { getUser } = await import('@/lib/db/queries')
    const result = await getUser()
    expect(result).toBeNull()
  })

  it('ritorna null su cookie assente (get ritorna undefined)', async () => {
    await setCookieValue('')
    vi.resetModules()
    const { getUser } = await import('@/lib/db/queries')
    const result = await getUser()
    expect(result).toBeNull()
  })
})
