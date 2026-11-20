import { t } from './locale.ts';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; children: ReactNode;
}) {
  return <button type="button" title={label} aria-label={label} {...props} className={`icon-button ${className}`}>{children}</button>;
}

export function Modal({ title, description, onClose, children, wide = false }: {
  title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-content">
      <div className="modal-title">
        <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
        <IconButton label={t('关闭')} onClick={onClose}><X size={19} /></IconButton>
      </div>
      {children}
    </div>
  </dialog>;
}
