"use client";

import React, { useEffect } from "react";

// ─── Dialog ───────────────────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full flex items-center justify-center pointer-events-none">
        <div className="pointer-events-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── DialogContent ────────────────────────────────────────────────────────────

export function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative mx-auto rounded-xl border border-zinc-800 shadow-2xl ${className ?? ""}`}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {children}
    </div>
  );
}

// ─── DialogHeader ─────────────────────────────────────────────────────────────

export function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className ?? ""} {...props}>
      {children}
    </div>
  );
}

// ─── DialogTitle ──────────────────────────────────────────────────────────────

export function DialogTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={`text-lg font-semibold ${className ?? ""}`} {...props}>
      {children}
    </h2>
  );
}
