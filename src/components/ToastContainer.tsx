import React from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item ${t.type}`}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '13.5px' }}>{t.title}</div>
            {t.message && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '12.5px', marginTop: '2px' }}>
                {t.message}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px',
            }}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
};
