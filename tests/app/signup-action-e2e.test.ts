// tests/app/signup-action-e2e.test.ts
//
// Flusso integrato signUpAction — mock di tutti i layer esterni,
// verifica l'orchestrazione end-to-end della Server Action.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock next/navigation ────────────────────────────────────────────────────
const mockRedirect = vi.fn((url: string): never => {
  throw { __nextRedirect: true, url };
});
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

// ─── Mock next/headers ───────────────────────────────────────────────────────
const mockCookiesSet = vi.fn();
const mockCookiesDelete = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ "x-forwarded-for": "1.2.3.4" })),
  cookies: vi.fn().mockResolvedValue({
    set: mockCookiesSet,
    delete: mockCookiesDelete,
    get: vi.fn(),
  }),
}));

// ─── Mock server-only ────────────────────────────────────────────────────────
vi.mock("server-only", () => ({}));

// ─── Mock next-intl/server (getTranslations) ─────────────────────────────────
// Le actions chiamano getTranslations("auth") per ritornare error messages
// localizzati. Nel test environment non c'è un request scope di next-intl,
// quindi mockiamo il loader leggendo direttamente il JSON italiano e
// risolvendo la chiave dotted (es. "actionErrors.signUp.emailTaken").
vi.mock("next-intl/server", async () => {
  const itAuth = (await import("@/messages/it/auth.json")).default as Record<string, unknown>;
  return {
    getTranslations: async (_namespace?: string) => {
      return (key: string) => {
        const parts = key.split(".");
        let value: unknown = itAuth;
        for (const p of parts) {
          if (typeof value === "object" && value !== null && p in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[p];
          } else {
            return key;
          }
        }
        return typeof value === "string" ? value : key;
      };
    },
  };
});

// ─── Mock getAppSettings ─────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  registrations_enabled: "true",
  maintenance_mode: "false",
  default_role: "member",
  bf_signup_max: "10",
  bf_window_minutes: "15",
  bf_lockout_minutes: "30",
  bf_alert_threshold: "20",
  bf_check_max: "30",
  bf_check_window: "5",
  bf_signin_max: "5",
  upstash_redis_rest_url: "https://fake.upstash.io",
  upstash_redis_rest_token: "fake-token",
};

const mockGetAppSettings = vi.fn().mockResolvedValue(DEFAULT_SETTINGS);
vi.mock("@/lib/db/settings-queries", () => ({
  getAppSettings: mockGetAppSettings,
}));

// ─── Mock rate-limit ─────────────────────────────────────────────────────────
const mockCheckSignupRateLimit = vi.fn().mockResolvedValue({ blocked: false, remaining: 9 });
const mockRecordSignupAttempt  = vi.fn().mockResolvedValue(undefined);
const mockCheckRateLimit       = vi.fn().mockResolvedValue({ blocked: false, remaining: 4, lockoutMinutes: 30 });
const mockRecordLoginAttempt   = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/rate-limit", () => ({
  checkSignupRateLimit:       mockCheckSignupRateLimit,
  recordSignupAttempt:        mockRecordSignupAttempt,
  checkRateLimit:             mockCheckRateLimit,
  recordLoginAttempt:         mockRecordLoginAttempt,
  checkAvailabilityRateLimit: vi.fn().mockResolvedValue({ blocked: false, remaining: 29 }),
}));

// ─── Mock blacklist ───────────────────────────────────────────────────────────
const mockIsIpBlacklisted       = vi.fn().mockResolvedValue(false);
const mockIsDomainBlacklisted   = vi.fn().mockResolvedValue(false);
const mockIsUsernameBlacklisted = vi.fn().mockResolvedValue(false);
vi.mock("@/lib/auth/blacklist", () => ({
  isIpBlacklisted:       mockIsIpBlacklisted,
  isDomainBlacklisted:   mockIsDomainBlacklisted,
  isUsernameBlacklisted: mockIsUsernameBlacklisted,
}));

