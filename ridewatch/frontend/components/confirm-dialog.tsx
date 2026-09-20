"use client";
import { useEffect, useRef } from "react";
export default function ConfirmDialog({ title, description, confirm, cancel, onConfirm, onClose }: {
  title: string; description: string; confirm: string; cancel: string; onConfirm: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal(); cancelRef.current?.focus();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirmation-title" aria-describedby="confirmation-description" onCancel={e => { e.preventDefault(); onClose(); }} onKeyDown={e => {
    if (e.key !== "Tab") return;
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const first = buttons?.[0], last = buttons?.[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <h2 id="confirmation-title">{title}</h2><p id="confirmation-description" className="support">{description}</p>
    <div className="dialog-actions"><button ref={cancelRef} className="secondary" onClick={onClose}>{cancel}</button><button className="primary" onClick={onConfirm}>{confirm}</button></div>
  </dialog>;
}
