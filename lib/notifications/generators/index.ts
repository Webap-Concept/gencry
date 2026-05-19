// Registry dei generatori. Aggiungere qui i nuovi tipi di notifica.
import type { NotificationGenerator } from "../types";
import { accountDeletionsGenerator } from "./account-deletions";
import {
  coreCronFailuresGenerator,
  moduleCronFailuresGenerators,
} from "./cron-failures";
import { postsReportsPendingGenerator } from "./posts-reports";
import { rotationGenerator } from "./rotation";
import { suspiciousSessionsGenerator } from "./suspicious-sessions";

export const GENERATORS: NotificationGenerator[] = [
  rotationGenerator,
  accountDeletionsGenerator,
  coreCronFailuresGenerator,
  suspiciousSessionsGenerator,
  postsReportsPendingGenerator,
  ...moduleCronFailuresGenerators(),
];