// ─── Mock bloom-filter ───────────────────────────────────────────────────────
const mockCheckEmailAvailability    = vi.fn().mockResolvedValue({ available: true, checkedViaDb: false });
const mockCheckUsernameAvailability = vi.fn().mockResolvedValue({ available: true, checkedViaDb: false });
const mockAddEmailToBloom           = vi.fn().mockResolvedValue(undefined);
const mockAddUsernameToBloom        = vi.fn().mockResolvedValue(undefined);
const mockEnsureBloomFilter         = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/bloom/bloom-filter", () => ({
  checkEmailAvailability:    mockCheckEmailAvailability,
  checkUsernameAvailability: mockCheckUsernameAvailability,
  addEmailToBloom:           mockAddEmailToBloom,
  addUsernameToBloom:        mockAddUsernameToBloom,
  ensureBloomFilter:         mockEnsureBloomFilter,
  invalidateRedisConfigCache: vi.fn(),
}));

// ─── Mock DB (Drizzle) ────────────────────────────────────────────────────────
//
// DESIGN: db.insert() is called 3 times during signUp:
//   call 1 → users          → .values().returning()
//   call 2 → userProfiles   → .values()
//   call 3 → activityLogs   → .values()

const MOCK_USER = {
  id: "user-abc-123",
  email: "mario@example.com",
  passwordHash: "$2b$12$hashedXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  role: "member",
  bannedAt: null,
};

const mockUsersReturning = vi.fn().mockResolvedValue([MOCK_USER]);
const mockUsersValues    = vi.fn().mockReturnValue({ returning: mockUsersReturning });
const mockProfilesValues = vi.fn().mockResolvedValue([]);
const mockActivityValues = vi.fn().mockResolvedValue([]);
const mockDbDeleteWhere  = vi.fn().mockResolvedValue([]);

let insertCallCount = 0;

vi.mock("@/lib/db/drizzle", () => ({
  db: {
    insert: vi.fn(() => {
      insertCallCount += 1;
      if (insertCallCount === 1) return { values: mockUsersValues };
      if (insertCallCount === 2) return { values: mockProfilesValues };
      return { values: mockActivityValues };
    }),
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: vi.fn().mockResolvedValue([MOCK_USER]) }) }),
    })),
    delete: vi.fn(() => ({ where: mockDbDeleteWhere })),
    update: vi.fn(() => ({ set: () => ({ where: vi.fn() }) })),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  users:        { id: "id", email: "email", passwordHash: "passwordHash" },
  userProfiles: { id: "id", username: "username", userId: "userId" },
  activityLogs: { userId: "userId", action: "action", ipAddress: "ipAddress" },
  ActivityType: {
    SIGN_UP: "SIGN_UP", SIGN_IN: "SIGN_IN", SIGN_OUT: "SIGN_OUT",
    DELETE_ACCOUNT: "DELETE_ACCOUNT", UPDATE_PASSWORD: "UPDATE_PASSWORD",
    UPDATE_ACCOUNT: "UPDATE_ACCOUNT",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq:  vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  sql: Object.assign(
    vi.fn((s: TemplateStringsArray) => s[0]),
    { raw: vi.fn((s: string) => s) },
  ),
}));

// ─── Mock session / password ──────────────────────────────────────────────────
const mockHashPassword     = vi.fn().mockResolvedValue("$2b$12$hashedXXX");
const mockComparePasswords = vi.fn().mockResolvedValue(true);
const mockSetSession       = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/session", () => ({
  hashPassword:     mockHashPassword,
  comparePasswords: mockComparePasswords,
  setSession:       mockSetSession,
  getSession:       vi.fn(),
}));

// ─── Mock OTP ─────────────────────────────────────────────────────────────────
const mockCreateVerificationCode = vi.fn().mockResolvedValue("123456");
vi.mock("@/lib/auth/otp", () => ({
  createVerificationCode: mockCreateVerificationCode,
}));

// ─── Mock email ───────────────────────────────────────────────────────────────
const mockSendSignupVerificationEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email/templates/signup-verification", () => ({
  sendSignupVerificationEmail: mockSendSignupVerificationEmail,
}));

// ─── Mock race-condition helpers ──────────────────────────────────────────────
const mockIsUniqueConstraintError = vi.fn().mockReturnValue(false);
vi.mock("@/lib/auth/race-condition", () => ({
  isUniqueConstraintError: mockIsUniqueConstraintError,
  resolveConflictField:    vi.fn().mockReturnValue("email"),
}));

