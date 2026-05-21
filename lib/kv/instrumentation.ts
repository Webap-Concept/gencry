// lib/kv/instrumentation.ts
//
// Logger TEMPORANEO per stimare il consumo di Upstash commands.
// Attivabile via env `UPSTASH_DEBUG=1` (in `.env.local` per dev locale).
//
// Cosa fa:
//   - Conta ogni comando passato attraverso `redisCmd`/`redisPipeline`
//     (lib/kv/raw.ts) e attraverso il client SDK (lib/kv/sdk.ts).
//   - Per ogni call stampa: command name, key (se identificabile), latenza,
//     top-frame del caller (chi ha chiamato).
//   - Globale process-wide. NON usa AsyncLocalStorage perché in edge
//     runtime di Next la propagation è inconsistente; preferiamo log
//     inline + analisi manuale.
//
// Quando rimuovere:
//   - Una volta capito il pattern di consumo (vedi
//     project_upstash_kv_roadmap), questo file + i 3 call site di
//     `logRedisCall` sono il cleanup da fare.
//
// Note operative:
//   - I numeri pipelinati vengono contati come N commands (uno per ogni
//     sub-command). Allinea con il counting fatto da Upstash.
//   - `process.env.UPSTASH_DEBUG === "1"` è valutato a ogni call (no
//     cache): puoi attivarlo/disattivarlo senza restart in dev se
//     ricarichi il modulo, in produzione richiede redeploy.
import "server-only";

const DEBUG_ENABLED = () => process.env.UPSTASH_DEBUG === "1";

// Counter aggregato process-wide. Utile per "quanti comandi ho fatto
// dall'avvio del lambda". Su Vercel un lambda warm può fare diverse
// request prima di freddare: il counter riflette quello.
let totalCommands = 0;

/** Best-effort: estrae il primo frame "interno" (non in lib/kv/) dallo
 *  stack. Aiuta a capire chi è il chiamante reale. */
function getCallerHint(): string {
  const err = new Error();
  const stack = err.stack ?? "";
  const lines = stack.split("\n").slice(2); // skip Error + this fn
  for (const line of lines) {
    // Skip frames del logger stesso e dei wrapper kv/raw, kv/sdk.
    if (line.includes("instrumentation.ts")) continue;
    if (line.includes("kv\\raw.ts") || line.includes("kv/raw.ts")) continue;
    if (line.includes("kv\\sdk.ts") || line.includes("kv/sdk.ts")) continue;
    // Estrai il path file:line dal frame.
    const match = line.match(/\(?([^()\s]+:\d+:\d+)\)?/);
    if (match) return match[1];
  }
  return "unknown";
}

/** Estrae nome comando + prima key (utile per identificare hot key). */
function describeCommand(args: ReadonlyArray<string | number>): string {
  if (args.length === 0) return "<empty>";
  const cmd = String(args[0]).toUpperCase();
  const key = args[1] !== undefined ? String(args[1]) : "";
  return key ? `${cmd} ${key}` : cmd;
}

/**
 * Log singolo redisCmd. Counter +1.
 */
export function logRedisCmd(
  args: ReadonlyArray<string | number>,
  latencyMs: number,
): void {
  totalCommands += 1;
  if (!DEBUG_ENABLED()) return;
  console.log(
    `[redis-debug] #${totalCommands} ${describeCommand(args)} (${latencyMs}ms) from ${getCallerHint()}`,
  );
}

/**
 * Log redisPipeline. Counter += N (i pipeline contano come N comandi
 * separati sul billing Upstash).
 */
export function logRedisPipeline(
  commands: ReadonlyArray<ReadonlyArray<string | number>>,
  latencyMs: number,
): void {
  totalCommands += commands.length;
  if (!DEBUG_ENABLED()) return;
  const summary = commands.map((c) => describeCommand(c)).join(" | ");
  console.log(
    `[redis-debug] #${totalCommands} PIPELINE[${commands.length}] ${summary} (${latencyMs}ms) from ${getCallerHint()}`,
  );
}

/**
 * Log generico per il client SDK (vedi wrapping in lib/kv/sdk.ts).
 * Counter +1.
 */
export function logRedisSdkCall(
  method: string,
  firstArg: unknown,
  latencyMs: number,
): void {
  totalCommands += 1;
  if (!DEBUG_ENABLED()) return;
  const key = typeof firstArg === "string" ? firstArg : "";
  console.log(
    `[redis-debug] #${totalCommands} SDK ${method.toUpperCase()}${key ? ` ${key}` : ""} (${latencyMs}ms) from ${getCallerHint()}`,
  );
}

/** Snapshot corrente del counter (per debug / health). */
export function getRedisCommandTotal(): number {
  return totalCommands;
}

/** Reset counter (per test / dev). */
export function resetRedisCommandTotal(): void {
  totalCommands = 0;
}
