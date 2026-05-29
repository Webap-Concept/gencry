"use client";
// Client component delle tabs del modulo social-graph. Riceve le tabs
// gia' filtrate per RBAC dal server (vedi social-graph-header.tsx).
import {
  AdminStickyHeader,
} from "@/app/(admin)/admin/_components/admin-sticky-header";
import type { AdminSectionTab } from "@/app/(admin)/admin/_components/admin-section-tabs";

export function SocialGraphHeaderClient({
  tabs,
}: {
  tabs: AdminSectionTab[];
}) {
  return <AdminStickyHeader tabs={tabs} />;
}