// ─── Mock consent versions ────────────────────────────────────────────────────
vi.mock("@/lib/db/pages-queries", () => ({
  getConsentVersions: vi.fn().mockResolvedValue({
    termsVersion: "1.0", privacyVersion: "1.0", marketingVersion: "1.0",
  }),
  getConsentSnapshots: vi.fn().mockResolvedValue({
    terms:     { version: "1.0", text: "Terms text"     },
    privacy:   { version: "1.0", text: "Privacy text"   },
    marketing: { version: "1.0", text: "Marketing text" },
  }),
}));

// ─── Mock consent-ledger (signup ledger writes) ──────────────────────────────
const mockRecordSignupConsents = vi.fn().mockResolvedValue(undefined);
const mockRecordConsent        = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/account/consent-ledger", () => ({
  recordSignupConsents: mockRecordSignupConsents,
  recordConsent:        mockRecordConsent,
}));

// ─── Mock middleware ──────────────────────────────────────────────────────────
vi.mock("@/lib/auth/middleware", () => ({
  validatedAction: vi.fn(
    (
      schema: { safeParseAsync: (d: unknown) => Promise<{
        success: boolean;
        data?: unknown;
        error?: { flatten: () => { fieldErrors: Record<string, string[]> } };
      }> },
      fn: (data: unknown, fd: FormData) => Promise<unknown>,
    ) =>
      async (_prevState: unknown, formData: FormData) => {
        const result = await schema.safeParseAsync(Object.fromEntries(formData.entries()));
        if (!result.success) {
          const fieldErrors = result.error!.flatten().fieldErrors;
          const firstMsg = Object.values(fieldErrors).flat()[0] ?? "Dati non validi";
          return { error: firstMsg };
        }
        return fn(result.data, formData);
      },
  ),
  validatedActionWithUser: vi.fn((_schema: unknown, fn: unknown) => fn),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
// NOTA: firstName, lastName e confirmPassword rimossi dal form di registrazione.
// La password ora deve soddisfare anche il requisito del carattere speciale
// introdotto nello schema server insieme alla rimozione di nome/cognome.
function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    username:     "mario_rossi",
    email:        "mario@example.com",
    password:     "Password1!",   // soddisfa: min8, maiuscola, numero, carattere speciale
    acceptTerms:  "on",
    acceptPrivacy: "on",
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(k, v);
  }
  return fd;
}

async function callSignUp(overrides: Record<string, string> = {}) {
  const { signUp } = await import("@/app/(login)/actions");
  try {
    return await signUp({} as never, makeFormData(overrides));
  } catch (e: unknown) {
    const err = e as { __nextRedirect?: boolean; url?: string };
    if (err.__nextRedirect) return { redirected: true, url: err.url };
    throw e;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("signUpAction — flusso end-to-end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCallCount = 0;

    mockGetAppSettings.mockResolvedValue(DEFAULT_SETTINGS);
    mockCheckSignupRateLimit.mockResolvedValue({ blocked: false, remaining: 9 });
    mockIsIpBlacklisted.mockResolvedValue(false);
    mockIsDomainBlacklisted.mockResolvedValue(false);
    mockIsUsernameBlacklisted.mockResolvedValue(false);
    mockCheckEmailAvailability.mockResolvedValue({ available: true, checkedViaDb: false });
    mockCheckUsernameAvailability.mockResolvedValue({ available: true, checkedViaDb: false });
    mockIsUniqueConstraintError.mockReturnValue(false);
    mockCreateVerificationCode.mockResolvedValue("123456");
    mockSendSignupVerificationEmail.mockResolvedValue(undefined);
    mockDbDeleteWhere.mockResolvedValue([]);

    mockUsersReturning.mockResolvedValue([MOCK_USER]);
    mockUsersValues.mockReturnValue({ returning: mockUsersReturning });
    mockProfilesValues.mockResolvedValue([]);
    mockActivityValues.mockResolvedValue([]);
  });

  // ─── Happy path ────────────────────────────────────────────────────────────
  describe("Happy path", () => {
    it("completa la registrazione e fa redirect a /verify-email", async () => {
      const result = await callSignUp();
      expect(result).toMatchObject({ redirected: true, url: "/verify-email" });
    });

    it("chiama hashPassword con la password fornita", async () => {
      await callSignUp();
      expect(mockHashPassword).toHaveBeenCalledWith("Password1!");
    });

    it("aggiunge email al Bloom filter dopo l'insert", async () => {
      await callSignUp();
      expect(mockAddEmailToBloom).toHaveBeenCalledWith("mario@example.com");
    });

    it("aggiunge username al Bloom filter dopo l'insert", async () => {
      await callSignUp();
      expect(mockAddUsernameToBloom).toHaveBeenCalledWith("mario_rossi");
    });

    // firstName non è più raccolto in fase di registrazione:
    // sendSignupVerificationEmail riceve undefined come terzo argomento.
    it("invia email di verifica con email, OTP e firstName=undefined", async () => {
      await callSignUp();
      expect(mockSendSignupVerificationEmail).toHaveBeenCalledWith(
        "mario@example.com",
        "123456",
        undefined,
      );
    });

    it("imposta cookie pending_verification_user_id con httpOnly", async () => {
      await callSignUp();
      expect(mockCookiesSet).toHaveBeenCalledWith(
        "pending_verification_user_id",
        MOCK_USER.id,
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it("accetta registrazione con acceptMarketing=on", async () => {
      const result = await callSignUp({ acceptMarketing: "on" });
      expect(result).toMatchObject({ redirected: true, url: "/verify-email" });
    });

    // userProfiles viene inserito solo con username; firstName e lastName
    // sono null nel DB fino a quando l'utente non li compila dal profilo.
    it("inserisce userProfiles con solo username (firstName/lastName null)", async () => {
      await callSignUp();
      expect(mockProfilesValues).toHaveBeenCalledWith(
        expect.objectContaining({ username: "mario_rossi" }),
      );
      const callArg = mockProfilesValues.mock.calls[0][0] as Record<string, unknown>;
      expect(callArg.firstName).toBeUndefined();
      expect(callArg.lastName).toBeUndefined();
    });
  });

  // ─── Consent ledger ───────────────────────────────────────────────────────
  describe("Consent ledger (GDPR)", () => {
    it("scrive consent_records con userId, ip e source='signup'", async () => {
      await callSignUp();
      expect(mockRecordSignupConsents).toHaveBeenCalledTimes(1);
      expect(mockRecordSignupConsents).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: MOCK_USER.id,
          ip: "1.2.3.4",
          source: "signup",
        }),
      );
    });

    it("acceptMarketing=false quando il checkbox non è spuntato", async () => {
      await callSignUp();
      const arg = mockRecordSignupConsents.mock.calls[0][0] as { acceptMarketing: boolean };
      expect(arg.acceptMarketing).toBe(false);
    });

    it("acceptMarketing=true quando il checkbox è 'on'", async () => {
      await callSignUp({ acceptMarketing: "on" });
      const arg = mockRecordSignupConsents.mock.calls[0][0] as { acceptMarketing: boolean };
      expect(arg.acceptMarketing).toBe(true);
    });

    it("non scrive il ledger quando la registrazione fallisce per email duplicata", async () => {
      mockUsersReturning.mockRejectedValueOnce(new Error("unique violation"));
      mockIsUniqueConstraintError.mockReturnValueOnce(true);
      await callSignUp();
      expect(mockRecordSignupConsents).not.toHaveBeenCalled();
    });
  });

  // ─── Registrations disabled ───────────────────────────────────────────────
  describe("Registrazioni disabilitate", () => {
    it("restituisce errore se registrations_enabled=false", async () => {
      mockGetAppSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, registrations_enabled: "false" });
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("chiuse") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });
  });

  // ─── Rate limiting ────────────────────────────────────────────────────────
  describe("Rate limiting", () => {
    it("blocca se checkSignupRateLimit è blocked", async () => {
      mockCheckSignupRateLimit.mockResolvedValue({ blocked: true, remaining: 0 });
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("Troppi tentativi") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });
  });

  // ─── Blacklists ───────────────────────────────────────────────────────────
  describe("Blacklists", () => {
    it("blocca IP nella blacklist", async () => {
      mockIsIpBlacklisted.mockResolvedValue(true);
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("Accesso non consentito") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });

    it("blocca dominio email nella blacklist", async () => {
      mockIsDomainBlacklisted.mockResolvedValue(true);
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("provider email") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });

    it("blocca username nella blacklist", async () => {
      mockIsUsernameBlacklisted.mockResolvedValue(true);
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("username non è disponibile") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });
  });

  // ─── Bloom filter guards ──────────────────────────────────────────────────
  describe("Bloom filter guards", () => {
    it("restituisce errore se email già registrata", async () => {
      mockCheckEmailAvailability.mockResolvedValue({ available: false, checkedViaDb: true });
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("email è già stata registrata") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });

    it("restituisce errore se username già in uso", async () => {
      mockCheckUsernameAvailability.mockResolvedValue({ available: false, checkedViaDb: true });
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("username è già in uso") });
      expect(mockUsersReturning).not.toHaveBeenCalled();
    });
  });

  // ─── Race conditions ──────────────────────────────────────────────────────
  describe("Race conditions", () => {
    it("gestisce race condition su email (unique constraint users) → recordSignupAttempt", async () => {
      mockUsersReturning.mockRejectedValueOnce(new Error("unique violation"));
      mockIsUniqueConstraintError.mockReturnValueOnce(true);
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("appena stata registrata") });
      expect(mockRecordSignupAttempt).toHaveBeenCalledWith("1.2.3.4");
    });

    it("gestisce race condition su username (unique constraint userProfiles) → elimina user orfano + recordSignupAttempt", async () => {
      mockProfilesValues.mockRejectedValueOnce(new Error("unique violation"));
      mockIsUniqueConstraintError.mockReturnValueOnce(true);
      const result = await callSignUp();
      expect(result).toMatchObject({ error: expect.stringContaining("username è appena stato scelto") });
      expect(mockDbDeleteWhere).toHaveBeenCalled();
      expect(mockRecordSignupAttempt).toHaveBeenCalledWith("1.2.3.4");
    });
  });

  // ─── Email verification fallback ──────────────────────────────────────────
  describe("Email verification fallback", () => {
    it("non interrompe il flusso se sendSignupVerificationEmail fallisce", async () => {
      mockSendSignupVerificationEmail.mockRejectedValueOnce(new Error("Resend error"));
      const result = await callSignUp();
      expect(result).toMatchObject({ redirected: true, url: "/verify-email" });
      expect(mockAddEmailToBloom).toHaveBeenCalled();
      expect(mockCookiesSet).toHaveBeenCalled();
    });
  });

  // ─── Validazione Zod ──────────────────────────────────────────────────────
  describe("Validazione schema", () => {
    // firstName e lastName non fanno più parte dello schema di registrazione.
    // Vengono raccolti nella pagina profilo dopo la registrazione.
    it("ignora firstName se passato (non fa parte dello schema)", async () => {
      const result = await callSignUp({ firstName: "" });
      // Il campo viene ignorato dallo schema: la registrazione prosegue normalmente
      expect(result).toMatchObject({ redirected: true, url: "/verify-email" });
    });

    it("rifiuta password senza carattere speciale", async () => {
      const result = await callSignUp({ password: "Password1" });
      expect(result).toMatchObject({ error: expect.stringContaining("carattere speciale") });
      expect(mockGetAppSettings).not.toHaveBeenCalled();
    });

    it("rifiuta password senza maiuscola", async () => {
      const result = await callSignUp({ password: "password1!" });
      expect(result).toMatchObject({ error: expect.anything() });
      expect(mockGetAppSettings).not.toHaveBeenCalled();
    });

    it("rifiuta password troppo corta", async () => {
      const result = await callSignUp({ password: "P1!" });
      expect(result).toMatchObject({ error: expect.anything() });
      expect(mockGetAppSettings).not.toHaveBeenCalled();
    });

    it("rifiuta acceptTerms non spuntato", async () => {
      const result = await callSignUp({ acceptTerms: "off" });
      expect(result).toMatchObject({ error: expect.stringContaining("Termini") });
      expect(mockGetAppSettings).not.toHaveBeenCalled();
    });

    it("rifiuta email malformata", async () => {
      const result = await callSignUp({ email: "non-una-email" });
      expect(result).toMatchObject({ error: expect.anything() });
      expect(mockGetAppSettings).not.toHaveBeenCalled();
    });

    it("rifiuta username con caratteri non ammessi", async () => {
      const result = await callSignUp({ username: "mario rossi!" });
      expect(result).toMatchObject({ error: expect.anything() });
      expect(mockGetAppSettings).not.toHaveBeenCalled();
    });
  });
});
