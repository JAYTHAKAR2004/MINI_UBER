export default function VegBadge({ isVeg = true, size = 'sm' }) {
  const boxSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const dotSize = size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5';

  return (
    <span
      aria-label={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
      title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
      className={`inline-flex shrink-0 items-center justify-center rounded-[3px] border ${boxSize} ${
        isVeg ? 'border-emerald-600' : 'border-red-600'
      }`}
    >
      <span
        className={`rounded-full ${dotSize} ${
          isVeg ? 'bg-emerald-600' : 'bg-red-600'
        }`}
      />
    </span>
  );
}
