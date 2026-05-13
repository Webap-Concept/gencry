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

### 2026-05-13 — post Scale Prep Fase 1+2 (R2 snapshot + prefetch off) — `--quick`

Smoke test a livello singolo (50 conn × 30s tranne Home logged-out a 100 conn).
Dopo il fix critico `8d96f90` (fast-path cache sullo snapshot storage).

| Scenario          | Conn | Req/s | p50    | p95    | p99    | err | non2xx |
|-------------------|-----:|------:|-------:|-------:|-------:|----:|-------:|
| Home (logged out) |  100 |    65 | 1410ms | 3360ms | 3895ms |   0 |      0 |
| Home (logged in)  |   50 |    73 |  663ms |  932ms |  957ms |   0 |      0 |
| Settings privacy  |   50 |    71 |  681ms | 1026ms | 1216ms |   0 |      0 |
| Admin dashboard   |   50 |    74 |  656ms |  960ms | 1256ms |   0 |      0 |

Note operative:
- Hardware: dev locale Windows / Node 24
- Pool DB: max=30 (postgres-js)
- R2 snapshot: ✓ attivo per `app_settings`, ✓ attivo per `system-pages`
- Server: `pnpm start` (production build)
- Admin URL slug: `businessmanager` (passato via `LOAD_TEST_ADMIN_SLUG`)
- Test run: `LOAD_TEST_SESSION_COOKIE=... LOAD_TEST_ADMIN_SLUG=businessmanager pnpm run test:load -- --quick`

**Conclusioni**:
- 0 errori / 0 non2xx su tutti gli scenari = pool DB **non si satura** più a 50-100 conn
- Le pagine "pesanti" loggate (home / settings / admin) sono comparable: ~70 req/s, p99 ~1-1.3s
- **Home pubblica @ 100 conn è il punto più lento** (p99 ~4s) — il CMS catch-all `[...slug]` è il bottleneck adesso, non il pool DB. Candidato Fase 6 (cache CMS lookups)
- Confronto col precedente run con bug: 0 req/s + 100% errors → 70 req/s + 0% errors

**Bug critico scoperto e fixato in questo run** (`8d96f90`):
La factory `getSnapshotStorage` leggeva le credenziali R2 dal DB ad **ogni request**, vanificando la cache. Sotto load = N×50 query DB → saturazione + EPIPE/CONNECTION_CLOSED cascade. Fixato con fast-path cache che check il client S3 PRIMA di toccare il DB.

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
