import { ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  danger?: boolean;
}

export function ConfirmModal({ isOpen, title, message, confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel, isLoading, danger }: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.8)] rounded-3xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex justify-between items-start mb-5">
            <div className={`p-3 rounded-2xl ${danger ? 'bg-danger/15 text-danger border border-danger/20' : 'bg-accent/15 text-accent border border-accent/20'}`}>
              <AlertTriangle size={24} />
            </div>
            <button onClick={onCancel} className="text-muted hover:text-fg bg-surface2/50 hover:bg-surface2 transition-colors p-2 rounded-xl" disabled={isLoading}>
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
          <h3 className="text-2xl font-black tracking-tight text-fg mb-3">{title}</h3>
          <div className="text-muted/90 text-sm font-medium leading-relaxed">{message}</div>
        </div>
        <div className="p-6 pt-0 flex gap-3 justify-end bg-surface/50">
          <button className="px-5 py-2.5 rounded-xl text-sm font-bold text-muted hover:text-fg hover:bg-surface2 transition-all" onClick={onCancel} disabled={isLoading}>{cancelText}</button>
          <button className={`px-6 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all ${danger ? 'bg-danger hover:bg-danger/90 text-white' : 'bg-accent hover:bg-accent/90 text-white'}`} onClick={onConfirm} disabled={isLoading}>
            {isLoading ? '...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
