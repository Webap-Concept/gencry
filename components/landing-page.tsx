"use client";

import { joinWaitingListAction } from "@/lib/waiting-list/actions";
import { useState, useTransition } from "react";

export default function GenerazioneCrypto() {
  const [statusMsg, setStatusMsg] = useState("");
  const [statusColor, setStatusColor] = useState("");
  const [statusVisible, setStatusVisible] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (
      form.elements.namedItem("email") as HTMLInputElement
    ).value.trim();

    // Validazione client (UX immediata). La server action e' autoritativa.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatusMsg("Hmm, controlla l'email e riprova.");
      setStatusColor("#b8420f");
      setStatusVisible(true);
      return;
    }

    startTransition(async () => {
      const result = await joinWaitingListAction(email);
      if (result.ok) {
        setStatusMsg(result.message + " ✦");
        setStatusColor("");
        form.reset();
      } else {
        setStatusMsg(result.error);
        setStatusColor("#b8420f");
      }
      setStatusVisible(true);
    });
  }

  return (
    <>
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,700,900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap');

        :root {
          --gc-cream: #d4c1a4;
          --gc-cream-tint: #e2d3bb;
          --gc-cream-shade: #bca787;
          --gc-orange: #fa8b1e;
          --gc-orange-deep: #e07712;
          --gc-green: #78b491;
          --gc-green-dark: #123928;
          --gc-ink: #123928;
        }

        .gc-body {
          font-family: "Satoshi", "Helvetica Neue", Helvetica, Arial, sans-serif;
          background: var(--gc-cream-tint);
          color: var(--gc-ink);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          overflow-x: hidden;
          position: relative;
          min-height: 100vh;
        }

        .gc-body::before {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.35;
          mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.07  0 0 0 0 0.22  0 0 0 0 0.16  0 0 0 0.18 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        }

        .gc-body::after {
          content: "";
          position: fixed;
          top: 50%;
          left: 50%;
          width: 900px;
          height: 900px;
          transform: translate(-50%, -58%);
          background: radial-gradient(
            closest-side,
            rgba(250, 139, 30, 0.16),
            rgba(250, 139, 30, 0) 70%
          );
          pointer-events: none;
          z-index: 0;
        }

        .gc-frame {
          position: relative;
          z-index: 2;
          min-height: 100vh;
          display: grid;
          grid-template-rows: auto 1fr auto;
          padding: 28px clamp(20px, 4vw, 90px);
        }

        .gc-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--gc-green-dark);
        }

        .gc-top .gc-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--gc-orange);
          margin-right: 8px;
          animation: gc-pulse 1.8s ease-in-out infinite;
          vertical-align: middle;
        }

        @keyframes gc-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.55; }
        }

        .gc-top .gc-right { opacity: 0.7; }

        .gc-main {
          display: grid;
          grid-template-columns: 1.05fr 0.95fr;
          align-items: center;
          gap: clamp(32px, 6vw, 96px);
          padding: clamp(24px, 5vw, 64px) 0;
        }

        .gc-copy {
          max-width: 560px;
          animation: gc-rise 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }

        @keyframes gc-rise {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .gc-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--gc-green-dark);
          background: rgba(18, 57, 40, 0.06);
          border: 1px solid rgba(18, 57, 40, 0.18);
          padding: 8px 14px;
          border-radius: 999px;
        }

        .gc-eyebrow .gc-sq {
          width: 6px;
          height: 6px;
          background: var(--gc-green);
          border-radius: 1px;
        }

        .gc-h1 {
          font-family: "Satoshi", sans-serif;
          font-weight: 500;
          font-size: clamp(44px, 7.4vw, 104px);
          line-height: 0.95;
          letter-spacing: -0.035em;
          margin-top: 22px;
          color: var(--gc-green-dark);
          text-wrap: balance;
        }

        .gc-h1 .gc-it {
          font-family: "Instrument Serif", serif;
          font-style: italic;
          font-weight: 400;
          color: var(--gc-orange);
          letter-spacing: -0.01em;
        }

        .gc-h1 .gc-amp {
          font-family: "Instrument Serif", serif;
          font-style: italic;
          font-weight: 400;
          color: var(--gc-green);
        }

        .gc-lede {
          margin-top: 26px;
          font-size: clamp(16px, 1.25vw, 19px);
          line-height: 1.55;
          color: rgba(18, 57, 40, 0.78);
          max-width: 46ch;
          text-wrap: pretty;
        }

        .gc-form {
          margin-top: 36px;
          display: flex;
          align-items: center;
          background: rgba(255, 253, 248, 0.55);
          border: 1px solid rgba(18, 57, 40, 0.22);
          border-radius: 999px;
          padding: 6px 6px 6px 22px;
          max-width: 520px;
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
        }

        .gc-form:focus-within {
          border-color: var(--gc-orange);
          box-shadow: 0 0 0 4px rgba(250, 139, 30, 0.18);
          background: rgba(255, 253, 248, 0.8);
        }

        .gc-email-input {
          flex: 1;
          border: 0;
          outline: 0;
          background: transparent;
          font-family: "Satoshi", "Helvetica Neue", sans-serif;
          font-size: 16px;
          color: var(--gc-green-dark);
          padding: 14px 8px;
          min-width: 0;
        }

        .gc-email-input::placeholder { color: rgba(18, 57, 40, 0.45); }

        .gc-btn {
          border: 0;
          cursor: pointer;
          font-family: "Satoshi", sans-serif;
          font-weight: 700;
          font-size: 15px;
          letter-spacing: 0.01em;
          color: #fff;
          background: var(--gc-orange);
          padding: 14px 22px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          transition: background 0.2s ease, transform 0.2s ease;
          white-space: nowrap;
        }

        .gc-btn:hover { background: var(--gc-orange-deep); }
        .gc-btn:active { transform: translateY(1px); }

        .gc-btn .gc-arrow {
          display: inline-block;
          transition: transform 0.25s ease;
        }

        .gc-btn:hover .gc-arrow { transform: translateX(3px); }

        .gc-meta {
          margin-top: 18px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(18, 57, 40, 0.55);
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
        }

        .gc-meta b { color: var(--gc-green-dark); font-weight: 500; }

        .gc-status {
          margin-top: 14px;
          font-size: 14px;
          color: var(--gc-green-dark);
          min-height: 20px;
          opacity: 0;
          transform: translateY(4px);
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .gc-status.gc-show { opacity: 1; transform: translateY(0); }

        .gc-mark {
          position: relative;
          display: grid;
          place-items: center;
          aspect-ratio: 1/1;
          width: 100%;
          max-width: 560px;
          justify-self: end;
          animation: gc-fade 1.1s ease both 0.15s;
        }

        @keyframes gc-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .gc-mark img {
          position: relative;
          z-index: 2;
          width: 62%;
          filter: drop-shadow(0 30px 50px rgba(18, 57, 40, 0.18));
          animation: gc-float 7s ease-in-out infinite;
        }

        @keyframes gc-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .gc-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px dashed rgba(18, 57, 40, 0.25);
        }

        .gc-ring.gc-r2 {
          inset: 8%;
          border-color: rgba(120, 180, 145, 0.45);
        }

        .gc-ring.gc-r3 {
          inset: 18%;
          border-color: rgba(250, 139, 30, 0.35);
        }

        .gc-ring.gc-spin { animation: gc-spin 80s linear infinite; }
        .gc-ring.gc-spin.gc-rev {
          animation-direction: reverse;
          animation-duration: 60s;
        }

        @keyframes gc-spin { to { transform: rotate(360deg); } }

        .gc-tick {
          position: absolute;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--gc-green-dark);
          background: var(--gc-cream);
          padding: 0 8px;
        }

        .gc-tick.gc-t1 { top: -6px; left: 50%; transform: translateX(-50%); }
        .gc-tick.gc-t2 { bottom: -6px; left: 50%; transform: translateX(-50%); color: var(--gc-orange); }
        .gc-tick.gc-t3 { top: 50%; left: -4px; transform: translateY(-50%) rotate(-90deg); transform-origin: center; }
        .gc-tick.gc-t4 { top: 50%; right: -4px; transform: translateY(-50%) rotate(90deg); transform-origin: center; color: var(--gc-green-dark); opacity: 0.6; }

        .gc-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(18, 57, 40, 0.6);
          padding-top: 24px;
          border-top: 1px solid rgba(18, 57, 40, 0.15);
          gap: 16px;
          flex-wrap: wrap;
        }

        .gc-footer a {
          color: var(--gc-green-dark);
          text-decoration: none;
          border-bottom: 1px solid transparent;
          transition: border-color 0.2s;
        }

        .gc-footer a:hover { border-color: var(--gc-orange); }

        @media (max-width: 880px) {
          .gc-main {
            grid-template-columns: 1fr;
            gap: 24px;
            padding-top: 20px;
          }
          .gc-mark {
            order: -1;
            max-width: 300px;
            justify-self: center;
            margin-bottom: 20px;
          }
          .gc-tick.gc-t1 { display: none; }
          .gc-h1 { font-size: clamp(44px, 12vw, 72px); }
          .gc-form {
            flex-wrap: wrap;
            border-radius: 22px;
            padding: 8px;
          }
          .gc-email-input {
            flex: 1 1 100%;
            padding: 14px 14px;
          }
          .gc-btn {
            flex: 1 1 100%;
            justify-content: center;
          }
          .gc-top .gc-right { display: none; }
        }
      `}</style>

      <div className="gc-body">
        <div className="gc-frame">
          <header className="gc-top">
            <span>
              <span className="gc-dot" />
              Generazione Crypto
            </span>
            <span className="gc-right">In arrivo · MMXXVI</span>
          </header>

          <main className="gc-main">
            <section className="gc-copy">
              <span className="gc-eyebrow">
                <span className="gc-sq" /> Coming soon
              </span>
              <h1 className="gc-h1">
                Il <span className="gc-it">social</span>
                <br />
                della nuova <br />
                <span className="gc-amp">generazione</span>.
              </h1>
              <p className="gc-lede">
                Stiamo costruendo lo spazio dove la community italiana di cripto
                si incontra, impara e cresce. Lascia la tua email — ti avvisiamo
                quando apriamo le porte.
              </p>

              <form
                id="waitlist"
                className="gc-form"
                noValidate
                onSubmit={handleSubmit}>
                <input
                  className="gc-email-input"
                  type="email"
                  name="email"
                  placeholder="la-tua@email.it"
                  autoComplete="email"
                  required
                  disabled={isPending}
                />
                <button type="submit" className="gc-btn" disabled={isPending}>
                  {isPending ? "Attendi…" : "Entra in lista"}
                  {!isPending && <span className="gc-arrow">→</span>}
                </button>
              </form>

              <div className="gc-meta">
                <span>
                  <b>01.</b> Accesso anticipato
                </span>
                <span>
                  <b>02.</b> Zero spam
                </span>
              </div>

              <p
                className={`gc-status${statusVisible ? " gc-show" : ""}`}
                style={statusColor ? { color: statusColor } : undefined}>
                {statusMsg}
              </p>
            </section>

            <section className="gc-mark" aria-hidden="false">
              <div className="gc-ring gc-r1 gc-spin" />
              <div className="gc-ring gc-r2 gc-spin gc-rev" />
              <div className="gc-ring gc-r3" />
              <span className="gc-tick gc-t1">Generazione · Crypto</span>
              <span className="gc-tick gc-t2">Soon · · ·</span>
              <span className="gc-tick gc-t3">v 0.1</span>
              <span className="gc-tick gc-t4">IT</span>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/gc_logo.svg" alt="Generazione Crypto" />
            </section>
          </main>

          <footer className="gc-footer">
            <span>© 2026 Generazione Crypto</span>
            <span>Made in Italy</span>
            <span>
              <a href="#" target="_blank" rel="noopener noreferrer">
                x
              </a>
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
