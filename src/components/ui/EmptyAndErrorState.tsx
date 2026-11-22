import React from 'react';
import { AlertTriangle, CheckCircle2, Info, RefreshCw, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useAuth();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`rounded-2xl p-3.5 shadow-lg border flex items-start gap-3 transition-all ${
            t.type === 'error'
              ? 'bg-[#171A17] text-white border-red-400/50'
              : t.type === 'success'
                ? 'bg-[#171A17] text-[#F0F8DF] border-[#B5D45D]'
                : 'bg-white text-[#20251D] border-[#D5E4B6]'
          }`}
        >
          {t.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          ) : t.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#B5D45D] shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 text-[#536F1A] shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{t.title}</p>
            {t.description && <p className="text-xs opacity-80 mt-0.5 leading-relaxed">{t.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="p-1 rounded-full opacity-70 hover:opacity-100"
            aria-label="Tutup notifikasi"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="rounded-2xl bg-white border border-[#D5E4B6] p-10 text-center flex flex-col items-center justify-center">
    <div className="w-12 h-12 rounded-2xl bg-[#F0F8DF] border border-[#D5E4B6] flex items-center justify-center text-[#536F1A] mb-4">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-[#20251D]">{title}</h3>
    <p className="text-sm text-[#536F1A] max-w-md mt-1 leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{
  message: string;
  onRetry?: () => void;
}> = ({ message, onRetry }) => (
  <div className="rounded-2xl bg-white border border-red-200 p-8 text-center flex flex-col items-center justify-center">
    <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center text-red-600 mb-3">
      <AlertTriangle className="w-5 h-5" />
    </div>
    <h3 className="text-base font-semibold text-[#20251D]">Terjadi Kendala</h3>
    <p className="text-sm text-[#20251D]/75 max-w-md mt-1">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#171A17] hover:bg-[#232822] text-[#F0F8DF] px-5 py-2 text-xs font-semibold transition-colors"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Coba Lagi
      </button>
    )}
  </div>
);
