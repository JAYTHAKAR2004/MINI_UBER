export default function DataSourceBadge({ variant = 'demo', label }) {
  const styles = {
    live: {
      wrapper: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      dot: 'bg-emerald-500',
      defaultLabel: 'Live Backend API',
    },
    report: {
      wrapper: 'bg-brand-black text-white border-brand-black',
      dot: 'bg-brand-primary',
      defaultLabel: 'Offline ML Evaluation',
    },
    demo: {
      wrapper: 'bg-surface-soft text-neutral-700 border-neutral-200',
      dot: 'bg-neutral-400',
      defaultLabel: 'Demo Data',
    },
    simulated: {
      wrapper: 'bg-amber-50 text-amber-800 border-amber-200',
      dot: 'bg-amber-500',
      defaultLabel: 'Simulated',
    },
  };

  const config = styles[variant] || styles.demo;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${config.wrapper}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {label || config.defaultLabel}
    </span>
  );
}

