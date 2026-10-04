"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export type POActionType = "approve" | "reject" | "return" | "cancel" | "order";

interface POActionModalProps {
  actionType: POActionType;
  poNumber: string;
  onConfirm: (notes?: string) => Promise<void> | void;
  onClose: () => void;
}

const ACTION_CONFIG: Record<
  POActionType,
  {
    title: string;
    icon: React.ReactNode;
    description: string;
    requiresNotes: boolean;
    notesLabel: string;
    notesPlaceholder: string;
    confirmLabel: string;
    confirmClass: string;
  }
> = {
  approve: {
    title: "Approve Purchase Order",
    icon: <CheckCircle2 className="w-5 h-5 text-foreground" />,
    description: "Approving this Purchase Order will move it to Approved status. The requester can then mark it as Ordered.",
    requiresNotes: false,
    notesLabel: "",
    notesPlaceholder: "",
    confirmLabel: "Approve",
    confirmClass: "bg-foreground text-background hover:bg-foreground/85",
  },
  reject: {
    title: "Reject Purchase Order",
    icon: <XCircle className="w-5 h-5 text-foreground" />,
    description: "Rejecting this Purchase Order will close it. Please provide a reason.",
    requiresNotes: true,
    notesLabel: "Rejection Reason",
    notesPlaceholder: "State the reason for rejection (required)...",
    confirmLabel: "Reject",
    confirmClass: "bg-foreground text-background hover:bg-foreground/85",
  },
  return: {
    title: "Return for Revision",
    icon: <RotateCcw className="w-5 h-5 text-foreground" />,
    description: "Returning this Purchase Order will allow the requester to revise and resubmit. Please provide your notes.",
    requiresNotes: true,
    notesLabel: "Revision Notes",
    notesPlaceholder: "Describe what needs to be revised (required)...",
    confirmLabel: "Return for Revision",
    confirmClass: "bg-foreground text-background hover:bg-foreground/85",
  },
  cancel: {
    title: "Cancel Purchase Order",
    icon: <AlertCircle className="w-5 h-5 text-foreground shrink-0" />,
    description: "Are you sure you want to cancel this Purchase Order? This action cannot be undone. This Purchase Order number will be permanently marked as cancelled and cannot be reused.",
    requiresNotes: true,
    notesLabel: "Cancellation Reason & Notes",
    notesPlaceholder: "Please provide the reason for cancelling this purchase order (required)...",
    confirmLabel: "Confirm Cancellation",
    confirmClass: "bg-foreground text-background hover:bg-foreground/85",
  },
  order: {
    title: "Mark as Ordered",
    icon: <ShoppingBag className="w-5 h-5 text-foreground" />,
    description: "Marking as Ordered sends the Purchase Order to the supplier through the configured Gmail account, then changes the status to Ordered.",
    requiresNotes: false,
    notesLabel: "",
    notesPlaceholder: "",
    confirmLabel: "Mark as Ordered",
    confirmClass: "bg-foreground text-background hover:bg-foreground/85",
  },
};

export function POActionModal({ actionType, poNumber, onClose, onConfirm }: POActionModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const requiresReason = actionType === "reject" || actionType === "return" || actionType === "cancel";

  const getTitle = () => {
    switch (actionType) {
      case "approve":
        return "Approve Purchase Order";
      case "reject":
        return "Reject Purchase Order";
      case "return":
        return "Return for Revision";
      case "cancel":
        return "Cancel Purchase Order";
      case "order":
        return "Mark as Ordered";
    }
  };

  const getDescription = () => {
    switch (actionType) {
      case "approve":
        return `Are you sure you want to approve purchase order ${poNumber}? This will mark it as Approved and allow delivery shipments to be scheduled.`;
      case "reject":
        return `Please provide a reason for rejecting purchase order ${poNumber}. The purchase order will be closed and marked as Rejected.`;
      case "return":
        return `Please provide instructions or reasons for returning purchase order ${poNumber}. The requester will be able to revise and re-submit it.`;
      case "cancel":
        return `Are you sure you want to cancel purchase order ${poNumber}? This action cannot be undone.`;
      case "order":
        return `Mark purchase order ${poNumber} as ordered and send it to the supplier?`;
    }
  };

  const handleConfirm = async () => {
    if (requiresReason && !reason.trim()) {
      setError(true);
      return;
    }
    setError(false);
    setLoading(true);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: "440px" }}
        className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col p-6 text-foreground shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center justify-center text-center">
          {/* Circular Alert Icon */}
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 text-foreground">
            <AlertTriangle className="w-6 h-6" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-foreground mb-1">
            {getTitle()}
          </h2>

          {/* PO Number / ID Subtitle */}
          <p className="text-xs font-mono font-semibold text-muted-foreground mb-3">
            Purchase Order No: {poNumber}
          </p>

          {/* Message / Description */}
          <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
            {getDescription()}
          </p>

          {/* Reason / Notes Input */}
          {requiresReason && (
            <div className="w-full text-left space-y-1.5 mb-5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                Reason / Feedback Notes <span className="text-destructive">*</span>
              </label>
              <Textarea
                rows={3}
                placeholder={
                  actionType === "reject"
                    ? "Explain why this purchase order is rejected (required)..."
                    : actionType === "return"
                    ? "Specify adjustments or items needed for revision (required)..."
                    : "Please state the reason for cancellation (required)..."
                }
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim()) setError(false);
                }}
                className={`text-xs resize-none bg-background rounded-xl p-3 ${
                  error ? "border-destructive focus-visible:ring-destructive" : "border-border"
                }`}
              />
              {error && (
                <p className="text-[11px] text-destructive flex items-center gap-1 mt-1 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Reason is required for this action.
                </p>
              )}
            </div>
          )}

          {/* Uniform Action Buttons */}
          <div className="flex justify-center gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-5 py-2.5 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || (requiresReason && !reason.trim())}
              className="flex-1 px-5 py-2.5 text-sm font-semibold text-background bg-foreground hover:bg-foreground/85 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? "Processing..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
