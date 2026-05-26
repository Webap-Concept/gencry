// lib/modules/notifications/email-channel/defaults.ts
//
// Default code-side dei 4 achievement email template. Single source of
// truth: importati sia dai renderer (per fallback in resolveTemplate)
// sia dalla page admin /templates (per mostrarli come placeholder degli
// input).
//
// Mustache placeholder `{{token}}` interpolati a runtime — vedi
// resolveTemplate in renderers/_shared.ts.

export const ACHIEVEMENT_EMAIL_DEFAULTS = {
  firstLikeSubject: "🎉 {{actorName}} ha messo la prima reazione al tuo post",
  firstLikeBody:
    "Ciao {{userName}},\n\n{{actorName}} ha appena messo la prima reazione al tuo post — complimenti, hai iniziato la conversazione!\n\nContinua a postare: ogni reazione è un segnale che la tua voce conta nella community.",
  firstLikeFooter:
    "Ricevi questa email perché sei iscritto a {{appName}}.",

  viralLikesSubject: "🚀 Il tuo post sta andando virale — {{totalCount}} reazioni",
  viralLikesBody:
    "Ciao {{userName}},\n\nIl tuo post ha appena raggiunto {{totalCount}} reazioni in poche ore. È la community che ti dice che l'argomento risuona — continua così!\n\nPensa di approfondire con un post di follow-up: il momentum è dalla tua parte.",
  viralLikesFooter:
    "Ricevi questa email perché il tuo post ha superato la soglia virale su {{appName}}.",

  viralCommentsSubject: "💬 Il tuo post sta facendo discutere — {{totalCount}} commenti",
  viralCommentsBody:
    "Ciao {{userName}},\n\nIl tuo post ha raccolto {{totalCount}} commenti in poche ore. La community vuole confrontarsi con quello che hai scritto — è il momento giusto per rispondere.\n\nRispondere ai commenti è il modo più semplice per tenere viva la conversazione e trasformare lettori occasionali in follower.",
  viralCommentsFooter:
    "Ricevi questa email perché il tuo post ha superato la soglia virale sui commenti su {{appName}}.",

  viralRepostsSubject: "🔁 Il tuo post viene citato molto — {{totalCount}} repost",
  viralRepostsBody:
    "Ciao {{userName}},\n\nIl tuo post è stato citato da {{totalCount}} persone in poche ore. Il repost è il segnale più forte che la tua idea si sta diffondendo.\n\nApri i repost per vedere come altre voci stanno rilanciando la tua idea — potrebbero esserci riprese a cui vale la pena rispondere.",
  viralRepostsFooter:
    "Ricevi questa email perché il tuo post ha superato la soglia virale sui repost su {{appName}}.",
} as const;
