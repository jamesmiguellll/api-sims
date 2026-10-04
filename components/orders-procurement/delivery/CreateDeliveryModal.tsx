"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Upload, Check, Trash2, Search, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import ConfirmModal from "@/components/ConfirmModal";
import api from "@/lib/api";
import { PurchaseOrderPO } from "../types";

interface CreateDeliveryModalProps {
  open: boolean;
  initialPo?: PurchaseOrderPO | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface ItemRow {
  poItemId: number;
  itemId: number;
  itemName: string;
  itemCode: string;
  purchaseUomName: string;
  poOrderedQuantity: number;
  poTotalReceivedQuantity: number;
  alreadyScheduledQuantity: number;
  availableToSchedule: number;
  orderQuantity: number;
}

export function CreateDeliveryModal({
  open,
  initialPo,
  onClose,
  onSuccess,
}: CreateDeliveryModalProps) {
  const [deliveryNumber, setDeliveryNumber] = useState("DEL-2026-0001");
  const [orderedPOs, setOrderedPOs] = useState<PurchaseOrderPO[]>([]);
  const [selectedPoId, setSelectedPoId] = useState<number | null>(initialPo?.poId ?? null);
  const [pendingPoId, setPendingPoId] = useState<number | null>(null);
  const [confirmPoChange, setConfirmPoChange] = useState(false);
  const [confirmModal, setConfirmModal] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  const [loadingPOs, setLoadingPOs] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deliveryGrouping, setDeliveryGrouping] = useState<"grouped" | "per-batch">("grouped");
  const [batchReference, setBatchReference] = useState("");

  // Form Fields
  const [paymentType, setPaymentType] = useState("Payable");
  const [plannedDispatchDate, setPlannedDispatchDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [scheduledAttachmentBase64, setScheduledAttachmentBase64] = useState("");
  const [attachmentFileName, setAttachmentFileName] = useState("");

  // Items
  const [items, setItems] = useState<ItemRow[]>([]);

  const [existingDeliveries, setExistingDeliveries] = useState<any[]>([]);

  // Helper to calculate total declared quantity across all active (non-cancelled) deliveries for a PO item
  const getActiveScheduledForPoItem = (
    deliveriesList: any[],
    poId: number,
    poNumber?: string,
    poItemId?: number,
    itemId?: number
  ) => {
    let sum = 0;
    deliveriesList.forEach((d) => {
      const matchPo = (d.poId && d.poId === poId) || (poNumber && d.poNumber === poNumber);
      if (matchPo && d.status !== "Cancelled") {
        (d.items || []).forEach((di: any) => {
          const matchItem =
            (poItemId && di.poItemId && di.poItemId === poItemId) ||
            (itemId && di.itemId && di.itemId === itemId);
          if (matchItem) {
            sum += Number(di.declaredQuantity) || 0;
          }
        });
      }
    });
    return sum;
  };

  // Fetch Delivery sequence for unique delivery number preview & Approved/Ordered POs
  useEffect(() => {
    if (!open) return;

    const fetchInitialData = async () => {
      try {
        setLoadingPOs(true);
        const [delivRes, poRes] = await Promise.allSettled([
          api.get("/api/deliveries?page=1&pageSize=1000"),
          api.get("/api/purchase-orders?page=1&pageSize=1000&eligibleForDelivery=true"),
        ]);

        let deliveryList: any[] = [];
        // Calculate next unique Delivery Number & store deliveries
        if (delivRes.status === "fulfilled" && delivRes.value.data?.success) {
          deliveryList = delivRes.value.data.data?.items || delivRes.value.data.data || [];
          setExistingDeliveries(deliveryList);

          const year = new Date().getFullYear();
          let maxSeq = 0;
          deliveryList.forEach((d) => {
            if (d.deliveryNumber) {
              const match = d.deliveryNumber.match(/DEL-\d{4}-(\d+)/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSeq) maxSeq = num;
              }
            }
          });
          const nextSeq = String(maxSeq + 1).padStart(4, "0");
          setDeliveryNumber(`DEL-${year}-${nextSeq}`);
        }

        // Available POs (do NOT auto-select if initialPo is null)
        if (poRes.status === "fulfilled" && poRes.value.data?.success) {
          const raw: any[] = poRes.value.data.data?.items || poRes.value.data.data || [];
          const candidate = raw.filter(
            (p) => p.status === "Ordered" || p.status === "Approved"
          );

          const eligible: PurchaseOrderPO[] = [];
          await Promise.all(
            candidate.map(async (po) => {
              try {
                let poItems: any[] = [];
                const outRes = await api.get(`/api/deliveries/po/${po.poId}/outstanding`);
                if (outRes.data?.success && Array.isArray(outRes.data.data) && outRes.data.data.length > 0) {
                  poItems = outRes.data.data;
                } else if (po.items && po.items.length > 0) {
                  poItems = po.items;
                }

                const hasRemaining = poItems.some((item: any) => {
                  const ordered = Number(item.poOrderedQuantity ?? item.poItemQuantity ?? item.orderedQuantity) || 0;
                  const received = Number(item.poTotalReceivedQuantity ?? item.receivedQuantity) || 0;
                  const apiScheduled = Number(item.alreadyScheduledQuantity) || 0;
                  const delivScheduled = getActiveScheduledForPoItem(
                    deliveryList,
                    po.poId,
                    po.poNumber,
                    item.poItemId,
                    item.itemId
                  );
                  const inFlight = Math.max(apiScheduled, delivScheduled);
                  const remaining = ordered - received - inFlight;
                  return remaining > 0;
                });

                if (hasRemaining) {
                  eligible.push(po);
                }
              } catch {
                // If endpoint check fails, check local PO items
                const hasRemaining = (po.items || []).some((item: any) => {
                  const ordered = Number(item.poItemQuantity || item.orderedQuantity) || 0;
                  const received = Number(item.receivedQuantity) || 0;
                  const delivScheduled = getActiveScheduledForPoItem(
                    deliveryList,
                    po.poId,
                    po.poNumber,
                    item.poItemId,
                    item.itemId
                  );
                  return (ordered - received - delivScheduled) > 0;
                });
                if (hasRemaining) {
                  eligible.push(po);
                }
              }
            })
          );
          eligible.sort((a, b) => b.poId - a.poId);
          setOrderedPOs(eligible);
        }
      } catch (err) {
        console.error("Failed to load initial data for delivery modal:", err);
      } finally {
        setLoadingPOs(false);
      }
    };

    if (initialPo) {
      setSelectedPoId(initialPo.poId);
      if (initialPo.paymentType === "Paid" || initialPo.paymentType === "Payable") {
        setPaymentType(initialPo.paymentType);
      }
    } else {
      setSelectedPoId(null);
      setItems([]);
      setScheduledAttachmentBase64("");
      setAttachmentFileName("");
      setPaymentType("Payable");
      setError(null);
      setFieldErrors({});
      setDeliveryGrouping("grouped");
      setBatchReference("");
    }

    fetchInitialData();
  }, [open, initialPo]);

