"use client";

// components/feed/SlotBoundary.tsx
//
// Error Boundary attorno a ogni sezione della home. Una sezione che
// esplode (es. modulo che butta un'eccezione runtime) viene isolata:
// le altre sezioni della home continuano a renderizzare normalmente
// invece di rompere l'intera home.
//
// Pattern: 1 boundary per sezione, fallback compatto + retry button.
// Tradeoff: 1 extra client component per sezione (impatto trascurabile),
// ma una home che resta sempre navigabile anche con bug nei moduli.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  /** Used in log messages for debugging which section crashed. */
  sectionKey?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class SlotBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Diagnostica: identifichiamo la sezione che ha crashato per i log.
    // In futuro questo è il punto di aggancio per inviare l'errore a
    // Sentry con tag `home.section = <key>`.
    console.error(
      `[home/SlotBoundary] section "${this.props.sectionKey ?? "unknown"}" crashed:`,
      error,
      info,
    );
  }

  private handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-gc border border-gc-line bg-gc-bg-2 p-4 flex items-start gap-3">
        <AlertTriangle
          size={18}
          strokeWidth={1.6}
          className="text-gc-fg-3 shrink-0 mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-gc-fg">
            Sezione temporaneamente non disponibile.
          </p>
          <p className="text-[12px] text-gc-fg-3 mt-0.5">
            Le altre sezioni della home continuano a funzionare normalmente.
          </p>
        </div>
        <button
          type="button"
          onClick={this.handleRetry}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gc-line text-[12px] font-medium text-gc-fg-2 hover:bg-gc-bg-3 transition"
        >
          <RefreshCw size={12} />
          Riprova
        </button>
      </div>
    );
  }
}
