"use client";

import React, { useState } from "react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, PackageCheck, AlertCircle, Sparkles } from "lucide-react";
import { ProductionBatchEntity } from "./types";

interface BatchCompletionModalProps {
  open: boolean;
  onClose: () => void;
  batch: ProductionBatchEntity | null;
  onSuccess: () => void;
}

export default function BatchCompletionModal({
  open,
  onClose,
  batch,
  onSuccess,
}: BatchCompletionModalProps) {
  const [actualQuantity, setActualQuantity] = useState<number>(batch?.estimatedQuantity || 100);
  const [packagedBy, setPackagedBy] = useState<string>(batch?.assignedCook || "Head Cook");
  const [expiryDate, setExpiryDate] = useState<string>(() => {
    // Default 6 months from now
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  });
  const [scrapQuantity, setScrapQuantity] = useState<number>(0);
  const [scrapReason, setScrapReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!batch) return null;

  const yieldPercentage =
    batch.estimatedQuantity > 0 ? (actualQuantity / batch.estimatedQuantity) * 100 : 100;

  const fgLotCode = `FG-${batch.batchNumber}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actualQuantity <= 0) {
      toast.error("Actual output quantity must be greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${batch.batchId}/complete`, {
        finalQuantity: Number(actualQuantity),
        packagedBy,
        expiryDate,
        scrapQuantity: Number(scrapQuantity) || 0,
        scrapReason,
        notes,
      });

      if (res.data?.success) {
        toast.success(res.data.message || "Batch successfully completed and Finished Goods lot stocked in!");
        onSuccess();
        onClose();
      } else {
        toast.error(res.data?.message || "Failed to complete batch.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      open={open}
      title={`Complete Batch: ${batch.batchNumber}`}
      onClose={onClose}
      size="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Banner summary */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
          <PackageCheck className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <h4 className="font-semibold text-foreground text-sm">Packaging & Finished Goods Stock-In</h4>
            <p className="text-muted-foreground mt-0.5">
              Finalizing will record the output volume, automatically create Finished Goods Lot{" "}
              <span className="font-mono font-bold text-foreground">{fgLotCode}</span>, and credit the Main Finished Goods inventory.
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Actual Packaged Quantity</label>
            <Input
              type="number"
              min="0.1"
              step="any"
              value={actualQuantity}
              onChange={(e) => setActualQuantity(Number(e.target.value))}
              required
              className="h-10 text-xs font-mono font-bold rounded-xl border-border bg-card"
            />
            <span className="text-[11px] text-muted-foreground">
              Estimated: {batch.estimatedQuantity} {batch.yieldUom}
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Finished Goods Expiry Date</label>
            <Input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              required
              className="h-10 text-xs font-mono rounded-xl border-border bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Packaged By</label>
            <Input
              type="text"
              value={packagedBy}
              onChange={(e) => setPackagedBy(e.target.value)}
              required
              className="h-10 text-xs rounded-xl border-border bg-card"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Scrap / Trim Quantity (Optional)</label>
            <Input
              type="number"
              min="0"
              step="any"
              value={scrapQuantity || ""}
              onChange={(e) => setScrapQuantity(Number(e.target.value))}
              placeholder="0"
              className="h-10 text-xs font-mono rounded-xl border-border bg-card"
            />
          </div>
        </div>

        {scrapQuantity > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Scrap Reason</label>
            <Input
              type="text"
              value={scrapReason}
              onChange={(e) => setScrapReason(e.target.value)}
              placeholder="e.g. Cooking trim, container residue"
              className="h-10 text-xs rounded-xl border-border bg-card"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Batch Completion Notes</label>
          <Input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Standard consistency and aroma verified"
            className="h-10 text-xs rounded-xl border-border bg-card"
          />
        </div>

        {/* Calculated metrics */}
        <div className="grid grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-card text-center">
          <div>
            <span className="text-[11px] text-muted-foreground block">Yield Efficiency</span>
            <span
              className={`text-sm font-bold font-mono ${
                yieldPercentage >= 95 ? "text-emerald-500" : yieldPercentage < 80 ? "text-amber-500" : "text-foreground"
              }`}
            >
              {yieldPercentage.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">FG Lot Code</span>
            <span className="text-xs font-bold font-mono text-foreground truncate block">
              {fgLotCode}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Target Location</span>
            <span className="text-xs font-semibold text-foreground">Finished Goods</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold rounded-xl border-border hover:bg-muted"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            disabled={submitting}
            className="bg-foreground text-background font-semibold text-xs px-6 py-2 rounded-xl hover:bg-foreground/90 transition-colors shadow-sm"
          >
            {submitting ? "Finalizing..." : "Complete Batch & Stock In FG"}
          </Button>
        </div>
      </form>
    </ModalWrapper>
  );
}
