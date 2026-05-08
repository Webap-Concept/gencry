/**
 * Default seed CSS per il rendering dei contenuti CMS.
 *
 * Questo modulo è la fonte canonica del CSS che viene servito da
 * `/api/cms/styles.css` quando l'admin non ha ancora personalizzato gli
 * stili (oppure ha azzerato l'override). L'admin può modificarlo dalla
 * sezione "Content / Stile CSS"; il valore custom è persistito in
 * `app_settings` con key `cms.custom_css`. Vuoto / null = usa il default.
 *
 * Nota: la stringa qui sotto era originariamente il file `cms.css`. Per
 * eliminare la duplicazione e poter servire/comparare con il valore in
 * DB senza filesystem read, è stata convertita in costante TypeScript.
 *
 * Convenzioni:
 * - Niente token Tailwind (`bg-*`, `text-*`): le pagine CMS usano
 *   `dangerouslySetInnerHTML` e non hanno classi Tailwind nel content.
 * - Tutte le regole sono scopate sotto `.tpl-content` o sui suoi
 *   discendenti (es. `.cms-figure` è sempre dentro `.tpl-content`).
 *
 * Backslash escape: `\\201C`/`\\201D` in TS → `\201C`/`\201D` in CSS
 * (codepoint Unicode per le virgolette tipografiche `“` `”`).
 */
export const DEFAULT_CMS_STYLES = `/* ---------------------------------------------------------------------------
   .tpl-content — wrapper attorno all HTML grezzo del rich-text editor
   --------------------------------------------------------------------------- */

.tpl-content h1,
.tpl-content h2,
.tpl-content h3,
.tpl-content h4,
.tpl-content h5,
.tpl-content h6 {
  margin-top: 2em;
  margin-bottom: 0.5em;
  line-height: 1.25;
  font-weight: 700;
}

.tpl-content h1 { font-size: 2rem; }
.tpl-content h2 { font-size: 1.5rem; }
.tpl-content h3 { font-size: 1.25rem; }

.tpl-content p {
  margin-bottom: 1.25em;
}

.tpl-content ul,
.tpl-content ol {
  margin-bottom: 1.25em;
  padding-left: 1.5em;
}

.tpl-content li {
  margin-bottom: 0.375em;
}

.tpl-content a {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.tpl-content strong {
  font-weight: 700;
}

.tpl-content em {
  font-style: italic;
}

.tpl-content code {
  font-family: ui-monospace, monospace;
  font-size: 0.875em;
  background: rgba(0, 0, 0, 0.06);
  padding: 0.15em 0.35em;
  border-radius: 3px;
}

.tpl-content pre {
  background: rgba(0, 0, 0, 0.06);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 1.25em;
}

.tpl-content pre code {
  background: none;
  padding: 0;
  font-size: 0.875rem;
}

.tpl-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 1.5em 0;
}

.tpl-content hr {
  border: none;
  border-top: 1px solid currentColor;
  opacity: 0.2;
  margin: 2em 0;
}

/* ---------------------------------------------------------------------------
   .cms-figure — immagini con caption + align + zoom inserite via Tiptap
   figureImage node. Lo style viene da data-align + style="width:N%" sul
   tag <figure>. Lo zoom è gestito dal client component cms-figure-lightbox.
   --------------------------------------------------------------------------- */

.tpl-content .cms-figure {
  margin: 1.5em 0;
}
.tpl-content .cms-figure img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 0;
}
.tpl-content .cms-figure figcaption {
  margin-top: 0.5em;
  font-size: 0.875em;
  color: var(--gc-fg-3, #6c6c6c);
  text-align: center;
  font-style: italic;
}
.tpl-content .cms-figure[data-zoom="true"] img {
  cursor: zoom-in;
}
.tpl-content .cms-figure[data-align="left"] {
  float: left;
  margin: 0.25em 1.25em 0.5em 0;
}
.tpl-content .cms-figure[data-align="right"] {
  float: right;
  margin: 0.25em 0 0.5em 1.25em;
}
.tpl-content .cms-figure[data-align="center"] {
  margin-left: auto;
  margin-right: auto;
}
.tpl-content .cms-figure[data-align="full"] {
  width: 100% !important;
  margin-left: 0;
  margin-right: 0;
  clear: both;
}

.tpl-content h1,
.tpl-content h2,
.tpl-content h3,
.tpl-content h4,
.tpl-content h5,
.tpl-content h6,
.tpl-content blockquote,
.tpl-content hr {
  clear: both;
}

@media (max-width: 640px) {
  .tpl-content .cms-figure[data-align="left"],
  .tpl-content .cms-figure[data-align="right"] {
    float: none;
    width: 100% !important;
    margin: 1em 0;
  }
}

/* ---------------------------------------------------------------------------
   Blockquote — 4 varianti via data-style.
   --------------------------------------------------------------------------- */

.tpl-content blockquote {
  border-left: 3px solid currentColor;
  padding-left: 1rem;
  margin: 1.5em 0;
  opacity: 0.75;
  font-style: italic;
}
.tpl-content blockquote[data-style="card"] {
  border-left: none;
  background: rgba(0, 0, 0, 0.04);
  padding: 1em 1.25em;
  border-radius: 8px;
  font-style: normal;
  opacity: 1;
}
.tpl-content blockquote[data-style="pull"] {
  border-left: none;
  padding: 0.5em 0;
  margin: 1.75em auto;
  max-width: 36rem;
  text-align: center;
  font-size: 1.5em;
  line-height: 1.35;
  font-weight: 600;
  font-style: normal;
  opacity: 1;
}
.tpl-content blockquote[data-style="quoted"] {
  border-left: none;
  padding: 0.5em 2.5em;
  margin: 1.75em 0;
  position: relative;
  font-style: italic;
  opacity: 0.85;
}
.tpl-content blockquote[data-style="quoted"]::before {
  content: "\\201C";
  position: absolute;
  left: 0;
  top: -0.1em;
  font-size: 3.5em;
  line-height: 1;
  font-family: Georgia, "Times New Roman", serif;
  opacity: 0.4;
}
.tpl-content blockquote[data-style="quoted"]::after {
  content: "\\201D";
  position: absolute;
  right: 0;
  bottom: -0.6em;
  font-size: 3.5em;
  line-height: 1;
  font-family: Georgia, "Times New Roman", serif;
  opacity: 0.4;
}
`;
