// Registry dei generatori. Aggiungere qui i nuovi tipi di notifica.
import type { NotificationGenerator } from "../types";
import { rotationGenerator } from "./rotation";

export const GENERATORS: NotificationGenerator[] = [rotationGenerator];
