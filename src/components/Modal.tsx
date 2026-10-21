import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function Modal({
  children,
  onClose,
  title,
  className,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      el.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-body">
        <button className="icon-button modal-close" aria-label="Fermer" onClick={onClose}>
          <X size={22} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
