export default function BrandLogo({ size = 'md', light = false, showBadge = false }) {
  const heightClass = size === 'sm' ? 'h-6' : 'h-7';

  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={
          light
            ? 'inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-soft'
            : 'inline-flex items-center'
        }
      >
        <img
          src="/zomato-logo.png"
          alt="Zomato"
          className={`${heightClass} w-auto object-contain`}
        />
      </span>
      {showBadge && (
        <span
          className={`hidden rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline-block ${
            light
              ? 'bg-neutral-800 text-neutral-300'
              : 'bg-brand-primarySoft text-brand-primaryDark'
          }`}
        >
          AI ETA
        </span>
      )}
    </span>
  );
}
