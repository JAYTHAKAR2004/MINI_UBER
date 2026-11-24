import { Check, CheckCircle2, FastForward, Pause, Play, RotateCcw } from 'lucide-react';
import { ORDER_STAGES } from '../context/OrderContext';

export default function OrderProgressTracker({
  stageIndex = 1,
  autoPlay = false,
  onToggleAutoPlay,
  onNextStage,
  onMarkDelivered,
  onReset,
}) {
  const clampedStage = Math.max(
    0,
    Math.min(ORDER_STAGES.length - 1, stageIndex)
  );
  const isDelivered = clampedStage === ORDER_STAGES.length - 1;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-bold text-brand-black">
            Delivery Timeline
          </h2>
          <p className="text-xs text-neutral-500">
            Demo order progression — does not auto-mark &ldquo;Delivered&rdquo; on a timer
          </p>
        </div>
        <span className="rounded-full bg-surface-soft px-3 py-1 text-[11px] font-semibold text-neutral-600">
          {ORDER_STAGES[clampedStage]}
        </span>
      </div>

      {/* Desktop 7-Stage Horizontal Stepper */}
      <div className="mt-6 hidden lg:block">
        <div className="relative flex items-start justify-between">
          <div
            className="absolute left-5 right-5 top-4 h-0.5 bg-neutral-200"
            aria-hidden="true"
          />
          <div
            className="absolute left-5 top-4 h-0.5 bg-brand-primary transition-all duration-500"
            style={{
              width: `calc(${
                (clampedStage / (ORDER_STAGES.length - 1)) * 100
              }% - 2.5rem)`,
            }}
            aria-hidden="true"
          />

          {ORDER_STAGES.map((stage, idx) => {
            const completed = idx < clampedStage;
            const current = idx === clampedStage;
            return (
              <div
                key={stage}
                className="relative z-10 flex flex-1 flex-col items-center text-center px-1"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    completed || (current && isDelivered)
                      ? 'bg-brand-primary text-white'
                      : current
                      ? 'bg-brand-primary text-white ring-4 ring-brand-primarySoft'
                      : 'border border-neutral-300 bg-white text-neutral-400'
                  }`}
                >
                  {completed || (current && isDelivered) ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    idx + 1
                  )}
                </span>
                <p
                  className={`mt-2 text-[11px] font-semibold leading-snug ${
                    completed || current
                      ? 'text-brand-black'
                      : 'text-neutral-400'
                  }`}
                >
                  {stage}
                </p>
                {current && !isDelivered && (
                  <span className="mt-0.5 text-[10px] font-semibold text-brand-primary">
                    Current
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile & Tablet Vertical Stepper */}
      <ol className="mt-5 space-y-3 lg:hidden">
        {ORDER_STAGES.map((stage, idx) => {
          const completed = idx < clampedStage;
          const current = idx === clampedStage;
          return (
            <li key={stage} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                    completed || (current && isDelivered)
                      ? 'bg-brand-primary text-white'
                      : current
                      ? 'bg-brand-primary text-white ring-4 ring-brand-primarySoft'
                      : 'bg-surface-soft text-neutral-400'
                  }`}
                >
                  {completed || (current && isDelivered) ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    idx + 1
                  )}
                </span>
                {idx < ORDER_STAGES.length - 1 && (
                  <span
                    className={`mt-1 h-4 w-0.5 ${
                      completed ? 'bg-brand-primary' : 'bg-neutral-200'
                    }`}
                  />
                )}
              </div>
              <div className="pt-0.5">
                <p
                  className={`text-sm font-semibold ${
                    completed || current
                      ? 'text-brand-black'
                      : 'text-neutral-400'
                  }`}
                >
                  {stage}
                </p>
                {current && !isDelivered && (
                  <p className="text-[11px] font-medium text-brand-primary">
                    In progress
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Interactive Demo Controls */}
      {(onToggleAutoPlay || onNextStage || onMarkDelivered || onReset) && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
          {onToggleAutoPlay && (
            <button
              type="button"
              disabled={clampedStage >= ORDER_STAGES.length - 2}
              onClick={onToggleAutoPlay}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              {autoPlay ? (
                <>
                  <Pause className="h-3.5 w-3.5 text-brand-primary" />
                  Pause Demo
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 text-brand-primary" />
                  Simulate Until &ldquo;On the way&rdquo;
                </>
              )}
            </button>
          )}
          {onNextStage && (
            <button
              type="button"
              disabled={isDelivered}
              onClick={onNextStage}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-black hover:bg-surface-soft disabled:opacity-40"
            >
              <FastForward className="h-3.5 w-3.5" />
              Next Stage
            </button>
          )}
          {onMarkDelivered && !isDelivered && (
            <button
              type="button"
              onClick={onMarkDelivered}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark Delivered (Demo)
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-surface-soft"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
