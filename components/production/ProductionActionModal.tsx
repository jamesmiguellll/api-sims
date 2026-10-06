"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ProductionActionType = "approve" | "reject";

interface ProductionActionModalProps {
  open: boolean;
  actionType: ProductionActionType;
  reqNumber: string;
  onConfirm: (notes?: string) => Promise<void> | void;
  onClose: () => void;
}

export function ProductionActionModal({
  open,
  actionType,
  reqNumber,
  onConfirm,
  onClose,
}: ProductionActionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(false);
      setLoading(false);
    }
  }, [open]);

  if (!mounted || !open) return null;

  const isReject = actionType === "reject";

  const getTitle = () => {
    return isReject ? "Reject Production Request" : "Approve Production Request";
  };

  const getDescription = () => {
    return isReject
      ? `Please provide a reason for rejecting production request ${reqNumber}. The request will be marked as Rejected and any reserved material lots will be released.`
      : `Are you sure you want to approve production request ${reqNumber}? This will mark it as Approved and authorize material issuance for inventory staging.`;
  };

  const handleConfirm = async () => {
    if (isReject && !reason.trim()) {
      setError(true);
      return;
    }
    setError(false);
    setLoading(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
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
            <AlertTriangle className="w-6 h-6 text-foreground" />
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-foreground mb-1">
            {getTitle()}
          </h2>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-4">
            {getDescription()}
          </p>

          {/* Reason Textarea (Required for Reject) */}
          {isReject && (
            <div className="w-full text-left mb-4">
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Rejection Reason <span className="text-destructive">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error && e.target.value.trim()) setError(false);
                }}
                placeholder="State the reason why this production request is being rejected..."
                rows={3}
                className={`w-full text-xs p-3 rounded-xl border bg-card text-foreground focus:outline-none transition-colors ${
                  error
                    ? "border-destructive focus:ring-1 focus:ring-destructive"
                    : "border-border focus:ring-1 focus:ring-foreground"
                }`}
              />
              {error && (
                <p className="text-xs text-destructive mt-1 font-medium">
                  A rejection reason is required before confirming.
                </p>
              )}
            </div>
          )}

          {/* Action Buttons matching PR / PO confirmation */}
          <div className="flex justify-center gap-3 w-full pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-5 py-2.5 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex-1 px-5 py-2.5 text-sm font-semibold text-background bg-foreground hover:bg-foreground/85 rounded-xl transition-colors shadow-sm cursor-pointer"
            >
              {loading ? "Confirming..." : isReject ? "Confirm Rejection" : "Confirm Approval"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
