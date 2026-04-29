"use client";
import { getAdminPath } from "@/lib/admin-nav";
import type { TemplateField } from "@/lib/db/schema";
import { slugify, slugToPascalCase } from "@/lib/utils/slugify";
import {
  Check,
  Code2,
  Copy,
  FileCode2,
  GripVertical,
  Info,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { useEffect, useRef, useState } from "react";
import { EditorPageHeader } from "../../../_components/editor-page-header";

const FORM_ID = "template-editor-form";

const FIELD_TYPES = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "richtext", label: "Rich text" },
  { value: "image", label: "Image (URL)" },
  { value: "url", label: "URL" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "toggle", label: "Toggle" },
  { value: "number", label: "Number" },
];

interface FieldDraft {
  _id: string;
  fieldKey: string;
  fieldType: string;
  label: string;
  placeholder: string;
  required: boolean;
  defaultValue: string;
  options: string;
}

interface TemplateOption {
  id: number;
  name: string;
  slug: string;
}

interface TemplateFormClientProps {
  template?: {
    id: number;
    name: string;
    slug: string;
    description: string;
    rules: Record<string, unknown>;
    fields: TemplateField[];
    isSystem: boolean;
  };
  allTemplates?: TemplateOption[];
  /** Slug per cui esiste un componente Template{Slug}.tsx (incluso "default"). */
  registeredSlugs?: string[];
  saveAction: (formData: FormData) => Promise<void>;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "0.625rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  cursor: "pointer",
  background: "none",
  border: "none",
  borderBottom: active
    ? "2px solid var(--admin-accent)"
    : "2px solid transparent",
  color: active ? "var(--admin-accent)" : "var(--admin-text-muted)",
  transition: "color 150ms, border-color 150ms",
});

