// scripts/load-test.ts
//
// Load test automatizzato basato su autocannon. Misura come l'app si comporta
// sotto carico crescente (10 → 50 → 100 → 200 connessioni concorrenti) su
// 4 endpoint critici. Output: tabella markdown + JSON timestampato.
//
// Uso:
//   pnpm run test:load                       # locale, scenari pubblici soltanto
//   LOAD_TEST_SESSION_COOKIE="session=..." pnpm run test:load
//                                            # tutti gli scenari (incluso loggati)
//   pnpm run test:load -- --quick            # solo livello 50 connections (smoke)
//   pnpm run test:load -- --url=https://...  # contro un'altra base URL
//
// Pre-requisiti:
//   1. L'app deve essere in esecuzione (`pnpm build && pnpm start`).
//      MAI testare contro `pnpm dev` (Turbopack è 5-10x più lento e i numeri
//      non rappresentano la realtà di produzione).
//   2. Per gli scenari "loggato", servono i cookie di una sessione valida:
//      - Apri DevTools → Application → Cookies
//      - Copia il valore del cookie "session"
//      - Esporta come env var: LOAD_TEST_SESSION_COOKIE="session=eyJ..."
//
// Output:
//   - Tabella markdown in console con metriche per scenario × connections
//   - File JSON in docs/load-tests/load-test-<ISO>.json con tutti i dati
//   - Se vuoi confrontare nel tempo, salva i JSON sotto git e mantieni una
//     timeline di baseline (vedi docs/load-baseline.md).

import autocannon from "autocannon";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Args {
  baseUrl: string;
  quick: boolean;
}

interface Scenario {
  name: string;
  url: string;
  requireAuth: boolean;
  /** Livelli di connessioni da provare in sequenza. */
  connections: number[];
  /** Secondi per livello. */
  duration: number;
}

interface ScenarioRun {
  scenario: string;
  url: string;
  connections: number;
  duration: number;
  result: {
    requests: { total: number; average: number };
    latency: { mean: number; p50: number; p95: number; p99: number };
    throughputReqPerSec: number;
    errors: number;
    timeouts: number;
    non2xx: number;
  };
}

function parseArgs(): Args {
  const args: Args = { baseUrl: "http://localhost:3000", quick: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--url=")) args.baseUrl = arg.slice(6).replace(/\/$/, "");
    else if (arg === "--quick") args.quick = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: tsx scripts/load-test.ts [--url=<base>] [--quick]\n\n" +
          "Env vars:\n" +
          "  LOAD_TEST_SESSION_COOKIE  session cookie for auth scenarios",
      );
      process.exit(0);
    }
  }
  return args;
}

const FULL_LEVELS = [10, 50, 100, 200];
const QUICK_LEVELS = [50];

function getScenarios(args: Args): Scenario[] {
  const levels = args.quick ? QUICK_LEVELS : FULL_LEVELS;
  return [
    {
      name: "Home (logged out)",
      url: "/",
      requireAuth: false,
      // Public home: niente DB pool pressure dal proxy/layout (no session),
      // serve da baseline "cold read" rispetto agli scenari loggati.
      connections: args.quick ? [100] : [10, 100, 500],
      duration: 30,
    },
    {
      name: "Home (logged in)",
      url: "/",
      requireAuth: true,
      // Protected layout = 5 query DB + AppRightRail + DynamicWrapper.
      // Lo scenario più "tipico" per un utente che apre l'app.
      connections: levels,
      duration: 30,
    },
    {
      name: "Settings privacy",
      url: "/settings/privacy",
      requireAuth: true,
      // Pagina del bug originale: protected layout + settings nested layout
      // + privacy page (6 query in Promise.all).
      connections: levels,
      duration: 30,
    },
    {
      name: "Admin dashboard",
      url: "/admin",
      requireAuth: true,
      // ~9 widget server-rendered in parallelo. Stress sulle query
      // dashboard (gdpr, signups, suspicious sessions, ecc.).
      connections: levels,
      duration: 30,
    },
  ];
}

