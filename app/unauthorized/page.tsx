// app/unauthorized/page.tsx
// Pagina mostrata quando un utente autenticato prova ad accedere
// a una risorsa per cui non ha il permesso.
import Link from "next/link";
import { ShieldOff } from "lucide-react";

export const metadata = { title: "Accesso negato" };

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-red-50">
            <ShieldOff size={28} className="text-red-500" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-gray-900">Accesso negato</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Non hai i permessi necessari per visualizzare questa pagina.
            Contatta un amministratore se pensi si tratti di un errore.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 transition-colors"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    </div>
  );
}
