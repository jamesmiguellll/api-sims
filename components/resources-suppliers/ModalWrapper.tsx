"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalWrapperProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: string;
}

export default function ModalWrapper({
  open,
  title,
  onClose,
  children,
  size,
}: ModalWrapperProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
  }, [open]);

  if (!open || !mounted) return null;

  const maxWidthStyle =
    size === "max-w-7xl"
      ? "1380px"
      : size === "max-w-6xl"
      ? "1240px"
      : size === "max-w-5xl"
      ? "1050px"
      : size === "max-w-4xl"
      ? "950px"
      : size === "max-w-3xl"
      ? "800px"
      : size === "max-w-2xl"
      ? "672px"
      : size === "max-w-xl"
      ? "576px"
      : "900px";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={onClose}>
      <div
        style={{ width: "100%", maxWidth: maxWidthStyle }}
        className={`w-full max-h-[90vh] p-6 rounded-2xl border border-border bg-card flex flex-col shadow-2xl shrink-0 ${size || ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-foreground/60 hover:text-foreground hover:bg-muted p-1 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto pr-1">{children}</div>
      </div>
    </div>,
    document.body
  );
}
