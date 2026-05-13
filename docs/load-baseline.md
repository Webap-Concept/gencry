# Load test baseline

Risultati del load test automatizzato (`pnpm run test:load`). Tieni questo file aggiornato dopo ogni modifica architetturale rilevante (caching, pool sizing, refactor query, ecc.) — la storia di queste tabelle è la difesa contro regressioni di scaling.

## Come eseguire

1. `pnpm build && pnpm start` (NON `pnpm dev` — Turbopack distorce i numeri)
2. Login dal browser, copia il cookie `session` da DevTools → Application → Cookies
3. `LOAD_TEST_SESSION_COOKIE="session=..." pnpm run test:load`
4. Lo script salva un JSON timestampato in `docs/load-tests/`
5. Aggiorna le tabelle sotto con i numeri rilevanti

## Scenari testati

| # | Endpoint | Auth | Cosa misura |
|---|----------|------|-------------|
| 1 | `/` | guest | Baseline cold-read pubblico (no DB pool dal proxy/layout) |
| 2 | `/` | logged | Protected layout (5 query) + AppRightRail + DynamicWrapper |
| 3 | `/settings/privacy` | logged | Pagina del bug originale (settings + privacy = ~11 query in 2 layout) |
| 4 | `/admin` | logged | Dashboard admin (~9 widget server-rendered in parallelo) |

Livelli connessioni: 10 / 50 / 100 / 200 (più 500 sullo scenario guest). Duration: 30s/livello.

## Baseline storica

### 2026-05-13 — post Scale Prep Fase 1+2 (R2 snapshot + prefetch off)

> Aggiungi qui i risultati dopo aver eseguito il primo `pnpm run test:load` con tutti i fix attivi.

```
| Scenario          | Conn | Req/s | p50  | p95  | p99  | err | non2xx |
|-------------------|-----:|------:|-----:|-----:|-----:|----:|-------:|
| Home (logged out) |   10 |    -- |   -- |   -- |   -- |  -- |     -- |
| Home (logged out) |  100 |    -- |   -- |   -- |   -- |  -- |     -- |
| Home (logged out) |  500 |    -- |   -- |   -- |   -- |  -- |     -- |
| Home (logged in)  |   10 |    -- |   -- |   -- |   -- |  -- |     -- |
| Home (logged in)  |   50 |    -- |   -- |   -- |   -- |  -- |     -- |
| Home (logged in)  |  100 |    -- |   -- |   -- |   -- |  -- |     -- |
| Home (logged in)  |  200 |    -- |   -- |   -- |   -- |  -- |     -- |
| Settings privacy  |   10 |    -- |   -- |   -- |   -- |  -- |     -- |
| Settings privacy  |   50 |    -- |   -- |   -- |   -- |  -- |     -- |
| Settings privacy  |  100 |    -- |   -- |   -- |   -- |  -- |     -- |
| Settings privacy  |  200 |    -- |   -- |   -- |   -- |  -- |     -- |
| Admin dashboard   |   10 |    -- |   -- |   -- |   -- |  -- |     -- |
| Admin dashboard   |   50 |    -- |   -- |   -- |   -- |  -- |     -- |
| Admin dashboard   |  100 |    -- |   -- |   -- |   -- |  -- |     -- |
| Admin dashboard   |  200 |    -- |   -- |   -- |   -- |  -- |     -- |
```

Note operative dell'esecuzione (compila dopo il run):
- Hardware: ___ (es. Windows 10 / 16 GB / dev locale)
- Pool DB attuale: max=30
- R2 snapshot: ✓ attivo / ✗ fallback DB
- Latenza DB Supabase: ~_ms baseline

## Threshold interpretativi

- **p99 < 1s** = OK
- **p99 1-3s** = sotto stress ma reggiamo
- **p99 > 3s o errors > 0** = pool saturato o altri colli di bottiglia
- **non2xx > 0 senza errors** = redirect imprevisti, 5xx dal proxy o middleware

## Come usare i numeri

- **Regression check**: prima di un refactor di scaling, ri-esegui il test e confronta. Una scenarios `Settings privacy @ 100 conn` che peggiora di >30% p99 è red flag.
- **Capacity planning**: il punto dove `errors > 0` ti dice la soglia di rottura della **singola istanza Vercel**. Vercel scala auto, ma se quella soglia è troppo bassa ogni lambda paga troppi crediti.
- **Pool tuning** (Fase 5 dello Scale Prep): se `Settings privacy @ 200 conn` regge senza errors con p99 < 1.5s, possiamo provare a scendere il pool a 15-20 per liberare TCP slot al pooler Supabase.

## Riferimenti

- Script: `scripts/load-test.ts`
- Plan: `[[project-scale-prep-plan]]` (memory)
- Convenzioni: `[[feedback-scaling-conventions]]` (memory)
- Bug originale: `[[project-rsc-prefetch-fanout-bug]]` (memory)
