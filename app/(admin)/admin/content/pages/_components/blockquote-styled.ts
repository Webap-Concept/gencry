import Blockquote from "@tiptap/extension-blockquote";

export type BlockquoteStyle = "default" | "card" | "pull" | "quoted";

export const BLOCKQUOTE_STYLES: BlockquoteStyle[] = [
  "default",
  "card",
  "pull",
  "quoted",
];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    blockquoteStyled: {
      setBlockquoteStyle: (style: BlockquoteStyle) => ReturnType;
    };
  }
}

/**
 * Estende il blockquote di StarterKit aggiungendo un attributo `data-style`
 * con 4 varianti — `default` (border-left), `card` (box con sfondo),
 * `pull` (pull-quote grande), `quoted` (virgolette tipografiche generate
 * via CSS `::before`/`::after`). Lo stile concreto è in `frontend.css` lato
 * pubblico e nello `<style>` di `page-editor.tsx` lato admin: qui ci
 * limitiamo a serializzare/deserializzare l'attributo HTML.
 *
 * StarterKit espone già un `Blockquote` con keymap (Ctrl+Shift+B) e
 * inputRules (`> `). `extend()` riusa tutto e si limita ad aggiungere
 * lo schema attribute + il command setter per il dropdown della toolbar.
 */
export const BlockquoteStyled = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: "default",
        parseHTML: (el) => el.getAttribute("data-style") ?? "default",
        renderHTML: (attrs) => {
          const value = (attrs.style as string) ?? "default";
          if (value === "default") return {};
          return { "data-style": value };
        },
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setBlockquoteStyle:
        (style: BlockquoteStyle) =>
        ({ commands, editor }) => {
          if (!editor.isActive("blockquote")) {
            commands.setBlockquote();
          }
          return commands.updateAttributes("blockquote", { style });
        },
    };
  },
});
