// Pioggia di icone crypto: 5 monete che cadono dall'alto in loop.
// Va montato dentro un parent `relative overflow-hidden` per clippare
// le monete sotto il viewport (l'animazione le porta a +110vh).
//
// Le classi `gc404-coin*` e l'animazione `gc404-fall` sono definite in
// app/globals.css (il prefisso "404" è storico — sono nate per la pagina
// 404 e poi riusate altrove; tenere il prefisso evita migrazioni CSS).

function BtcIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5">
      <path d="M9 4v3M9 17v3M14 4v3M14 17v3" />
      <path d="M7 7h7a3 3 0 0 1 0 6H7zM7 13h8a3 3 0 0 1 0 6H7z" />
    </svg>
  );
}
function EthIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2 5 13l7 4 7-4-7-11Zm0 17-7-4 7 9 7-9-7 4Z" />
    </svg>
  );
}
function SolIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M5 6h13l-2 3H3zM3 11h13l2 3H5zM5 16h13l-2 3H3z" />
    </svg>
  );
}
function DogeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5">
      <path d="M5 5h6a7 7 0 0 1 0 14H5z" />
      <path d="M3 12h7" />
    </svg>
  );
}
function AdaIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5">
      <path d="M5 20 12 4l7 16M8 14h8" />
    </svg>
  );
}

const COINS = [
  { Icon: BtcIcon, cls: "gc404-coin-btc", left: "8%", dur: "5.5s", delay: "1.2s" },
  { Icon: EthIcon, cls: "gc404-coin-eth", left: "22%", dur: "6.2s", delay: "2s" },
  { Icon: SolIcon, cls: "gc404-coin-sol", left: "78%", dur: "5s", delay: "2.6s" },
  { Icon: DogeIcon, cls: "gc404-coin-doge", left: "92%", dur: "6.8s", delay: "3.4s" },
  { Icon: AdaIcon, cls: "gc404-coin-ada", left: "50%", dur: "6.4s", delay: "4s" },
];

export function CoinRain() {
  return (
    <>
      {COINS.map((c, i) => (
        <span
          key={i}
          aria-hidden
          className={`gc404-coin ${c.cls}`}
          style={{
            top: "-10%",
            left: c.left,
            animationDuration: c.dur,
            animationDelay: c.delay,
          }}>
          <c.Icon />
        </span>
      ))}
    </>
  );
}
