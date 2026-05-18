// app/(protected)/@modal/default.tsx
//
// Default del parallel slot @modal. Reso obbligatorio dal sistema
// parallel routes di Next: quando l'URL corrente non matcha nessuna
// page dentro lo slot (es. siamo su / e non su /post/[id]), Next deve
// avere "qualcosa" da renderizzare nello slot — `null` è la scelta
// corretta perché lo slot è puramente per modali on-demand.
//
// Vedi project_post_modal_intercepting_routes per il design completo.
export default function Default() {
  return null;
}
