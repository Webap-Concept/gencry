// scripts/qstash-sync-schedules.ts
//
// Crea/aggiorna su Upstash QStash gli schedule cron definiti in
// `lib/cron/cron-schedules.ts`. Sostituisce i pg_cron + net.http_get:
// QStash chiama gli endpoint `/api/cron/*` su schedule, con retry + log.
//
// Idempotente: ogni schedule usa `Upstash-Schedule-Id: gencry-<jobname>`,
// quindi ri-eseguire lo script AGGIORNA invece di duplicare.
//
// Uso:
//   pnpm cron:sync                 # crea/aggiorna tutti gli schedule
//   pnpm cron:sync -- --dry-run    # mostra cosa farebbe, niente POST
//   pnpm cron:sync -- --list       # elenca gli schedule attualmente su QStash
//
// Credenziali:
//   - qstash_url, qstash_token  → letti da app_settings (impostati in
//     /admin/services/qstash). QStash è regionale: l'URL è quello salvato.
//   - CRON_SECRET               → env (lo stesso che gli endpoint validano
//     via isAuthorizedCron). Inoltrato al target come Authorization Bearer.
//   - CRON_TARGET_BASE_URL      → env, origin pubblico dell'app di
//     produzione (es. https://app.example.com). QStash chiama
//     `${CRON_TARGET_BASE_URL}${path}`.

import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { appSettings } from "@/lib/db/schema";
import { CRON_SCHEDULES, type CronScheduleDef } from "@/lib/cron/cron-schedules";

interface Args {
  dryRun: boolean;
  list: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    console.log(
      "Usage: tsx scripts/qstash-sync-schedules.ts [--dry-run] [--list]\n\n" +
        "Env: CRON_SECRET, CRON_TARGET_BASE_URL\n" +
        "app_settings: qstash_url, qstash_token",
    );
    process.exit(0);
  }
  return {
    dryRun: argv.includes("--dry-run"),
    list: argv.includes("--list"),
  };
}

function stripSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function readQstashCreds(): Promise<{ url: string; token: string }> {
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ["qstash_url", "qstash_token"]));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const url = (map.get("qstash_url") ?? "").trim();
  const token = (map.get("qstash_token") ?? "").trim();
  if (!url || !token) {
    throw new Error(
      "qstash_url / qstash_token mancanti in app_settings — configura /admin/services/qstash prima.",
    );
  }
  return { url: stripSlash(url), token };
}

function readEnv(): { cronSecret: string; targetBase: string } {
  const cronSecret = (process.env.CRON_SECRET ?? "").trim();
  const targetBase = (process.env.CRON_TARGET_BASE_URL ?? "").trim();
  if (!cronSecret) throw new Error("CRON_SECRET non impostato in env.");
  if (!targetBase) {
    throw new Error(
      "CRON_TARGET_BASE_URL non impostato (origin pubblico dell'app, es. https://app.example.com).",
    );
  }
  return { cronSecret, targetBase: stripSlash(targetBase) };
}

async function upsertSchedule(
  job: CronScheduleDef,
  cfg: { qstashUrl: string; qstashToken: string; cronSecret: string; targetBase: string },
): Promise<{ ok: boolean; status: number; body: string }> {
  const target = `${cfg.targetBase}${job.path}`;
  const res = await fetch(
    `${cfg.qstashUrl}/v2/schedules/${encodeURIComponent(target)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.qstashToken}`,
        "Upstash-Cron": job.schedule,
        // ID stabile → upsert idempotente (ricreare con lo stesso ID aggiorna).
        "Upstash-Schedule-Id": `gencry-${job.jobname}`,
        // Gli endpoint cron sono GET; default QStash sarebbe POST.
        "Upstash-Method": "GET",
        // Inoltrato al target come `Authorization: Bearer <CRON_SECRET>`,
        // che isAuthorizedCron già verifica → endpoint invariati.
        "Upstash-Forward-Authorization": `Bearer ${cfg.cronSecret}`,
      },
    },
  );
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function listSchedules(qstashUrl: string, token: string): Promise<void> {
  const res = await fetch(`${qstashUrl}/v2/schedules`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`✗ List failed: HTTP ${res.status} ${await res.text()}`);
    return;
  }
  const schedules = (await res.json()) as Array<{
    scheduleId: string;
    cron: string;
    destination: string;
  }>;
  console.log(`\n${schedules.length} schedule su QStash:\n`);
  for (const s of schedules) {
    console.log(`  ${s.scheduleId}  ${s.cron}  → ${s.destination}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const creds = await readQstashCreds();

  if (args.list) {
    await listSchedules(creds.url, creds.token);
    return;
  }

  const env = readEnv();
  const cfg = {
    qstashUrl: creds.url,
    qstashToken: creds.token,
    cronSecret: env.cronSecret,
    targetBase: env.targetBase,
  };

  console.log(
    `\n${args.dryRun ? "DRY-RUN — " : ""}Sync ${CRON_SCHEDULES.length} schedule → ${cfg.qstashUrl}`,
  );
  console.log(`Target base: ${cfg.targetBase}\n`);

  let ok = 0;
  let failed = 0;
  for (const job of CRON_SCHEDULES) {
    const target = `${cfg.targetBase}${job.path}`;
    if (args.dryRun) {
      console.log(`  · ${job.jobname.padEnd(34)} ${job.schedule.padEnd(14)} → ${target}`);
      continue;
    }
    try {
      const r = await upsertSchedule(job, cfg);
      if (r.ok) {
        ok++;
        console.log(`  ✓ ${job.jobname.padEnd(34)} ${job.schedule.padEnd(14)} (${r.status})`);
      } else {
        failed++;
        console.error(
          `  ✗ ${job.jobname.padEnd(34)} HTTP ${r.status}: ${r.body.slice(0, 200)}`,
        );
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ ${job.jobname}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!args.dryRun) {
    console.log(`\nDone — ${ok} ok, ${failed} failed.`);
    if (failed > 0) process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
