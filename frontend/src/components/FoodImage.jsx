import { useState } from 'react';
import { Utensils } from 'lucide-react';

export default function FoodImage({
  src,
  alt,
  className = '',
  containerClassName = '',
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={`relative overflow-hidden bg-surface-soft ${containerClassName}`}
    >
      {!loaded && !errored && (
        <div className="absolute inset-0 skeleton-shimmer" aria-hidden="true" />
      )}

      {errored || !src ? (
        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 p-4 text-neutral-500">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-soft">
            <Utensils className="h-5 w-5 text-brand-primary" />
          </div>
          <span className="mt-2 line-clamp-1 text-center text-xs font-medium text-neutral-500">
            {alt || 'Zomato Dish'}
          </span>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
        />
      )}
    </div>
  );
}

