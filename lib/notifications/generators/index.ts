// Registry dei generatori. Aggiungere qui i nuovi tipi di notifica.
import type { NotificationGenerator } from "../types";
import { accountDeletionsGenerator } from "./account-deletions";
import {
  coreCronFailuresGenerator,
  moduleCronFailuresGenerators,
} from "./cron-failures";
import { rotationGenerator } from "./rotation";

export const GENERATORS: NotificationGenerator[] = [
  rotationGenerator,
  accountDeletionsGenerator,
  coreCronFailuresGenerator,
  ...moduleCronFailuresGenerators(),
];