async function runScenario(
  args: Args,
  scenario: Scenario,
  connections: number,
  sessionCookie: string | null,
): Promise<ScenarioRun> {
  const headers: Record<string, string> = {};
  if (scenario.requireAuth && sessionCookie) {
    headers.cookie = sessionCookie;
  }

  const result = await autocannon({
    url: `${args.baseUrl}${scenario.url}`,
    connections,
    duration: scenario.duration,
    headers,
    // Tieni le request pipelined a 1: il prefetch RSC le moltiplica naturalmente,
    // pipelining aggressivo distorcerebbe la simulazione.
    pipelining: 1,
    // Disabilita la barra di progresso (autocannon usa terminal control codes
    // che spezzano l'output quando si scrive a file/CI).
    workers: undefined,
  });

  return {
    scenario: scenario.name,
    url: scenario.url,
    connections,
    duration: scenario.duration,
    result: {
      requests: {
        total: result.requests.total,
        average: result.requests.average,
      },
      latency: {
        mean: result.latency.mean,
        p50: result.latency.p50,
        p95: result.latency.p97_5, // autocannon usa p97_5 invece di p95
        p99: result.latency.p99,
      },
      throughputReqPerSec: result.requests.average,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
    },
  };
}

function renderTable(runs: ScenarioRun[]): string {
  const lines: string[] = [];
  lines.push("| Scenario | Conn | Req/s | p50 | p95 | p99 | err | non2xx |");
  lines.push("|----------|-----:|------:|----:|----:|----:|----:|-------:|");
  for (const r of runs) {
    lines.push(
      `| ${r.scenario} | ${r.connections} | ` +
        `${r.result.throughputReqPerSec.toFixed(0)} | ` +
        `${r.result.latency.p50}ms | ` +
        `${r.result.latency.p95}ms | ` +
        `${r.result.latency.p99}ms | ` +
        `${r.result.errors} | ${r.result.non2xx} |`,
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const sessionCookie = process.env.LOAD_TEST_SESSION_COOKIE ?? null;
  const scenarios = getScenarios(args);

  console.log(`\n📊 Load test baseline against ${args.baseUrl}`);
  console.log(`Auth scenarios: ${sessionCookie ? "✓ cookie set" : "✗ cookie missing → skipped"}\n`);

  const runs: ScenarioRun[] = [];
  for (const scenario of scenarios) {
    if (scenario.requireAuth && !sessionCookie) {
      console.log(`⊘ Skipping "${scenario.name}" (no LOAD_TEST_SESSION_COOKIE)`);
      continue;
    }
    for (const connections of scenario.connections) {
      console.log(
        `▶ ${scenario.name} · ${connections} connections · ${scenario.duration}s ...`,
      );
      try {
        const run = await runScenario(args, scenario, connections, sessionCookie);
        const r = run.result;
        console.log(
          `  ✓ ${r.throughputReqPerSec.toFixed(0)} req/s · ` +
            `p50=${r.latency.p50}ms p95=${r.latency.p95}ms p99=${r.latency.p99}ms · ` +
            `errors=${r.errors} non2xx=${r.non2xx}`,
        );
        runs.push(run);
      } catch (err) {
        console.error(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (runs.length === 0) {
    console.log("\n⊘ Nothing ran. Set LOAD_TEST_SESSION_COOKIE or remove auth scenarios.");
    return;
  }

  console.log("\n\n=== RESULTS ===\n");
  console.log(renderTable(runs));

  // Save JSON snapshot for future regression comparison
  const dir = join(process.cwd(), "docs", "load-tests");
  mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = join(dir, `load-test-${timestamp}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        baseUrl: args.baseUrl,
        timestamp: new Date().toISOString(),
        quickMode: args.quick,
        runs,
      },
      null,
      2,
    ),
  );
  console.log(`\n📝 Saved to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