// ─── Implementation guide component ─────────────────────────────────────────
function ImplementationGuide({
  slug,
  fields,
}: {
  slug: string;
  fields: FieldDraft[];
}) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);

  const componentName = slug
    ? "Template" + slugToPascalCase(slug)
    : "TemplateName";

  const slugLabel = slug || "template-name";
  const filePath = `app/(frontend)/_templates/${componentName}.tsx`;

  const fieldsTypeLines =
    fields.length > 0
      ? fields
          .map((f) => {
            const tsType = ["number"].includes(f.fieldType)
              ? "number"
              : ["toggle"].includes(f.fieldType)
                ? "boolean"
                : "string";
            const optional = !f.required ? "?" : "";
            return `  ${f.fieldKey}${optional}: ${tsType}; // ${FIELD_TYPES.find((t) => t.value === f.fieldType)?.label ?? f.fieldType}`;
          })
          .join("\n")
      : "  // no custom fields defined";

  const fieldsUsageLines =
    fields.length > 0
      ? fields
          .map((f) => {
            if (f.fieldType === "image") {
              return `        {fields.${f.fieldKey} && (\n          <img src={fields.${f.fieldKey}} alt="${f.label}" />\n        )}`;
            } else if (f.fieldType === "toggle") {
              return `        {fields.${f.fieldKey} && <span>${f.label}</span>}`;
            } else if (f.fieldType === "richtext") {
              return `        {fields.${f.fieldKey} && (\n          <div dangerouslySetInnerHTML={{ __html: fields.${f.fieldKey} }} />\n        )}`;
            } else {
              return `        {fields.${f.fieldKey} && <p>{fields.${f.fieldKey}}</p>}`;
            }
          })
          .join("\n")
      : "        {/* no custom fields — use only page.title and page.content */}";

  const componentCode = `import type { TemplateProps } from "./types";

// Custom fields defined in this template
interface Fields {
${fieldsTypeLines}
}

export default function ${componentName}({ page, fields: rawFields }: TemplateProps) {
  const fields = (rawFields ?? {}) as Fields;

  return (
    <main>
      <article>
        <h1>{page.title}</h1>
          ${fieldsUsageLines}
        {page.content && (
          <div dangerouslySetInnerHTML={{ __html: page.content }} />
        )}
      </article>
    </main>
  );
}`;

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedBlock(key);
      setTimeout(() => setCopiedBlock(null), 2000);
    });
  }

  const codeBlockStyle: React.CSSProperties = {
    background: "var(--admin-page-bg)",
    border: "1px solid var(--admin-border)",
    borderRadius: "0.5rem",
    fontSize: "0.75rem",
    lineHeight: 1.7,
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    overflowX: "auto",
    whiteSpace: "pre",
    padding: "1rem",
    color: "var(--admin-text-muted)",
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--admin-text)",
    marginBottom: "0.5rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  };

  const stepBadge: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    borderRadius: "9999px",
    background: "var(--admin-accent)",
    color: "#fff",
    fontSize: "0.65rem",
    fontWeight: 700,
    flexShrink: 0,
  };

  const pathPill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.3rem 0.75rem",
    borderRadius: "0.375rem",
    background:
      "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-card-bg))",
    border:
      "1px solid color-mix(in srgb, var(--admin-accent) 22%, transparent)",
    color: "var(--admin-accent)",
    fontFamily: "monospace",
    fontSize: "0.78rem",
    fontWeight: 500,
    marginBottom: "0.75rem",
    userSelect: "all" as const,
  };

  const noticeStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: "0.5rem",
    padding: "0.75rem 1rem",
    borderRadius: "0.5rem",
    background:
      "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
    border:
      "1px solid color-mix(in srgb, var(--admin-accent) 18%, transparent)",
    marginBottom: "1.5rem",
    fontSize: "0.8rem",
    lineHeight: 1.6,
    color: "var(--admin-text-muted)",
  };

  return (
    <section
      className="rounded-xl p-5 mb-6"
      style={{
        background: "var(--admin-card-bg)",
        border: "1px solid var(--admin-border)",
      }}>
      <h2
        className="text-sm font-semibold mb-1"
        style={{ color: "var(--admin-text)" }}>
        Implementation Guide
      </h2>
      <p className="text-xs mb-5" style={{ color: "var(--admin-text-muted)" }}>
        Follow these steps to connect this template to the React code of the
        app. The code updates in real time based on the custom fields configured
        in the General tab.
      </p>

      {!slug && (
        <div style={noticeStyle}>
          <Info
            size={14}
            style={{
              color: "var(--admin-accent)",
              marginTop: "1px",
              flexShrink: 0,
            }}
          />
          <span>
            Enter a <strong style={{ color: "var(--admin-text)" }}>Name</strong>{" "}
            in the General tab to automatically generate the slug and view the
            component path.
          </span>
        </div>
      )}

      {/* Single step — Create the component */}
      <div className="mb-6">
        <p style={sectionTitle}>
          <span style={stepBadge}>1</span>
          Create the component file
        </p>
        <div style={pathPill}>
          <FileCode2 size={13} />
          {filePath}
        </div>
        <div style={{ position: "relative" }}>
          <div style={codeBlockStyle}>{componentCode}</div>
          <button
            type="button"
            title="Copy code"
            onClick={() => copyToClipboard(componentCode, "component")}
            style={{
              position: "absolute",
              top: "0.5rem",
              right: "0.5rem",
              padding: "0.3rem",
              borderRadius: "0.375rem",
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-border)",
              color:
                copiedBlock === "component"
                  ? "#22c55e"
                  : "var(--admin-text-faint)",
              cursor: "pointer",
              transition: "color 150ms",
            }}>
            {copiedBlock === "component" ? (
              <Check size={13} />
            ) : (
              <Copy size={13} />
            )}
          </button>
        </div>
      </div>

      {/* Note: no registry to update */}
      <div
        className="rounded-lg px-4 py-3 flex items-start gap-2 mb-4"
        style={{
          background: "color-mix(in srgb, #22c55e 6%, var(--admin-card-bg))",
          border: "1px solid color-mix(in srgb, #22c55e 22%, transparent)",
        }}>
        <Check
          size={14}
          className="mt-0.5 shrink-0"
          style={{ color: "#22c55e" }}
        />
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--admin-text-muted)" }}>
          <strong style={{ color: "var(--admin-text)" }}>
            No registry to update.
          </strong>{" "}
          The system automatically loads{" "}
          <code style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            {componentName}.tsx
          </code>{" "}
          based on the slug{" "}
          <code style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>
            &#34;{slugLabel}&#34;
          </code>
          . Just create the file with the correct name.
        </p>
      </div>

      {/* Fields note */}
      {fields.length > 0 && (
        <div
          className="rounded-lg px-4 py-3"
          style={{
            background:
              "color-mix(in srgb, var(--admin-accent) 5%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, var(--admin-accent) 18%, transparent)",
          }}>
          <p
            className="text-xs font-semibold mb-2"
            style={{ color: "var(--admin-text)" }}>
            Custom fields in this template
          </p>
          <div className="space-y-1">
            {fields.map((f) => (
              <div key={f._id} className="flex items-center gap-2">
                <code
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--admin-input-bg)",
                    border: "1px solid var(--admin-border)",
                    color: "var(--admin-accent)",
                    fontFamily: "monospace",
                  }}>
                  fields.{f.fieldKey || ""}
                </code>
                <span
                  className="text-xs"
                  style={{ color: "var(--admin-text-muted)" }}>
                  {f.label || "—"}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "var(--admin-input-bg)",
                    color: "var(--admin-text-faint)",
                    border: "1px solid var(--admin-border)",
                  }}>
                  {FIELD_TYPES.find((t) => t.value === f.fieldType)?.label ??
                    f.fieldType}
                </span>
                {f.required && (
                  <span
                    className="text-xs px-1 py-0.5 rounded"
                    style={{ color: "#f59e0b", fontSize: "0.65rem" }}>
                    required
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── TemplateFormClient ───────────────────────────────────────────────────────
export default function TemplateFormClient({
  template,
  allTemplates = [],
  registeredSlugs = [],
  saveAction,
}: TemplateFormClientProps) {
  const isEdit = !!template;
  const registeredSlugSet = new Set(registeredSlugs);
  const [activeTab, setActiveTab] = useState<
    "general" | "rules" | "implementation"
  >("general");
  const [name, setName] = useState(template?.name ?? "");
  // On creation, the slug is always derived from the name; on edit it is locked.
  const [slug, setSlug] = useState(template?.slug ?? "");
  const [description, setDescription] = useState(template?.description ?? "");

  const [allowedChildIds, setAllowedChildIds] = useState<number[]>(() => {
    const raw = template?.rules?.allowedChildTemplateIds;
    if (Array.isArray(raw)) return raw.map(Number).filter(Boolean);
    return [];
  });

  const [fields, setFields] = useState<FieldDraft[]>(
    (template?.fields ?? []).map((f) => ({
      _id: uid(),
      fieldKey: f.fieldKey,
      fieldType: f.fieldType,
      label: f.label,
      placeholder: f.placeholder ?? "",
      required: f.required,
      defaultValue: f.defaultValue ?? "",
      options: f.options ?? "{}",
    })),
  );

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Auto-generate slug from name only in creation mode
  useEffect(() => {
    if (!isEdit) {
      setSlug(slugify(name));
    }
  }, [name, isEdit]);

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(null), 4000);
    return () => clearTimeout(t);
  }, [savedAt]);

  function addField() {
    setFields((prev) => [
      ...prev,
      {
        _id: uid(),
        fieldKey: "",
        fieldType: "text",
        label: "",
        placeholder: "",
        required: false,
        defaultValue: "",
        options: "{}",
      },
    ]);
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f._id !== id));
  }

  function updateField<K extends keyof FieldDraft>(
    id: string,
    key: K,
    value: FieldDraft[K],
  ) {
    setFields((prev) =>
      prev.map((f) => (f._id === id ? { ...f, [key]: value } : f)),
    );
  }

  function toggleAllowedChild(id: number) {
    setAllowedChildIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();

      if (template?.id) fd.set("id", String(template.id));

      fd.set("name", name);
      fd.set("slug", slug);
      fd.set("description", description);

      fd.set(
        "fieldsJson",
        JSON.stringify(
          fields.map((f, i) => ({
            fieldKey: f.fieldKey,
            fieldType: f.fieldType,
            label: f.label,
            placeholder: f.placeholder || null,
            required: f.required,
            defaultValue: f.defaultValue || null,
            options: f.options,
            sortOrder: i,
          })),
        ),
      );

      fd.set("allowedChildTemplateIdsJson", JSON.stringify(allowedChildIds));

      await saveAction(fd);
      setSavedAt(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (err) {
      if (isRedirectError(err)) throw err;
      console.error(err);
      setError("Error while saving. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm transition-colors";
  const inputStyle: React.CSSProperties = {
    background: "var(--admin-page-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };
  const inputReadonlyStyle: React.CSSProperties = {
    background: "var(--admin-input-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text-faint)",
    cursor: "not-allowed",
    fontFamily: "monospace",
    fontSize: "0.8rem",
  };
  const fieldInputStyle: React.CSSProperties = {
    background: "var(--admin-page-bg)",
    border: "1px solid var(--admin-input-border)",
    color: "var(--admin-text)",
  };
  const labelCls = "block text-xs font-medium mb-1";

  const availableTemplates = allTemplates.filter((t) => t.id !== template?.id);

  const currentLabel = isEdit
    ? name || template?.name || "Edit template"
    : name
      ? name
      : "New template";

  const componentName = slug ? "Template" + slugToPascalCase(slug) : null;
  const componentMissing =
    !!slug && registeredSlugs.length > 0 && !registeredSlugSet.has(slug);

  return (
    <form id={FORM_ID} ref={formRef} onSubmit={handleSubmit}>
      {template?.id && <input type="hidden" name="id" value={template.id} />}

      <EditorPageHeader
        breadcrumbs={[
          { label: "Pages", href: getAdminPath("content-pages") },
          { label: "Templates", href: getAdminPath("content-templates") },
        ]}
        currentLabel={currentLabel}
        backHref={getAdminPath("content-templates")}
        saveLabel={isEdit ? "Save" : "Create Template"}
        formId={FORM_ID}
        isPending={saving}
        savedAt={savedAt}
        error={error}
      />

      {/* Tab bar */}
      <div
        className="flex mb-5 rounded-xl overflow-hidden"
        style={{
          background: "var(--admin-card-bg)",
          border: "1px solid var(--admin-border)",
        }}>
        <div
          className="flex"
          style={{
            borderBottom: "1px solid var(--admin-border)",
            width: "100%",
          }}>
          <button
            type="button"
            style={tabStyle(activeTab === "general")}
            onClick={() => setActiveTab("general")}>
            <Settings size={14} />
            General
          </button>
          <button
            type="button"
            style={tabStyle(activeTab === "rules")}
            onClick={() => setActiveTab("rules")}>
            <ShieldCheck size={14} />
            Rules
            {allowedChildIds.length > 0 && (
              <span
                className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  background:
                    "color-mix(in srgb, var(--admin-accent) 15%, var(--admin-card-bg))",
                  color: "var(--admin-accent)",
                  fontSize: "0.65rem",
                  lineHeight: 1,
                }}>
                {allowedChildIds.length}
              </span>
            )}
          </button>
          <button
            type="button"
            style={tabStyle(activeTab === "implementation")}
            onClick={() => setActiveTab("implementation")}>
            <Code2 size={14} />
            Implementation
            {isEdit && (
              <span
                className="ml-1 px-1.5 py-0.5 rounded-full"
                style={{
                  background:
                    "color-mix(in srgb, var(--admin-accent) 15%, var(--admin-card-bg))",
                  color: "var(--admin-accent)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: "2px 5px",
                }}>
                DEV
              </span>
            )}
          </button>
        </div>
      </div>

      {componentMissing && (
        <div
          className="rounded-xl p-4 mb-5 flex items-start gap-3"
          style={{
            background: "color-mix(in srgb, #f59e0b 8%, var(--admin-card-bg))",
            border:
              "1px solid color-mix(in srgb, #f59e0b 35%, transparent)",
          }}>
          <span style={{ color: "#b45309", marginTop: 1 }}>⚠</span>
          <div className="text-sm" style={{ color: "var(--admin-text)" }}>
            <strong>Componente React mancante.</strong> Lo slug{" "}
            <code
              style={{
                background: "var(--admin-input-bg)",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: "0.78rem",
              }}>
              {slug}
            </code>{" "}
            non ha un file{" "}
            <code
              style={{
                background: "var(--admin-input-bg)",
                padding: "1px 6px",
                borderRadius: 4,
                fontSize: "0.78rem",
              }}>
              {componentName}.tsx
            </code>{" "}
            in <code>app/(frontend)/_templates/</code>. Le pagine che usano
            questo template verranno renderizzate col fallback{" "}
            <strong>TemplateDefault</strong> (nessuno style config né campo
            custom). Vai nella tab <strong>Implementation</strong> per
            generare il componente.
          </div>
        </div>
      )}

      {activeTab === "general" && (
        <>
          {/* Basic information */}
          <section
            className="rounded-xl p-5 mb-5"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-border)",
            }}>
            <h2
              className="text-sm font-semibold mb-4"
              style={{ color: "var(--admin-text)" }}>
              Basic information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  className={labelCls}
                  style={{ color: "var(--admin-text-muted)" }}>
                  Name *
                </label>
                <input
                  name="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="e.g. Blog Article"
                />
              </div>
              <div>
                <label
                  className={labelCls}
                  style={{ color: "var(--admin-text-muted)" }}>
                  Slug
                  {!isEdit && (
                    <span
                      className="ml-1.5 text-xs font-normal"
                      style={{ color: "var(--admin-text-faint)" }}>
                      — automatically generated from the name
                    </span>
                  )}
                  {isEdit && (
                    <span
                      className="ml-1.5 text-xs font-normal"
                      style={{ color: "var(--admin-text-faint)" }}>
                      — cannot be changed after creation
                    </span>
                  )}
                </label>
                <input
                  name="slug"
                  value={slug}
                  readOnly
                  className={inputCls}
                  style={inputReadonlyStyle}
                  placeholder="generated from the name…"
                />
                {componentName && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--admin-text-faint)" }}>
                    File:{" "}
                    <code style={{ fontFamily: "monospace" }}>
                      {componentName}.tsx
                    </code>
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <label
                  className={labelCls}
                  style={{ color: "var(--admin-text-muted)" }}>
                  Description
                </label>
                <textarea
                  name="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={inputCls}
                  style={inputStyle}
                  placeholder="Brief description of how the template is used…"
                />
              </div>
            </div>
          </section>

          {/* Custom fields */}
          <section
            className="rounded-xl p-5 mb-6"
            style={{
              background: "var(--admin-card-bg)",
              border: "1px solid var(--admin-border)",
            }}>
            <div className="flex items-center justify-between mb-4">
              <h2
                className="text-sm font-semibold"
                style={{ color: "var(--admin-text)" }}>
                Custom fields ({fields.length})
              </h2>
              <button
                type="button"
                onClick={addField}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: "var(--admin-accent)", color: "#fff" }}>
                <Plus size={13} /> Add field
              </button>
            </div>

            {fields.length === 0 && (
              <p
                className="text-sm text-center py-6"
                style={{ color: "var(--admin-text-muted)" }}>
                No fields — the template uses only the main content
              </p>
            )}

            <div className="space-y-3">
              {fields.map((field) => (
                <div
                  key={field._id}
                  className="rounded-lg p-3"
                  style={{
                    background: "var(--admin-input-bg)",
                    border: "1px solid var(--admin-border)",
                  }}>
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical
                      size={14}
                      style={{ color: "var(--admin-text-faint)" }}
                    />
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "var(--admin-text)" }}>
                      Field
                    </span>
                    <button
                      type="button"
                      onClick={() => removeField(field._id)}
                      className="ml-auto p-1 rounded"
                      style={{ color: "var(--admin-error, #dc2626)" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        className={labelCls}
                        style={{ color: "var(--admin-text-muted)" }}>
                        Key *
                      </label>
                      <input
                        value={field.fieldKey}
                        onChange={(e) =>
                          updateField(field._id, "fieldKey", e.target.value)
                        }
                        placeholder="e.g. coverImage"
                        className={inputCls}
                        style={fieldInputStyle}
                        required
                      />
                    </div>
                    <div>
                      <label
                        className={labelCls}
                        style={{ color: "var(--admin-text-muted)" }}>
                        Label *
                      </label>
                      <input
                        value={field.label}
                        onChange={(e) =>
                          updateField(field._id, "label", e.target.value)
                        }
                        placeholder="e.g. Cover Image"
                        className={inputCls}
                        style={fieldInputStyle}
                        required
                      />
                    </div>
                    <div>
                      <label
                        className={labelCls}
                        style={{ color: "var(--admin-text-muted)" }}>
                        Type
                      </label>
                      <select
                        value={field.fieldType}
                        onChange={(e) =>
                          updateField(field._id, "fieldType", e.target.value)
                        }
                        className={inputCls}
                        style={fieldInputStyle}>
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft.value} value={ft.value}>
                            {ft.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label
                        className={labelCls}
                        style={{ color: "var(--admin-text-muted)" }}>
                        Placeholder
                      </label>
                      <input
                        value={field.placeholder}
                        onChange={(e) =>
                          updateField(field._id, "placeholder", e.target.value)
                        }
                        placeholder="Hint text"
                        className={inputCls}
                        style={fieldInputStyle}
                      />
                    </div>
                    <div>
                      <label
                        className={labelCls}
                        style={{ color: "var(--admin-text-muted)" }}>
                        Default value
                      </label>
                      <input
                        value={field.defaultValue}
                        onChange={(e) =>
                          updateField(field._id, "defaultValue", e.target.value)
                        }
                        placeholder="Leave empty if none"
                        className={inputCls}
                        style={fieldInputStyle}
                      />
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer pb-2">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) =>
                            updateField(field._id, "required", e.target.checked)
                          }
                          className="w-4 h-4 rounded"
                        />
                        <span
                          className="text-xs font-medium"
                          style={{ color: "var(--admin-text-muted)" }}>
                          Required
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {activeTab === "rules" && (
        <section
          className="rounded-xl p-5 mb-6"
          style={{
            background: "var(--admin-card-bg)",
            border: "1px solid var(--admin-border)",
          }}>
          <div className="mb-5">
            <h2
              className="text-sm font-semibold mb-1"
              style={{ color: "var(--admin-text)" }}>
              Allowed child templates
            </h2>
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--admin-text-muted)" }}>
              Select which templates can be used by the child pages of a page
              with this template. If you select a single template, it will be
              automatically assigned to the new child page without prompting for
              a choice. If you select more than one, a selector will be shown
              before creating the page. If you select none, any template can be
              used.
            </p>
          </div>

          {availableTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
              <ShieldCheck
                size={28}
                style={{ color: "var(--admin-text-faint)" }}
              />
              <p
                className="text-sm"
                style={{ color: "var(--admin-text-muted)" }}>
                {isEdit
                  ? "There are no other templates in the system."
                  : "Save the template first, then you can configure the rules."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {availableTemplates.map((t) => {
                const checked = allowedChildIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 rounded-lg px-4 py-3 cursor-pointer transition-colors"
                    style={{
                      background: checked
                        ? "color-mix(in srgb, var(--admin-accent) 8%, var(--admin-input-bg))"
                        : "var(--admin-input-bg)",
                      border: checked
                        ? "1px solid color-mix(in srgb, var(--admin-accent) 35%, transparent)"
                        : "1px solid var(--admin-border)",
                    }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAllowedChild(t.id)}
                      className="w-4 h-4 rounded shrink-0"
                      style={{ accentColor: "var(--admin-accent)" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-medium"
                        style={{ color: "var(--admin-text)" }}>
                        {t.name}
                      </p>
                      <p
                        className="text-xs font-mono"
                        style={{ color: "var(--admin-text-faint)" }}>
                        {t.slug}
                      </p>
                    </div>
                    {checked && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{
                          background:
                            "color-mix(in srgb, var(--admin-accent) 15%, var(--admin-card-bg))",
                          color: "var(--admin-accent)",
                        }}>
                        Allowed
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {allowedChildIds.length > 0 && (
            <div
              className="mt-4 rounded-lg px-4 py-3 flex items-start gap-2"
              style={{
                background:
                  "color-mix(in srgb, var(--admin-accent) 6%, var(--admin-card-bg))",
                border:
                  "1px solid color-mix(in srgb, var(--admin-accent) 20%, transparent)",
              }}>
              <ShieldCheck
                size={14}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--admin-accent)" }}
              />
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--admin-text-muted)" }}>
                {allowedChildIds.length === 1 ? (
                  <>
                    The template{" "}
                    <strong style={{ color: "var(--admin-text)" }}>
                      {
                        availableTemplates.find(
                          (t) => t.id === allowedChildIds[0],
                        )?.name
                      }
                    </strong>{" "}
                    will be assigned <strong>automatically</strong> to the new
                    child page — no choice required.
                  </>
                ) : (
                  <>
                    When creating a child page, a selector will be shown with{" "}
                    <strong style={{ color: "var(--admin-text)" }}>
                      {allowedChildIds.length} templates
                    </strong>{" "}
                    to choose from.
                  </>
                )}
              </p>
            </div>
          )}
        </section>
      )}

      {activeTab === "implementation" && (
        <ImplementationGuide slug={slug} fields={fields} />
      )}
    </form>
  );
}
