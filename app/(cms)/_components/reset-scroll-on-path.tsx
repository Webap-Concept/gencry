"use client";

// app/(cms)/_components/reset-scroll-on-path.tsx
//
// Force `window.scrollTo(0, 0)` ogni volta che il pathname cambia. Next
// App Router lo fa già di default per i navigation con `<Link>`, ma su
// pagine wrappate da scroll container o con transizioni a lungo termine
// la posizione precedente può "persistere" tra link e l'utente atterra
// sull'articolo a metà pagina. Aggiungerlo nel layout (cms)/ risolve
// tutte le navigation interne del frontend pubblico senza toccare i
// singoli `<Link>`.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function ResetScrollOnPath() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined") return;
    // `instant` per evitare il flash di scroll animato dopo il click;
    // l'utente si aspetta atterraggio "snappy" in cima alla nuova page.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}
