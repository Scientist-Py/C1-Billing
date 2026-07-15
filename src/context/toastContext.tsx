import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextType {
  toast: (options: Omit<ToastMessage, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ type, title, description, duration = 4000 }: Omit<ToastMessage, 'id'>) => {
      const id = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newToast: ToastMessage = { id, type, title, description, duration };
      
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((title: string, description?: string) => {
    toast({ type: 'success', title, description });
  }, [toast]);

  const error = useCallback((title: string, description?: string) => {
    toast({ type: 'error', title, description });
  }, [toast]);

  const info = useCallback((title: string, description?: string) => {
    toast({ type: 'info', title, description });
  }, [toast]);

  const warning = useCallback((title: string, description?: string) => {
    toast({ type: 'warning', title, description });
  }, [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      {/* Toast Stack Container */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const Icon = {
            success: CheckCircle2,
            error: XCircle,
            warning: AlertCircle,
            info: Info,
          }[t.type];

          const colors = {
            success: 'text-green-500 border-green-500/20 bg-green-50/70',
            error: 'text-red-500 border-red-500/20 bg-red-50/70',
            warning: 'text-amber-500 border-amber-500/20 bg-amber-50/70',
            info: 'text-blue-500 border-blue-500/20 bg-blue-50/70',
          }[t.type];

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex gap-3 p-4 rounded-2xl border backdrop-blur-md shadow-lg transition-all duration-300 animate-slide-in ${colors}`}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-apple-gray-800 leading-tight">{t.title}</h4>
                {t.description && (
                  <p className="text-[10px] text-[#86868b] leading-snug mt-1 font-light break-words">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="text-[#86868b] hover:text-apple-gray-800 transition-apple shrink-0 self-start p-0.5 rounded-lg hover:bg-apple-gray-100/50"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
