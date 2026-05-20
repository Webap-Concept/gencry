"use client";

// app/(cms)/_templates/news/news-newsletter.tsx
//
// Form newsletter del blog. V1 stub: submit conferma localmente senza
// chiamare backend (non c'è ancora il modulo newsletter). Quando arriverà,
// l'onSubmit chiamerà una server action `subscribeNewsletter(email)`.

import { useState } from "react";

export function NewsNewsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    // TODO: integrazione con modulo newsletter (Resend / Mailchimp / proprio).
    setEmail("");
    setDone(true);
    setTimeout(() => setDone(false), 4000);
  }

  return (
    <div className="news-container">
      <section className="news-nl">
        <div>
          <div className="news-nl-h">
            <em>↳</em> Newsletter del martedì
          </div>
          <h2 className="news-nl-title">
            Cinque <em>link</em>, una mail, niente di più.
          </h2>
          <p className="news-nl-sub">
            Una watchlist tematica, un grafico che ti farà ragionare e i pezzi
            del Journal usciti nella settimana. Niente pubblicità, niente referral.
          </p>
        </div>
        <form className="news-nl-form" onSubmit={handleSubmit}>
          <div className="news-nl-row">
            <input
              type="email"
              placeholder="tua@email.it"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit">{done ? "✓ Iscritto" : "Iscrivimi"}</button>
          </div>
          <div className="news-nl-foot">
            <span>
              <em>↳</em> italiano
            </span>
            <span>· no spam</span>
            <span>· disiscrivi in 1 click</span>
          </div>
        </form>
      </section>
    </div>
  );
}