  // Current selected PO object
  const currentPO = useMemo(() => {
    if (!selectedPoId) return null;
    if (initialPo && initialPo.poId === selectedPoId) return initialPo;
    return orderedPOs.find((p) => p.poId === selectedPoId) || null;
  }, [initialPo, orderedPOs, selectedPoId]);

  // Sync payment type when PO changes
  useEffect(() => {
    if (currentPO?.paymentType === "Paid" || currentPO?.paymentType === "Payable") {
      setPaymentType(currentPO.paymentType);
    }
  }, [currentPO]);

  // Fetch PO items whenever selected PO changes
  useEffect(() => {
    if (!selectedPoId || !open) {
      setItems([]);
      return;
    }

    const fetchOutstanding = async () => {
      try {
        setLoadingItems(true);
        setError(null);
        const res = await api.get(`/api/deliveries/po/${selectedPoId}/outstanding`);
        if (res.data?.success && Array.isArray(res.data.data)) {
          const rows: ItemRow[] = res.data.data.map((i: any) => {
            const ordered = Number(i.poOrderedQuantity) || 0;
            const received = Number(i.poTotalReceivedQuantity) || 0;
            const apiScheduled = Number(i.alreadyScheduledQuantity) || 0;
            const delivScheduled = getActiveScheduledForPoItem(
              existingDeliveries,
              selectedPoId,
              currentPO?.poNumber,
              i.poItemId,
              i.itemId
            );
            const inFlight = Math.max(apiScheduled, delivScheduled);
            const available = Math.max(0, ordered - received - inFlight);
            return {
              poItemId: i.poItemId,
              itemId: i.itemId,
              itemName: i.itemName,
              itemCode: i.itemCode || "",
              purchaseUomName: i.purchaseUomName || "Unit",
              poOrderedQuantity: ordered,
              poTotalReceivedQuantity: received,
              alreadyScheduledQuantity: inFlight,
              availableToSchedule: available,
              orderQuantity: available,
            };
          });
          setItems(rows);
        } else if (currentPO?.items) {
          setItems(
            currentPO.items.map((i) => {
              const ordered = Number(i.poItemQuantity) || 0;
              const received = Number(i.receivedQuantity) || 0;
              const delivScheduled = getActiveScheduledForPoItem(
                existingDeliveries,
                selectedPoId,
                currentPO?.poNumber,
                i.poItemId,
                i.itemId
              );
              const inFlight = delivScheduled;
              const available = Math.max(0, ordered - received - inFlight);
              return {
                poItemId: i.poItemId || 0,
                itemId: i.itemId,
                itemName: i.itemName,
                itemCode: "",
                purchaseUomName: i.purchaseUomName || "Unit",
                poOrderedQuantity: ordered,
                poTotalReceivedQuantity: received,
                alreadyScheduledQuantity: inFlight,
                availableToSchedule: available,
                orderQuantity: available,
              };
            })
          );
        }
      } catch (err) {
        console.error("Failed to load PO items:", err);
        setError("Failed to load purchase order items.");
      } finally {
        setLoadingItems(false);
      }
    };

    fetchOutstanding();
  }, [selectedPoId, open, currentPO, existingDeliveries]);

