"use client";

import React from "react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import Link from "next/link";

interface PrSummaryModalProps {
  open: boolean;
  onClose: () => void;
  prData: {
    prId: number;
    prNumber: string;
    status: string;
    estimatedTotal: number;
    items: Array<{
      itemId: number;
      itemName: string;
      requestedQuantity: number;
      estimatedUnitPrice: number;
    }>;
  } | null;
}

export default function PrSummaryModal({ open, onClose, prData }: PrSummaryModalProps) {
  if (!prData) return null;

  return (
    <ModalWrapper open={open} title="Purchase Requisition Summary" onClose={onClose} size="max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-start gap-4 p-4 rounded-xl bg-muted/40 border border-border">
          <CheckCircle2 className="w-6 h-6 text-foreground shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-sm">
              Purchase Requisition Successfully Generated
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              An automated requisition was created to replenish the material shortfalls required for this production batch.
            </p>
          </div>
          <StatusBadge status={prData.status} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 rounded-xl border border-border bg-card">
          <div>
            <span className="text-xs text-muted-foreground block font-medium">Requisition No.</span>
            <span className="text-sm font-bold text-foreground font-mono">{prData.prNumber}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block font-medium">Department</span>
            <span className="text-sm font-semibold text-foreground">Production</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block font-medium">Estimated Total</span>
            <span className="text-sm font-bold text-foreground font-mono">
              PHP {prData.estimatedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
            Requisitioned Shortfall Items ({prData.items.length})
          </h4>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="py-2.5 px-4 font-semibold text-muted-foreground">Item Name</th>
                  <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Requested Qty</th>
                  <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Est. Unit Price</th>
                  <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {prData.items.map((item, idx) => {
                  const subtotal = item.requestedQuantity * item.estimatedUnitPrice;
                  return (
                    <tr key={idx} className="hover:bg-muted/10">
                      <td className="py-3 px-4 font-medium text-foreground">{item.itemName}</td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-foreground">
                        {item.requestedQuantity}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                        PHP {item.estimatedUnitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                        PHP {subtotal.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Link
            href="/purchase-requisitions"
            className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:underline"
          >
            <span>View All Requisitions</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Button
            type="button"
            onClick={onClose}
            className="bg-foreground text-background font-semibold text-xs px-5 py-2 rounded-xl hover:bg-foreground/90 transition-colors"
          >
            Done
          </Button>
        </div>
      </div>
    </ModalWrapper>
  );
}
