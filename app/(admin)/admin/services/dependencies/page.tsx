import { getDependencyReport } from "@/lib/admin/dependencies/registry";
import type { Metadata } from "next";
import { connection } from "next/server";
import { DependenciesView } from "./_components/dependencies-view";

export async function generateMetadata(): Promise<Metadata> {
  // Opt-in dynamic — la pagina chiama npm registry e GitHub API; non
  // ha senso prerendere staticamente. Vedi pattern in /sign-in/page.tsx.
  await connection();
  return { title: "Services / Dependencies" };
}

export default async function DependenciesPage() {
  const report = await getDependencyReport();
  return <DependenciesView report={report} />;
}
