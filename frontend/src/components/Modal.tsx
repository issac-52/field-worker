import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const headingId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current
      ?.querySelector<HTMLElement>('input:not([disabled]), textarea, select, button')
      ?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !busy) onClose();
          if (e.key !== 'Tab') return;
          const focusable = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]):not([hidden]), textarea:not([disabled]), select:not([disabled]), a[href]',
            ) ?? [],
          );
          const first = focusable[0],
            last = focusable.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="modal-heading">
          <h2 id={headingId}>{title}</h2>
          <button
            type="button"
            className="close-btn"
            aria-label="닫기"
            disabled={busy}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
