import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
    >
      {toasts.map((toast) => {
        const iconMap = {
          success: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />,
          error: <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />,
          info: <Info className="h-5 w-5 shrink-0 text-neutral-700" />,
        };

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-elevated transition-all"
          >
            {iconMap[toast.type] || iconMap.info}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-black">
                {toast.title}
              </p>
              {toast.description && (
                <p className="mt-0.5 text-xs text-neutral-600">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-surface-soft hover:text-brand-black"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

