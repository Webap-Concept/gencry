"use client";

import type { MediaAsset } from "@/lib/db/media-queries";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ImageLightboxProps {
  asset: MediaAsset;
  onClose: () => void;
}

export function ImageLightbox({ asset, onClose }: ImageLightboxProps) {
  const t = useTranslations("admin.content.media.lightbox");

  // ESC per chiudere + lock dello scroll del body mentre il lightbox è
  // aperto (altrimenti il body scrolla sotto l'overlay con la wheel).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("ariaLabel", { name: asset.filename })}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1.5rem",
        cursor: "zoom-out",
      }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={t("close")}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          background: "rgba(255,255,255,0.12)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 9999,
          color: "#fff",
          width: 36,
          height: 36,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          backdropFilter: "blur(4px)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.22)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(255,255,255,0.12)";
        }}>
        <X size={18} />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          cursor: "default",
        }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.publicUrl}
          alt={asset.altText ?? asset.filename}
          style={{
            maxWidth: "100%",
            maxHeight: "calc(100vh - 7rem)",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            borderRadius: 8,
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            background: "#fff",
          }}
        />
        <p
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
            wordBreak: "break-word",
            maxWidth: "90vw",
          }}>
          {asset.filename}
        </p>
      </div>
    </div>,
    document.body,
  );
}
