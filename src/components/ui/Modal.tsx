"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };

/** dialog มาตรฐาน: กลางจอบนเดสก์ท็อป, เป็น bottom sheet บนมือถือ, Esc/คลิกพื้นหลังเพื่อปิด */
export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "w-full max-w-none bg-transparent p-0 text-slate-900",
        "m-0 mt-auto max-h-[92dvh] sm:m-auto sm:max-h-[88dvh]",
        SIZES[size],
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[88dvh] sm:rounded-2xl">
          <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-tight">{title}</h2>
              {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="-m-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
