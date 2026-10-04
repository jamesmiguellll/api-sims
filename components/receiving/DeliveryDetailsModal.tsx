"use client";

import React, { useEffect, useState } from "react";
import { Truck, Package } from "lucide-react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { StatusBadge } from "@/components/shared/StatusBadge";
import api from "@/lib/api";
import { ArrivedDelivery } from "./types";

interface DeliveryDetailsModalProps {
  delivery: ArrivedDelivery | null;
  open: boolean;
  onClose: () => void;
  onCreateGrn: (deliveryId: number) => void;
}

interface DeliveryDetail {
  deliveryId: number;
  deliveryNumber: string;
  poNumber: string;
  prNumber?: string;
  supplierName: string;
  carrier?: string;
  trackingNumber?: string;
  status: string;
  estimatedArrival?: string;
  actualArrival?: string;
  items: {
    deliveryItemId: number;
    itemId: number;
    itemName: string;
    poItemId: number;
    declaredQuantity: number;
    purchaseUomName?: string;
    uomName?: string;
  }[];
}

export default function DeliveryDetailsModal({
  delivery,
  open,
  onClose,
  onCreateGrn,
}: DeliveryDetailsModalProps) {
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !delivery) return;
    setLoading(true);
    setError(null);
    api
      .get(`/api/deliveries/${delivery.deliveryId}`)
      .then(({ data }) => {
        setDetail(data?.data || null);
      })
      .catch(() => setError("Unable to load delivery details."))
      .finally(() => setLoading(false));
  }, [open, delivery]);

  if (!delivery) return null;

  return (
    <ModalWrapper
      open={open}
      title={`Delivery Details — ${delivery.deliveryNumber}`}
      onClose={onClose}
      size="max-w-4xl"
    >
      <div className="space-y-6 text-foreground">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
            Loading delivery details…
          </div>
        ) : detail ? (
          <>
            {/* Header Summary */}
            <div className="bg-muted/20 border border-border rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Delivery No.</div>
                <div className="text-sm font-mono font-semibold mt-0.5">{detail.deliveryNumber}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Purchase Order</div>
                <div className="text-sm font-mono font-semibold mt-0.5">{detail.poNumber}</div>
              </div>
              {detail.prNumber && (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Purchase Requisition Ref.</div>
                  <div className="text-sm font-mono font-semibold mt-0.5">{detail.prNumber}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Supplier</div>
                <div className="text-sm font-semibold mt-0.5 truncate" title={detail.supplierName}>{detail.supplierName}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</div>
                <div className="mt-1"><StatusBadge status={detail.status} /></div>
              </div>
            </div>

            {/* Secondary details */}
            {(detail.carrier || detail.trackingNumber || detail.estimatedArrival || detail.actualArrival) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                {detail.carrier && (
                  <div>
                    <div className="text-muted-foreground">Carrier / Truck</div>
                    <div className="font-medium mt-0.5">{detail.carrier}</div>
                  </div>
                )}
                {detail.trackingNumber && (
                  <div>
                    <div className="text-muted-foreground">Tracking No.</div>
                    <div className="font-mono font-medium mt-0.5">{detail.trackingNumber}</div>
                  </div>
                )}
                {detail.estimatedArrival && (
                  <div>
                    <div className="text-muted-foreground">Estimated Arrival</div>
                    <div className="font-medium mt-0.5">
                      {new Date(detail.estimatedArrival).toLocaleDateString()}
                    </div>
                  </div>
                )}
                {detail.actualArrival && (
                  <div>
                    <div className="text-muted-foreground">Actual Arrival</div>
                    <div className="font-medium mt-0.5">
                      {new Date(detail.actualArrival).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Line Items */}
            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Delivery Line Items
              </div>
              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 uppercase text-muted-foreground font-semibold tracking-wide border-b border-border">
                    <tr>
                      <th className="p-3">Item Name</th>
                      <th className="p-3 text-right">Declared Qty</th>
                      <th className="p-3">Unit of Measure</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(detail.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-muted-foreground">
                          No line items found for this delivery.
                        </td>
                      </tr>
                    ) : (
                      detail.items.map((item) => (
                        <tr key={item.deliveryItemId} className="hover:bg-muted/30">
                          <td className="p-3 font-medium text-foreground">{item.itemName}</td>
                          <td className="p-3 text-right font-mono font-semibold text-foreground">
                            {item.declaredQuantity.toLocaleString()}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {item.purchaseUomName || item.uomName || "Unit"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Close
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onClose();
              onCreateGrn(delivery.deliveryId);
            }}
            className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Goods Receipt Note for this Delivery
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
