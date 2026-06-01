// components/modules/rewards/rewards-layout-shell.tsx
//
// RSC shell del modulo rewards per il layout (protected).
// Caricato SOLO quando il modulo è installato, via dynamic import nel layout.
// Fetcha il balance iniziale server-side e wrappa i children con:
//   - RewardsBalanceProvider (contesto saldo + Realtime)
//   - CheckinToastLauncher (toast giornaliero, chiama checkin lato client)
import { getUserBalance } from "@/lib/modules/rewards/queries";
import { RewardsBalanceProvider } from "./RewardsBalanceProvider";
import { CheckinToastLauncher } from "./CheckinToastLauncher";

export default async function RewardsLayoutShell({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const balanceRow = await getUserBalance(userId);
  const initialBalance = balanceRow?.balance ?? 0;

  return (
    <RewardsBalanceProvider viewerUserId={userId} initialBalance={initialBalance}>
      <CheckinToastLauncher />
      {children}
    </RewardsBalanceProvider>
  );
}
