"use client";

import React, { useState } from "react";
import { AlertCircle, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Delivery } from "../types";
import CreateGrnModal from "@/components/receiving/CreateGrnModal";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface DeliveryDetailsModalProps {
  delivery: Delivery | null;
  isAdmin?: boolean;
  onClose: () => void;
  onArrive?: (delivery: Delivery) => void;
  onCancel?: (delivery: Delivery) => void;
  onGrnCreated?: () => void;
}

export function DeliveryDetailsModal({
  delivery,
  isAdmin = false,
  onClose,
  onArrive,
  onCancel,
  onGrnCreated,
}: DeliveryDetailsModalProps) {
  const [showCreateGrnModal, setShowCreateGrnModal] = useState(false);

  if (!delivery) return null;

  const fmtDate = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const isScheduled = delivery.status === "Scheduled";
  const isInTransit = delivery.status === "In Transit";
  const isArrived = delivery.status === "Arrived";
  const isCancelled = delivery.status === "Cancelled";
  const isCancellable = isScheduled || isInTransit;

  const steps = ["Scheduled", "Arrived", "Received (GRN)"];
  const currentStepIdx = isCancelled ? -1 : delivery.grnNumber ? 2 : isArrived ? 1 : 0;

  return (
    <ModalWrapper
      open={!!delivery}
      title={`Delivery Order Details — ${delivery.deliveryNumber}`}
      onClose={onClose}
      size="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Top Header Row with Status Badge & Document No */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <StatusBadge status={delivery.status} />
            <span className="font-mono text-sm font-bold text-foreground">{delivery.deliveryNumber}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Purchase Order Reference: <span className="font-mono font-medium text-foreground">{delivery.poNumber}</span>
          </div>
        </div>

        {delivery.isPerBatch && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
            <span className="font-semibold text-foreground">Per-batch delivery:</span>{" "}
            <span className="font-mono text-muted-foreground">{delivery.batchReference}</span>
          </div>
        )}

        {/* Visual Stepper */}
        {!isCancelled && (
          <div className="py-2">
            <div className="flex items-center justify-between relative">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-foreground transition-all duration-500 ease-in-out"
                  style={{ width: `${(currentStepIdx / (steps.length - 1)) * 100}%` }}
                />
              </div>
              {steps.map((s, i) => {
                const isActive = i <= currentStepIdx;
                const isLast = i === currentStepIdx;
                return (
                  <div key={s} className="relative flex flex-col items-center gap-2 bg-background px-2">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold transition-all duration-500 z-10 ${
                        isActive
                          ? "bg-foreground border-foreground text-background shadow-md scale-110"
                          : "bg-background border-muted text-muted-foreground"
                      }`}
                    >
                      {isActive && !isLast ? <Check className="w-4 h-4" /> : (i + 1)}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider font-bold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Cancellation Reason Notice */}
        {isCancelled && delivery.notes && (
          <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Order Cancelled</span>
              <span className="text-foreground text-[11px]">{delivery.notes}</span>
            </div>
          </div>
        )}

        {/* Delivery Information Card */}
        <div className="rounded-2xl border border-border bg-muted/20 p-5 space-y-4">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Delivery Summary
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground block text-[11px] mb-1">Purchase Order</span>
              <span className="font-mono font-semibold text-foreground">{delivery.poNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] mb-1">Supplier</span>
              <span className="font-semibold text-foreground truncate block">{delivery.supplierName || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] mb-1">Payment Terms</span>
              <span className="font-medium text-foreground">{delivery.paymentType || "Payable"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] mb-1">Destination</span>
              <span className="font-medium text-foreground">Commissary (Receiving Bay)</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] mb-1">Scheduled Date</span>
              <span className="font-medium text-foreground">{fmtDate(delivery.scheduledDate)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px] mb-1">Actual Arrival Date</span>
              <span className="font-medium text-foreground">{fmtDate(delivery.actualArrivalDate)}</span>
            </div>
            {delivery.receivedBy && (
              <div>
                <span className="text-muted-foreground block text-[11px] mb-1">Received By</span>
                <span className="font-medium text-foreground">{delivery.receivedBy}</span>
              </div>
            )}
            {delivery.grnNumber && (
              <div>
                <span className="text-muted-foreground block text-[11px] mb-1">Goods Receipt Note</span>
                <span className="font-mono font-semibold text-foreground">{delivery.grnNumber}</span>
              </div>
            )}
          </div>
        </div>

        {/* Document Proofs - Visible directly inline without needing to click */}
        {(delivery.scheduledAttachment || delivery.arrivalAttachment || delivery.attachmentUrl) && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Document Proofs &amp; Attachments
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(delivery.scheduledAttachment || delivery.attachmentUrl) && (
                <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Receipt Proof</span>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden bg-background flex items-center justify-center p-2 min-h-[140px] max-h-56">
                    {(delivery.scheduledAttachment || delivery.attachmentUrl)!.startsWith("data:image/") ||
                    (delivery.scheduledAttachment || delivery.attachmentUrl)!.match(/\.(jpeg|jpg|png|webp)($|\?)/i) ? (
                      <img
                        src={delivery.scheduledAttachment || delivery.attachmentUrl || ""}
                        alt="Receipt Proof"
                        className="max-h-48 max-w-full rounded-md object-contain"
                      />
                    ) : (
                      <iframe
                        src={delivery.scheduledAttachment || delivery.attachmentUrl || ""}
                        title="Receipt Proof"
                        className="w-full h-44 rounded-md border-0"
                      />
                    )}
                  </div>
                </div>
              )}
              {delivery.arrivalAttachment && (
                <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Arrival Proof</span>
                  </div>
                  <div className="rounded-lg border border-border overflow-hidden bg-background flex items-center justify-center p-2 min-h-[140px] max-h-56">
                    {delivery.arrivalAttachment.startsWith("data:image/") ||
                    delivery.arrivalAttachment.match(/\.(jpeg|jpg|png|webp)($|\?)/i) ? (
                      <img
                        src={delivery.arrivalAttachment}
                        alt="Arrival Proof"
                        className="max-h-48 max-w-full rounded-md object-contain"
                      />
                    ) : (
                      <iframe
                        src={delivery.arrivalAttachment}
                        title="Arrival Proof"
                        className="w-full h-44 rounded-md border-0"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Items ({delivery.items?.length || 0})
            </h4>
            <span className="text-xs font-mono font-medium text-muted-foreground">
              Total: {delivery.items?.reduce((sum, it) => sum + (Number(it.declaredQuantity) || 0), 0) || 0}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-xs">
                  <th className="px-3.5 py-2.5">Item Description</th>
                  <th className="px-3.5 py-2.5">Supply No</th>
                  <th className="px-3.5 py-2.5">Unit of Measure</th>
                  <th className="px-3.5 py-2.5 text-right">Purchase Order Qty</th>
                  <th className="px-3.5 py-2.5 text-right">Shipment Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(delivery.items || []).map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/10">
                    <td className="px-3.5 py-2.5 font-medium text-foreground">
                      {item.itemName}
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-muted-foreground">
                      {item.itemCode || "—"}
                    </td>
                    <td className="px-3.5 py-2.5 text-muted-foreground">{item.purchaseUomName}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono text-muted-foreground">{item.poOrderedQuantity}</td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-foreground">{item.declaredQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Actions (Clean uniform buttons, NO icons, NO duplicate cancel) */}
        <div className="flex items-center justify-end gap-3 pt-5 pb-3 border-t border-border mt-6 mb-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Close
          </Button>

          {!isAdmin && isCancellable && onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose();
                onCancel(delivery);
              }}
              className="rounded-xl border border-destructive/40 text-destructive hover:bg-destructive/10 px-5 py-2.5 text-sm font-semibold transition-colors cursor-pointer"
            >
              Cancel Delivery
            </Button>
          )}

          {!isAdmin && (isScheduled || isInTransit) && onArrive && (
            <Button
              type="button"
              onClick={() => {
                onClose();
                onArrive(delivery);
              }}
              className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm cursor-pointer"
            >
              Confirm Arrival
            </Button>
          )}

          {!isAdmin && isArrived && !delivery.grnNumber && (
            <Button
              type="button"
              onClick={() => {
                setShowCreateGrnModal(true);
              }}
              className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm cursor-pointer"
            >
              Create Goods Receipt Note
            </Button>
          )}
        </div>
      </div>

      {showCreateGrnModal && (
        <CreateGrnModal
          open={showCreateGrnModal}
          initialDeliveryId={delivery.deliveryId}
          onClose={() => setShowCreateGrnModal(false)}
          onSuccess={() => {
            setShowCreateGrnModal(false);
            onClose();
            onGrnCreated?.();
          }}
        />
      )}
    </ModalWrapper>
  );
}
