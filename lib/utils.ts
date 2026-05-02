import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fullName(user: {
  firstName?: string | null;
  lastName?: string | null;
}): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}
