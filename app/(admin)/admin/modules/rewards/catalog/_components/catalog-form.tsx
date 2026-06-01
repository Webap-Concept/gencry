"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminButton } from "@/app/(admin)/admin/_components/admin-button";
import { uploadToR2WithProgress } from "@/lib/client/media-r2-upload";
import type { CatalogItemWithMeta } from "@/lib/modules/rewards/catalog-queries";
import { createCatalogItem, updateCatalogItem, type CatalogItemInput } from "../actions";

const LOCKED_TOOLTIP = "Non modificabile: esistono già acquisti per questo item.";
const BG_PRESETS = ["#f97316", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#6366f1", "#ec4899"];

interface CatalogFormProps {
  item?: CatalogItemWithMeta;
  backPath: string;
}

export function CatalogForm({ item, backPath }: CatalogFormProps) {
  const isEdit    = !!item;
  const isLocked  = item?.isLocked ?? false;
  const router    = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError]    = useState<string | null>(null);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(item?.iconUrl ?? null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const [form, setForm] = useState<CatalogItemInput>({
    slug:        item?.slug        ?? "",
    label:       item?.label       ?? "",
    description: item?.description ?? "",
    type:        item?.type        ?? "badge",
    iconUrl:     item?.iconUrl     ?? "",
    iconBg:      item?.iconBg      ?? "#f97316",
    costGcc:     parseFloat(item?.costGcc as unknown as string ?? "0"),
    isActive:    item?.isActive    ?? true,
    isUnique:    item?.isUnique    ?? true,
    perkData:    item?.perkData ? JSON.stringify(item.perkData, null, 2) : "",
  });

  function field(key: keyof CatalogItemInput) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm((f) => ({ ...f, [key]: value }));
    };
  }

  async function handleIconSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  }

  async function uploadIcon(itemId: string): Promise<string | null> {
    if (!iconFile) return form.iconUrl || null;
    setUploadProgress(0);
    try {
      const res = await fetch("/api/admin/rewards/badge-icon", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ itemId, mimeType: iconFile.type }),
      });
      const ticket = await res.json();
      if (!res.ok || ticket.error) throw new Error(ticket.error ?? "Errore ticket upload");
      await uploadToR2WithProgress(iconFile, ticket, { onProgress: setUploadProgress });
      setUploadProgress(100);
      return ticket.publicUrl as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload icona fallito");
      return null;
    }
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      if (isEdit && item) {
        // Upload icona se presente prima di salvare
        const finalIconUrl = await uploadIcon(item.id);
        if (iconFile && !finalIconUrl) return; // upload failed
        const result = await updateCatalogItem(item.id, {
          ...form,
          iconUrl: finalIconUrl ?? form.iconUrl,
          isLocked,
        });
        if (result.ok) router.push(backPath);
        else setError(result.error);
      } else {
        // Create: prima crea, poi upload icona con l'id generato
        const tempResult = await createCatalogItem({ ...form, iconUrl: "" });
        if (!tempResult.ok) { setError(tempResult.error); return; }
        const iconUrl = await uploadIcon(tempResult.id);
        if (iconFile && iconUrl) {
          await updateCatalogItem(tempResult.id, { ...form, iconUrl, isLocked: false });
        }
        router.push(backPath);
      }
    });
  }

  const inputCls = "w-full rounded-md border px-2.5 py-1.5 text-sm";
  const inputStyle = { background: "var(--admin-input-bg)", borderColor: "var(--admin-card-border)", color: "var(--admin-text)" };
  const labelCls = "block text-xs font-medium mb-1";
  const labelStyle = { color: "var(--admin-text-muted)" };

  return (
    <div className="space-y-5 max-w-lg">
      {/* Slug */}
      <div>
        <label className={labelCls} style={labelStyle}>
          Slug {isLocked && <span title={LOCKED_TOOLTIP} className="ml-1 text-[10px] opacity-60">(bloccato)</span>}
        </label>
        <input className={inputCls} style={inputStyle} value={form.slug} onChange={field("slug")} disabled={isLocked} placeholder="badge_supporter" />
        {!isLocked && <p className="mt-0.5 text-[11px]" style={{ color: "var(--admin-text-faint)" }}>Solo minuscolo, numeri, underscore. Non modificabile dopo il primo acquisto.</p>}
      </div>

      {/* Label */}
      <div>
        <label className={labelCls} style={labelStyle}>Label</label>
        <input className={inputCls} style={inputStyle} value={form.label} onChange={field("label")} placeholder="Supporter" />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls} style={labelStyle}>Descrizione</label>
        <textarea className={inputCls} style={{ ...inputStyle, minHeight: 72 }} value={form.description} onChange={field("description")} placeholder="Descrizione visibile all'utente nel negozio." />
      </div>

      {/* Type */}
      <div>
        <label className={labelCls} style={labelStyle}>
          Tipo {isLocked && <span title={LOCKED_TOOLTIP} className="ml-1 text-[10px] opacity-60">(bloccato)</span>}
        </label>
        <select className={inputCls} style={inputStyle} value={form.type} onChange={field("type")} disabled={isLocked}>
          <option value="badge">Badge</option>
          <option value="perk">Perk</option>
        </select>
      </div>

      {/* Icona */}
      <div>
        <label className={labelCls} style={labelStyle}>Icona badge</label>
        <div className="flex items-center gap-3">
          {iconPreview ? (
            // Anteprima = badge finale: tondo, icona centrata ~60% così su
            // icona trasparente il colore iconBg riempie il badge.
            <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden ring-2 ring-black/10 shadow-sm" style={{ background: form.iconBg || "#f97316" }}>
              <img src={iconPreview} alt="preview" className="w-3/5 h-3/5 object-contain" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg ring-2 ring-black/10" style={{ background: form.iconBg || "#f97316" }}>?</div>
          )}
          <div className="flex-1">
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleIconSelect} className="text-xs" />
            {uploadProgress !== null && uploadProgress < 100 && (
              <div className="mt-1 h-1.5 rounded-full bg-gc-bg-3 overflow-hidden">
                <div className="h-full bg-orange-400 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Colore sfondo icona */}
      <div>
        <label className={labelCls} style={labelStyle}>Colore sfondo icona</label>
        <div className="flex items-center gap-2 flex-wrap">
          {BG_PRESETS.map((c) => (
            <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, iconBg: c }))}
              className={`w-7 h-7 rounded-lg border-2 ${form.iconBg === c ? "border-white" : "border-transparent"}`}
              style={{ background: c }}
            />
          ))}
          <input type="text" className="w-24 rounded-md border px-2 py-1 text-xs font-mono" style={inputStyle} value={form.iconBg ?? ""} onChange={field("iconBg")} placeholder="#f97316" />
        </div>
      </div>

      {/* Cost */}
      <div>
        <label className={labelCls} style={labelStyle}>Costo (GCC)</label>
        <input type="number" min={0} step={0.01} className={inputCls} style={inputStyle} value={form.costGcc as number} onChange={field("costGcc")} />
      </div>

      {/* is_unique */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isUnique" checked={form.isUnique} onChange={field("isUnique")} disabled={isLocked} className="h-4 w-4" />
        <label htmlFor="isUnique" className="text-sm" style={{ color: "var(--admin-text)" }}>
          Acquistabile 1 sola volta per utente
          {isLocked && <span title={LOCKED_TOOLTIP} className="ml-1 text-xs opacity-60">(bloccato)</span>}
        </label>
      </div>

      {/* perk_data — solo per perk */}
      {form.type === "perk" && (
        <div>
          <label className={labelCls} style={labelStyle}>
            Perk data (JSON) {isLocked && <span title={LOCKED_TOOLTIP} className="ml-1 text-[10px] opacity-60">(bloccato)</span>}
          </label>
          <textarea className={`${inputCls} font-mono`} style={{ ...inputStyle, minHeight: 80 }}
            value={form.perkData} onChange={field("perkData")} disabled={isLocked}
            placeholder='{"slots_granted": 1}' />
        </div>
      )}

      {/* is_active */}
      <div className="flex items-center gap-2">
        <input type="checkbox" id="isActive" checked={form.isActive} onChange={field("isActive")} className="h-4 w-4" />
        <label htmlFor="isActive" className="text-sm" style={{ color: "var(--admin-text)" }}>Attivo (visibile nel negozio)</label>
      </div>

      {error && <p className="text-sm" style={{ color: "var(--admin-danger)" }}>{error}</p>}

      <div className="flex gap-3">
        <AdminButton variant="primary" loading={pending} onClick={handleSubmit}>
          {isEdit ? "Salva modifiche" : "Crea item"}
        </AdminButton>
        <AdminButton variant="secondary" onClick={() => router.push(backPath)} disabled={pending}>
          Annulla
        </AdminButton>
      </div>
    </div>
  );
}
