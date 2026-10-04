"use client";

import React, { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import api from "@/lib/api";
import { Delivery } from "../types";

interface CancelDeliveryModalProps {
  delivery: Delivery | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelDeliveryModal({
  delivery,
  onClose,
  onSuccess,
}: CancelDeliveryModalProps) {
  if (!delivery) return null;

  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (delivery.status === "Arrived") {
      setError("An arrived delivery cannot be cancelled as it has already reached the facility.");
      return;
    }

    if (!reason.trim()) {
      setError("Please provide a cancellation reason before confirming.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await api.put(
        `/api/deliveries/${delivery.deliveryId}/cancel`,
        { reason: reason.trim() }
      );

      if (res.data?.success) {
        onSuccess();
      } else {
        setError(res.data?.message || "Failed to cancel delivery.");
      }
    } catch (err: any) {
      console.error("Cancel error:", err);
      setError(
        err?.response?.data?.message ||
          "An unexpected error occurred while cancelling the delivery."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      open={!!delivery}
      title={`Cancel Delivery Order — ${delivery.deliveryNumber}`}
      onClose={onClose}
      size="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        <div className="p-3.5 rounded-xl bg-muted/20 border border-border text-xs text-foreground space-y-1">
          <p className="font-semibold text-foreground">
            Are you sure you want to cancel delivery order {delivery.deliveryNumber}?
          </p>
          <p className="text-muted-foreground text-[11px]">
            Cancelling will release the declared items back to the Purchase Order available balance, allowing them to be scheduled in a subsequent order.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">
            Cancellation Reason <span className="text-destructive">*</span>
          </label>
          <Textarea
            rows={3}
            placeholder="Please enter the reason for cancellation (e.g., supplier vehicle breakdown, date rescheduled)..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Close
          </Button>
          <Button
            type="submit"
            disabled={submitting || !reason.trim()}
            className="rounded-xl bg-destructive text-destructive-foreground px-5 py-2.5 text-sm font-semibold hover:bg-destructive/90 transition-colors shadow-sm disabled:opacity-50"
          >
            {submitting ? "Cancelling..." : "Confirm Cancellation"}
          </Button>
        </div>
      </form>
    </ModalWrapper>
  );
}
