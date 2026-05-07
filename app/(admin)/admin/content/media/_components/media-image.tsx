import Image from "next/image";
import { getOptimizedImageProps } from "@/lib/storage/image-optimizer";

interface MediaImageProps {
  publicUrl: string;
  alt: string;
  width: number;
  height: number;
  quality?: number;
  className?: string;
  sizes?: string;
}

/**
 * Wrapper su next/image che applica la modalità di ottimizzazione corrente
 * (vercel|supabase). Usalo ovunque renderizzi un asset di media library.
 */
export function MediaImage({
  publicUrl,
  alt,
  width,
  height,
  quality,
  className,
  sizes,
}: MediaImageProps) {
  const props = getOptimizedImageProps(publicUrl, { width, quality });
  return (
    <Image
      src={props.src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      className={className}
      unoptimized={props.unoptimized}
    />
  );
}
