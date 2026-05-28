// components/layout/AppLogo.tsx
//
// Logo brand con swap light/dark via classi CSS scoped a `.gc-dark`
// sul `<html>`. Render duale (2 <img>) con `logo-light` / `logo-dark`:
// solo uno e' visibile per tema, zero JS, zero flicker all'idratazione.
//
// Fallback: se `variantUrl` e' null/empty, renderizzo un solo <img>
// senza classi → visibile in entrambi i temi.

type Props = {
  url: string | null;
  variantUrl: string | null;
  /** Alt text. Aria-hidden viene applicato sul tag complementare per
   *  evitare AT che leggono il logo due volte. */
  alt: string;
  /** className applicata a entrambe le img (es. "h-16 w-auto"). */
  className?: string;
};

export function AppLogo({ url, variantUrl, alt, className }: Props) {
  if (!url) return null;

  // Fallback: niente variant → singolo logo always-visible.
  if (!variantUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={className} />;
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} className={`logo-light ${className ?? ""}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={variantUrl}
        alt=""
        aria-hidden
        className={`logo-dark ${className ?? ""}`}
      />
    </>
  );
}