  // Handle PO selection change with discard confirmation
  const handlePoSelectionChange = (newPoId: number | null) => {
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.poId;
      return copy;
    });
    if (selectedPoId && newPoId !== selectedPoId) {
      // Prompt confirmation to discard current PO details
      setPendingPoId(newPoId);
      setConfirmPoChange(true);
    } else {
      setSelectedPoId(newPoId);
    }
  };

  const applyPoChange = () => {
    setSelectedPoId(pendingPoId);
    setPendingPoId(null);
    setConfirmPoChange(false);
    setError(null);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.poId;
      return copy;
    });
  };

  const cancelPoChange = () => {
    setPendingPoId(null);
    setConfirmPoChange(false);
  };

  // Handle Order Quantity Input change
  const handleQuantityChange = (poItemId: number, value: string) => {
    const num = parseFloat(value);
    setItems((prev) =>
      prev.map((item) =>
        item.poItemId === poItemId
          ? {
              ...item,
              orderQuantity: isNaN(num) ? 0 : num,
            }
          : item
      )
    );
  };

  // Handle File Upload to Base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError("File exceeds 8MB limit.");
      return;
    }

    setAttachmentFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setScheduledAttachmentBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Validation
  const validationErrors = useMemo(() => {
    const errs: Record<number, string> = {};
    items.forEach((item) => {
      if (item.availableToSchedule > 0) {
        if (item.orderQuantity < 0) {
          errs[item.poItemId] = "Order quantity cannot be negative.";
        } else if (item.orderQuantity > item.availableToSchedule) {
          errs[item.poItemId] = `Cannot exceed available balance (${item.availableToSchedule} ${item.purchaseUomName}).`;
        }
      }
    });
    return errs;
  }, [items]);

  const hasAnyOrderQty = items.some(
    (i) => i.availableToSchedule > 0 && i.orderQuantity > 0 && i.orderQuantity <= i.availableToSchedule
  );
  const hasErrors = Object.keys(validationErrors).length > 0;

  // Form Submission
  const handleSubmit = async () => {
    setError(null);

    const errs: Record<string, string> = {};
    if (!selectedPoId) {
      errs.poId = "Purchase Order selection is required.";
    }
    if (deliveryGrouping === "per-batch" && !batchReference.trim()) {
      errs.batchReference = "Batch reference is required for per-batch delivery.";
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    if (items.length === 0) {
      setError("This Purchase Order has no items available for delivery.");
      return;
    }

    if (hasErrors || !hasAnyOrderQty) {
      setError("Please ensure order quantities are valid and do not exceed available balance.");
      return;
    }

    const itemsToSchedule = items
      .filter((i) => i.availableToSchedule > 0 && i.orderQuantity > 0)
      .map((i) => ({
        poItemId: i.poItemId,
        declaredQuantity: Number(i.orderQuantity),
      }));

    if (itemsToSchedule.length === 0) {
      setError("Please enter a shipment order quantity for at least one item.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        poId: selectedPoId,
        paymentType,
        scheduledDate: plannedDispatchDate ? new Date(plannedDispatchDate).toISOString() : new Date().toISOString(),
        expectedArrivalDate: null,
        scheduledAttachmentBase64: scheduledAttachmentBase64 || null,
        attachmentUrl: scheduledAttachmentBase64 || null,
        carrier: null,
        driverName: null,
        vehiclePlateNumber: null,
        isPerBatch: deliveryGrouping === "per-batch",
        batchReference: deliveryGrouping === "per-batch" ? batchReference.trim() : null,
        items: itemsToSchedule,
      };

      const res = await api.post("/api/deliveries", payload);
      if (res.data?.success) {
        onSuccess();
      } else {
        setError(res.data?.message || "Failed to schedule delivery order.");
      }
    } catch (err: any) {
      console.error("Failed to schedule delivery order:", err);
      setError(err?.response?.data?.message || "An unexpected error occurred while scheduling delivery.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <ModalWrapper
        open={open}
        title="Create Delivery Order"
        onClose={onClose}
        size="max-w-4xl"
      >
        <form onSubmit={(e) => { e.preventDefault(); setConfirmModal(true); }} className="space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Row 1: Delivery Number & Purchase Order Selector (2 Columns) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">
                Delivery Number
              </label>
              <Input
                type="text"
                readOnly
                value={deliveryNumber}
                className="w-full rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground cursor-not-allowed shadow-none focus-visible:ring-0 font-mono font-medium"
              />
            </div>

            <div>
              <label className={`mb-1.5 block text-xs font-semibold ${fieldErrors.poId ? "text-destructive" : "text-foreground"}`}>
                Purchase Order <span className="text-destructive">*</span>
              </label>
              {initialPo ? (
                <Input
                  type="text"
                  readOnly
                  value={initialPo.poNumber}
                  className="w-full rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm text-foreground cursor-not-allowed shadow-none focus-visible:ring-0 font-mono font-medium"
                />
              ) : (
                <>
                  <select
                    value={selectedPoId ?? ""}
                    onChange={(e) =>
                      handlePoSelectionChange(Number(e.target.value) || null)
                    }
                    disabled={loadingPOs}
                    className={`w-full rounded-xl border ${
                      fieldErrors.poId ? "!border-destructive focus:!ring-destructive" : "border-border"
                    } bg-card px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring`}
                  >
                    <option value="">Select Purchase Order...</option>
                    {orderedPOs.map((p) => (
                      <option key={p.poId} value={p.poId}>
                        {p.poNumber}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.poId && (
                    <p className="mt-1.5 text-xs font-medium text-destructive animate-in fade-in-50">
                      {fieldErrors.poId}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground">Delivery Grouping</label>
              <select
                value={deliveryGrouping}
                onChange={(e) => {
                  setDeliveryGrouping(e.target.value as "grouped" | "per-batch");
                  setFieldErrors((previous) => ({ ...previous, batchReference: "" }));
                }}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground"
              >
                <option value="grouped">Grouped Delivery</option>
                <option value="per-batch">Per Batch</option>
              </select>
            </div>
            {deliveryGrouping === "per-batch" && (
              <div>
                <label className={`mb-1.5 block text-xs font-semibold ${fieldErrors.batchReference ? "text-destructive" : "text-foreground"}`}>
                  Batch Reference <span className="text-destructive">*</span>
                </label>
                <Input
                  value={batchReference}
                  onChange={(e) => {
                    setBatchReference(e.target.value);
                    setFieldErrors((previous) => ({ ...previous, batchReference: "" }));
                  }}
                  placeholder="e.g. SUPPLIER-BATCH-2026-001"
                  className={fieldErrors.batchReference ? "!border-destructive focus-visible:!ring-destructive" : "border-border"}
                />
                {fieldErrors.batchReference && <p className="mt-1 text-xs font-medium text-destructive">{fieldErrors.batchReference}</p>}
              </div>
            )}
          </div>

          {/* If NO PO is selected, show instructional prompt */}
          {!selectedPoId ? (
            <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl bg-card">
              Please select a Purchase Order above to view items and configure delivery order.
            </div>
          ) : (
            <>
              {/* PO Details Summary Card */}
              {currentPO && (
                <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Supplier:</span>
                    <span className="font-semibold text-foreground">{currentPO.supplierName || "—"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Purchase Order Status / Date:</span>
                    <span className="font-medium text-foreground">
                      {currentPO.status} {currentPO.orderDate ? `• ${new Date(currentPO.orderDate).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Total Purchase Order Amount:</span>
                    <span className="font-semibold text-foreground">
                      {currentPO.totalAmount ? `₱${Number(currentPO.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                    </span>
                  </div>
                </div>
              )}

              {/* Table 1: PO Items Reference (Read-Only Reference) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-foreground">
                    Purchase Order Items Reference
                  </label>
                  <span className="text-[11px] text-muted-foreground">Read-only Purchase Order reference</span>
                </div>

                {loadingItems ? (
                  <div className="py-6 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card">
                    Loading purchase order items...
                  </div>
                ) : items.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card">
                    No items found for this purchase order.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-xs">
                          <th className="px-3 py-2.5 w-10 text-center">#</th>
                          <th className="px-3 py-2.5">Supply</th>
                          <th className="px-3 py-2.5">Supply No</th>
                          <th className="px-3 py-2.5">Unit of Measure</th>
                          <th className="px-3 py-2.5 text-right">Purchase Order Quantity</th>
                          <th className="px-3 py-2.5 text-right">Previously Received</th>
                          <th className="px-3 py-2.5 text-right">Already Scheduled</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-foreground">Available to Schedule</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((item, idx) => (
                          <tr key={`ref-${item.poItemId || idx}`} className="hover:bg-muted/20">
                            <td className="px-3 py-2.5 text-center text-muted-foreground font-mono">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-medium text-foreground">{item.itemName}</td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{item.itemCode || "—"}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">{item.purchaseUomName}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{item.poOrderedQuantity}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{item.poTotalReceivedQuantity}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{item.alreadyScheduledQuantity}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                              {item.availableToSchedule}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Table 2: Actual Order Quantity */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-xs font-semibold text-foreground">
                      Order Quantities <span className="text-destructive">*</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Specify quantity being ordered for this shipment
                    </span>
                  </div>
                  <div className="relative w-56">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search items..."
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="h-8 text-xs pl-8 rounded-lg border-border bg-card focus-visible:ring-1"
                    />
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-xs">
                          <th className="px-3.5 py-2.5">Ingredient / Supply</th>
                          <th className="px-3.5 py-2.5">Unit of Measure</th>
                          <th className="px-3.5 py-2.5 text-right">Purchase Order Quantity</th>
                          <th className="px-3.5 py-2.5 text-right font-medium">Left to Order</th>
                          <th className="px-3.5 py-2.5 text-right w-44 font-semibold text-foreground">Quantity to Order</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items
                          .filter((item) =>
                            !itemSearch ||
                            item.itemName.toLowerCase().includes(itemSearch.toLowerCase()) ||
                            item.itemCode.toLowerCase().includes(itemSearch.toLowerCase())
                          )
                          .map((item) => {
                          const isExhausted = item.availableToSchedule <= 0;
                          const err = validationErrors[item.poItemId];

                          return (
                            <tr
                              key={`order-${item.poItemId}`}
                              className={`hover:bg-muted/20 transition-colors ${
                                isExhausted ? "opacity-50 bg-muted/10" : ""
                              }`}
                            >
                              <td className="px-3.5 py-2.5 font-medium text-foreground">
                                {item.itemName}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground">
                                {item.purchaseUomName}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono text-muted-foreground">
                                {item.poOrderedQuantity}
                              </td>
                              <td className="px-3.5 py-2.5 text-right font-mono font-medium text-foreground">
                                {item.availableToSchedule}
                              </td>
                              <td className="px-3.5 py-2.5 text-right">
                                {isExhausted ? (
                                  <span className="text-[11px] text-muted-foreground italic">
                                    Fully Scheduled
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Input
                                        type="number"
                                        min="0.01"
                                        max={item.availableToSchedule}
                                        step="any"
                                        value={item.orderQuantity === 0 ? "" : item.orderQuantity}
                                        onChange={(e) =>
                                          handleQuantityChange(item.poItemId, e.target.value)
                                        }
                                        className={`w-28 text-right font-mono text-xs rounded-lg h-8 px-2 bg-card ${
                                          err
                                            ? "!border-destructive focus-visible:!ring-destructive"
                                            : "border-border"
                                        }`}
                                      />
                                      <span className="text-[11px] text-muted-foreground w-8 text-left truncate">
                                        {item.purchaseUomName}
                                      </span>
                                    </div>
                                    {err && (
                                      <p className="text-[10px] text-destructive text-right font-medium animate-in fade-in-50">
                                        {err}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Row 3: Payment Type, Planned Dispatch Date (Date only) (2 Columns) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Payment Type <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="Payable">Payable</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">
                    Planned Dispatch Date <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type="date"
                      min={new Date().toISOString().split("T")[0]}
                      value={plannedDispatchDate}
                      onChange={(e) => setPlannedDispatchDate(e.target.value)}
                      className="w-full rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm text-foreground cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Row 4: Proof of Receipt / Attachment (Required + Photo Preview) */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>
                    Proof of Receipt / Attachment <span className="text-destructive">*</span>
                  </span>
                  {!scheduledAttachmentBase64 && (
                    <span className="text-[11px] text-destructive font-normal">
                      Required to schedule delivery
                    </span>
                  )}
                </label>
                <div className="rounded-xl border border-dashed border-border bg-card p-4 transition-colors">
                  {scheduledAttachmentBase64 ? (
                    <div className="space-y-3">
                      <div className="relative flex flex-col items-center justify-center p-3 bg-muted/20 rounded-xl border border-border">
                        {scheduledAttachmentBase64.startsWith("data:image/") ? (
                          <img
                            src={scheduledAttachmentBase64}
                            alt="Proof of receipt"
                            className="max-h-56 rounded-lg object-contain border border-border shadow-xs"
                          />
                        ) : (
                          <div className="flex items-center gap-2.5 p-4 text-xs font-medium text-foreground">
                            <FileText className="w-8 h-8 text-muted-foreground shrink-0" />
                            <span className="truncate">{attachmentFileName || "Uploaded document"}</span>
                          </div>
                        )}
                        <p className="mt-2 text-[11px] font-mono text-muted-foreground truncate max-w-xs text-center">
                          {attachmentFileName}
                        </p>
                      </div>
                      <div className="flex justify-end gap-2">
                        <label className="cursor-pointer text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          Change File
                          <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setScheduledAttachmentBase64("");
                            setAttachmentFileName("");
                          }}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center cursor-pointer py-4 hover:bg-muted/30 rounded-xl transition-colors">
                      <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                      <span className="text-xs font-medium text-foreground">
                        Click to upload receipt or proof photo <span className="text-destructive">*</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground mt-0.5">
                        JPG, PNG, PDF up to 8MB
                      </span>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-5 pb-3 border-t border-border mt-6 mb-2">
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
              disabled={submitting || !selectedPoId || hasErrors || !hasAnyOrderQty || !scheduledAttachmentBase64.trim() || !plannedDispatchDate}
              className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? "Scheduling..." : "Schedule Order"}
            </Button>
          </div>
        </form>
      </ModalWrapper>

      {/* Discard Confirmation when changing selected PO */}
      {confirmPoChange && (
        <ConfirmModal
          message="Changing the Purchase Order will discard any entered delivery quantities and dates for the current Purchase Order. Do you wish to continue?"
          onConfirm={applyPoChange}
          onCancel={cancelPoChange}
        />
      )}

      {/* Review Modal for Submission */}
      {confirmModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            style={{ width: "100%", maxWidth: "672px" }}
            className="w-full rounded-2xl border border-border bg-card shadow-2xl p-6 flex flex-col shrink-0"
          >
            <h3 className="text-xl font-bold text-foreground">Review Delivery Schedule</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Please review the details below before scheduling this delivery.
            </p>

            <div className="space-y-4 text-sm text-foreground">
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border">
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Delivery No</span>
                  <span className="font-medium">{deliveryNumber}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Purchase Order</span>
                  <span className="font-medium">{currentPO?.poNumber || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Supplier</span>
                  <span className="font-medium">{currentPO?.supplierName || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Dispatch Date</span>
                  <span className="font-medium">{plannedDispatchDate || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Total Items</span>
                  <span className="font-medium">{items.filter(i => i.orderQuantity > 0).length}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setConfirmModal(false)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmModal(false);
                  handleSubmit();
                }}
                className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85"
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Confirm Schedule"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
