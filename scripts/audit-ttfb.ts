// scripts/audit-ttfb.ts
//
// Misura TTFB (time to first byte) e durata totale di una lista di
// endpoint reali. Scopo: smettere di indovinare dove l'app è lenta e
// avere numeri concreti.
//
// Uso:
//   tsx scripts/audit-ttfb.ts                         # locale (npm run start)
//   tsx scripts/audit-ttfb.ts --url=https://...       # produzione
//   tsx scripts/audit-ttfb.ts --runs=10               # più ripetizioni
//   tsx scripts/audit-ttfb.ts --warm                  # 2 hit di warm-up esclusi
//
// Note:
// - Misura solo richieste GET non autenticate. Le route admin
//   risponderanno con 307/308 (redirect a sign-in) — il TTFB del
//   redirect è comunque informativo perché include layout + middleware.
// - Esegui sempre contro `npm run start` (build di produzione), MAI
//   contro `npm run dev`: dev mode usa Turbopack che è 5-10x più lento
//   e i numeri non rappresentano la realtà.
// - Per la produzione vera, lancia con `--url=https://app-staging.tld`
//   in modo da includere la latenza Vercel + Supabase reale.

interface Args {
  baseUrl: string;
  runs: number;
  warmup: boolean;
}

const ENDPOINTS: Array<{ path: string; label: string }> = [
  { path: "/", label: "homepage public" },
  { path: "/sign-in", label: "sign-in (public)" },
  { path: "/sign-up", label: "sign-up (public)" },
  { path: "/admin", label: "admin (redirect → sign-in)" },
  { path: "/admin/sign-in", label: "admin/sign-in (public)" },
  { path: "/settings", label: "settings (redirect → sign-in)" },
  { path: "/api/settings", label: "api/settings (json)" },
  { path: "/humans.txt", label: "static" },
];

function parseArgs(): Args {
  const args: Args = {
    baseUrl: "http://localhost:3000",
    runs: 5,
    warmup: false,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--url=")) args.baseUrl = arg.slice(6).replace(/\/$/, "");
    else if (arg.startsWith("--runs=")) args.runs = Number(arg.slice(7)) || 5;
    else if (arg === "--warm") args.warmup = true;
    else if (arg === "-h" || arg === "--help") {
      console.log(
        "Usage: tsx scripts/audit-ttfb.ts [--url=https://...] [--runs=N] [--warm]",
      );
      process.exit(0);
    }
  }
  return args;
}

interface Sample {
  ttfb: number;
  total: number;
  status: number;
  bodyBytes: number;
}

async function measure(url: string): Promise<Sample> {
  const t0 = performance.now();
  const res = await fetch(url, {
    redirect: "manual",
    headers: {
      // Disabilita compressioni / caches CDN per misure stabili.
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
  });
  const tFirstByte = performance.now();
  // Drena il body per misurare il total. Anche su redirect manuale
  // il body è quasi vuoto, ma manteniamo lo stesso protocollo.
  const buf = await res.arrayBuffer();
  const tEnd = performance.now();
  return {
    ttfb: tFirstByte - t0,
    total: tEnd - t0,
    status: res.status,
    bodyBytes: buf.byteLength,
  };
}

interface Stats {
  min: number;
  median: number;
  p95: number;
  max: number;
  mean: number;
}

function statsOf(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const len = sorted.length;
  const pick = (q: number) => sorted[Math.min(len - 1, Math.floor(q * len))];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0],
    median: pick(0.5),
    p95: pick(0.95),
    max: sorted[len - 1],
    mean: sum / len,
  };
}

function fmt(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms.toFixed(0)}ms`;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

async function main() {
  const args = parseArgs();
  console.log("");
  console.log(`╭─ TTFB audit ─────────────────────────────────────────────`);
  console.log(`│ Base URL : ${args.baseUrl}`);
  console.log(`│ Runs     : ${args.runs}${args.warmup ? " (+ 2 warmup discarded)" : ""}`);
  console.log(`╰─────────────────────────────────────────────────────────`);
  console.log("");

  const header =
    pad("ENDPOINT", 38) +
    pad("STATUS", 9) +
    pad("TTFB min", 12) +
    pad("TTFB p50", 12) +
    pad("TTFB p95", 12) +
    pad("TOTAL p50", 12);
  console.log(header);
  console.log("─".repeat(header.length));

  for (const ep of ENDPOINTS) {
    const url = args.baseUrl + ep.path;
    const ttfbs: number[] = [];
    const totals: number[] = [];
    let lastStatus = 0;

    if (args.warmup) {
      try {
        await measure(url);
        await measure(url);
      } catch {
        /* warm-up failure: continue, the real loop will report it */
      }
    }

    for (let i = 0; i < args.runs; i++) {
      try {
        const sample = await measure(url);
        ttfbs.push(sample.ttfb);
        totals.push(sample.total);
        lastStatus = sample.status;
      } catch (err) {
        console.log(
          pad(ep.path, 38) +
            pad("ERROR", 9) +
            (err instanceof Error ? err.message : String(err)),
        );
        ttfbs.length = 0;
        break;
      }
    }

    if (ttfbs.length === 0) continue;

    const tt = statsOf(ttfbs);
    const tot = statsOf(totals);

    console.log(
      pad(ep.path, 38) +
        pad(String(lastStatus), 9) +
        pad(fmt(tt.min), 12) +
        pad(fmt(tt.median), 12) +
        pad(fmt(tt.p95), 12) +
        pad(fmt(tot.median), 12),
    );
  }

  console.log("");
  console.log(
    "TIP: confronta valori prima/dopo una modifica di perf. p95 è il segnale che vede l'utente sfortunato.",
  );
  console.log(
    "TIP: in locale lancia `npm run build && npm run start` prima — `npm run dev` non è rappresentativo.",
  );
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
