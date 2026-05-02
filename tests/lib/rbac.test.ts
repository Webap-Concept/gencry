import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Struttura query in can.ts:
//
//  can() query 1:              .where().orderBy().limit(1)  ← terminale
//  can() query 2:              .where().limit(1)            ← terminale
//  getUserPermissions() q1:    .where()                    ← thenable terminale
//  getUserPermissions() q2:    .where().orderBy()          ← thenable terminale
//
// Ogni chiamata a db.select() deve produrre una chain INDIPENDENTE
// con i propri rows, in modo che sequenze di query multiple funzionino.
// ---------------------------------------------------------------------------

const mockSelect = vi.fn()

vi.mock('@/lib/db/drizzle', () => ({
  db: { select: mockSelect },
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('server-only', () => ({}))

const mockGetUser = vi.fn()
vi.mock('@/lib/db/queries', () => ({ getUser: mockGetUser }))

/**
 * Costruisce UNA chain drizzle indipendente che risolve con `rows`.
 * Tutti i metodi restituiscono la stessa chain (fluid interface).
 * `.limit()` e la chain stessa sono thenable -> Promise.resolve(rows)
 */
function oneChain(rows: unknown[]) {
  const p = Promise.resolve(rows)
  const terminal = vi.fn().mockResolvedValue(rows)

  // orderBy: thenable + ha .limit()
  const orderBy = Object.assign(
    vi.fn().mockImplementation(() => orderBy),
    { ...p, then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p), limit: terminal },
  )

  // where: thenable + ha .limit() + .orderBy() + .innerJoin()
  const where = Object.assign(
    vi.fn().mockImplementation(() => where),
    { ...p, then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p), limit: terminal, orderBy, innerJoin: vi.fn() },
  )

  const chain: Record<string, unknown> = {
    from:      vi.fn().mockImplementation(() => chain),
    innerJoin: vi.fn().mockImplementation(() => chain),
    where,
    orderBy,
    limit:     terminal,
    then:      p.then.bind(p),
    catch:     p.catch.bind(p),
    finally:   p.finally.bind(p),
  }

  return chain
}

/**
 * Imposta il mock in modo che ogni chiamata successiva a db.select()
 * usi la slice corrispondente di `sequences`.
 */
function seq(...sequences: unknown[][]) {
  let call = 0
  mockSelect.mockImplementation(() => oneChain(sequences[call++] ?? []))
}

// ---------------------------------------------------------------------------
// SECTION 1 — can()
// can() esegue 2 query:  q1=override (.orderBy().limit), q2=role (.limit)
// ---------------------------------------------------------------------------
describe('can()', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('ritorna true se esiste un override individuale granted=true', async () => {
    seq([{ granted: true }], [])
    const { can } = await import('@/lib/rbac/can')
    expect(await can({ id: "1", role: 'member' }, 'admin:access')).toBe(true)
  })

  it('ritorna false se esiste un override individuale granted=false', async () => {
    seq([{ granted: false }], [])
    const { can } = await import('@/lib/rbac/can')
    expect(await can({ id: "1", role: 'admin' }, 'admin:users')).toBe(false)
  })

  it('ritorna true se nessun override ma il ruolo ha il permesso', async () => {
    seq([], [{ id: 5 }])
    const { can } = await import('@/lib/rbac/can')
    expect(await can({ id: "2", role: 'admin' }, 'admin:access')).toBe(true)
  })

  it('ritorna false se nessun override e il ruolo non ha il permesso', async () => {
    seq([], [])
    const { can } = await import('@/lib/rbac/can')
    expect(await can({ id: "3", role: 'member' }, 'admin:access')).toBe(false)
  })

  it('override ha priorita sul ruolo anche se il ruolo avrebbe accesso', async () => {
    seq([{ granted: false }], [{ id: 5 }])
    const { can } = await import('@/lib/rbac/can')
    expect(await can({ id: "4", role: 'admin' }, 'admin:access')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SECTION 2 — getUserPermissions()
// q1 = rolePerms (.where() thenable), q2 = overrides (.where().orderBy() thenable)
// ---------------------------------------------------------------------------
describe('getUserPermissions()', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('restituisce i permessi del ruolo come Set', async () => {
    seq([{ key: 'admin:access' }, { key: 'admin:users' }], [])
    const { getUserPermissions } = await import('@/lib/rbac/can')
    const perms = await getUserPermissions({ id: "1", role: 'admin' })
    expect(perms.has('admin:access')).toBe(true)
    expect(perms.has('admin:users')).toBe(true)
    expect(perms.has('admin:billing')).toBe(false)
  })

  it('applica override grant: aggiunge permesso non nel ruolo', async () => {
    seq(
      [{ key: 'content:read' }],
      [{ key: 'admin:content', granted: true, createdAt: new Date() }],
    )
    const { getUserPermissions } = await import('@/lib/rbac/can')
    const perms = await getUserPermissions({ id: "2", role: 'member' })
    expect(perms.has('content:read')).toBe(true)
    expect(perms.has('admin:content')).toBe(true)
  })

  it('applica override revoke: rimuove permesso presente nel ruolo', async () => {
    seq(
      [{ key: 'admin:access' }, { key: 'admin:users' }],
      [{ key: 'admin:users', granted: false, createdAt: new Date() }],
    )
    const { getUserPermissions } = await import('@/lib/rbac/can')
    const perms = await getUserPermissions({ id: "3", role: 'admin' })
    expect(perms.has('admin:access')).toBe(true)
    expect(perms.has('admin:users')).toBe(false)
  })

  it('deduplicazione: vince la riga piu recente in caso di duplicati', async () => {
    const now   = new Date()
    const older = new Date(now.getTime() - 5000)
    seq(
      [{ key: 'admin:access' }],
      [
        { key: 'admin:access', granted: false, createdAt: now },
        { key: 'admin:access', granted: true,  createdAt: older },
      ],
    )
    const { getUserPermissions } = await import('@/lib/rbac/can')
    const perms = await getUserPermissions({ id: "4", role: 'admin' })
    expect(perms.has('admin:access')).toBe(false)
  })

  it('utente senza ruolo riconosciuto ha Set vuoto (no override)', async () => {
    seq([], [])
    const { getUserPermissions } = await import('@/lib/rbac/can')
    const perms = await getUserPermissions({ id: "99", role: 'ghost' })
    expect(perms.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// SECTION 3 — canAny() / canAll()
// Ognuna chiama getUserPermissions → 2 db.select()
// ---------------------------------------------------------------------------
describe('canAny() / canAll()', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('canAny: true se almeno uno dei permessi e presente', async () => {
    seq([{ key: 'admin:access' }], [])
    const { canAny } = await import('@/lib/rbac/can')
    expect(await canAny({ id: "1", role: 'admin' }, ['admin:access', 'admin:billing'])).toBe(true)
  })

  it('canAny: false se nessuno dei permessi e presente', async () => {
    seq([], [])
    const { canAny } = await import('@/lib/rbac/can')
    expect(await canAny({ id: "2", role: 'member' }, ['admin:access', 'admin:billing'])).toBe(false)
  })

  it('canAll: true se tutti i permessi sono presenti', async () => {
    seq([{ key: 'admin:access' }, { key: 'admin:users' }], [])
    const { canAll } = await import('@/lib/rbac/can')
    expect(await canAll({ id: "1", role: 'admin' }, ['admin:access', 'admin:users'])).toBe(true)
  })

  it('canAll: false se anche solo un permesso manca', async () => {
    seq([{ key: 'admin:access' }], [])
    const { canAll } = await import('@/lib/rbac/can')
    expect(await canAll({ id: "1", role: 'admin' }, ['admin:access', 'admin:billing'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SECTION 4 — guards.ts
//
// requireAdminPage():
//   isAdmin=false → chiama can(user,'admin:access') → 2 db.select() [q1=override, q2=role]
//   isAdmin=true  → nessuna query
//
// requireAdminSectionPage():
//   isAdmin=true  → nessuna query
//   altrimenti:
//     can(user,'admin:access') → 2 db.select()
//     can(user, sectionKey)   → 2 db.select()
//   totale per utente non-super: 4 db.select()
// ---------------------------------------------------------------------------
describe('guards.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('requireAdminPage()', () => {
    it('redirige a /admin/sign-in se utente non autenticato', async () => {
      mockGetUser.mockResolvedValue(null)
      const { requireAdminPage } = await import('@/lib/rbac/guards')
      await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/admin/sign-in')
    })

    it('redirige a /admin/sign-in se autenticato ma senza admin:access', async () => {
      mockGetUser.mockResolvedValue({ id: 1, role: 'member', isAdmin: false })
      // can() q1=override[], q2=role[] → false → redirect
      seq([], [])
      const { requireAdminPage } = await import('@/lib/rbac/guards')
      await expect(requireAdminPage()).rejects.toThrow('REDIRECT:/admin/sign-in')
    })

    it('ritorna utente se ha admin:access via ruolo', async () => {
      const user = { id: 2, role: 'admin', isAdmin: false }
      mockGetUser.mockResolvedValue(user)
      // can() q1=override[], q2=role[{ id:1 }] → true
      seq([], [{ id: 1 }])
      const { requireAdminPage } = await import('@/lib/rbac/guards')
      expect(await requireAdminPage()).toEqual(user)
    })

    it('ritorna utente se isAdmin=true (bypassa RBAC)', async () => {
      const user = { id: 10, role: 'member', isAdmin: true }
      mockGetUser.mockResolvedValue(user)
      // hasAdminAccess ritorna subito true senza query
      const { requireAdminPage } = await import('@/lib/rbac/guards')
      expect(await requireAdminPage()).toEqual(user)
    })
  })

  describe('requireAdminSectionPage()', () => {
    it('redirige a /admin/sign-in se non autenticato', async () => {
      mockGetUser.mockResolvedValue(null)
      const { requireAdminSectionPage } = await import('@/lib/rbac/guards')
      await expect(requireAdminSectionPage('admin:users')).rejects.toThrow('REDIRECT:/admin/sign-in')
    })

    it('bypassa tutto se isAdmin=true', async () => {
      const user = { id: 10, role: 'member', isAdmin: true }
      mockGetUser.mockResolvedValue(user)
      const { requireAdminSectionPage } = await import('@/lib/rbac/guards')
      expect(await requireAdminSectionPage('admin:users')).toEqual(user)
    })

    it('redirige a /admin/sign-in se non ha admin:access', async () => {
      mockGetUser.mockResolvedValue({ id: 3, role: 'member', isAdmin: false })
      // can(user,'admin:access'): q1=[], q2=[] → false → redirect sign-in
      seq([], [])
      const { requireAdminSectionPage } = await import('@/lib/rbac/guards')
      await expect(requireAdminSectionPage('admin:users')).rejects.toThrow('REDIRECT:/admin/sign-in')
    })

    it('redirige a /admin se ha admin:access ma non il permesso della sezione', async () => {
      mockGetUser.mockResolvedValue({ id: 4, role: 'staff', isAdmin: false })
      // can(user,'admin:access'): q1=[], q2=[{ id:1 }] → true
      // can(user,'admin:users'):  q1=[], q2=[]         → false → redirect /admin
      seq([], [{ id: 1 }], [], [])
      const { requireAdminSectionPage } = await import('@/lib/rbac/guards')
      await expect(requireAdminSectionPage('admin:users')).rejects.toThrow('REDIRECT:/admin')
    })

    it('ritorna utente se ha sia admin:access sia il permesso della sezione', async () => {
      const user = { id: 5, role: 'admin', isAdmin: false }
      mockGetUser.mockResolvedValue(user)
      // can(user,'admin:access'): q1=[], q2=[{ id:1 }] → true
      // can(user,'admin:users'):  q1=[], q2=[{ id:2 }] → true
      seq([], [{ id: 1 }], [], [{ id: 2 }])
      const { requireAdminSectionPage } = await import('@/lib/rbac/guards')
      expect(await requireAdminSectionPage('admin:users')).toEqual(user)
    })
  })
})
