"use client";

import dynamic from "next/dynamic";

// `ssr: false` esclude TipTap (StarterKit + extensions, ~150KB minified)
// dal bundle iniziale della rotta. L'editor monta solo dopo l'idratazione
// del client, sostituendo il loader. Le rotte /admin/content/pages/new e
// /admin/content/pages/[id]/edit sono Server Components, quindi importano
// questo wrapper invece del componente diretto (dynamic({ ssr: false })
// non è permesso negli RSC).
const PageEditor = dynamic(() => import("./page-editor"), {
  ssr: false,
  loading: () => (
    <div
      className="rounded-xl shadow-sm p-8 flex items-center justify-center"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-card-border)",
        minHeight: "60vh",
        color: "var(--admin-text-muted)",
      }}>
      Loading editor…
    </div>
  ),
});

export default PageEditor;
