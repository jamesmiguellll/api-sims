"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  ChevronLeft,
  Search,
  Users,
  ClipboardList,
  Loader2,
  CheckCircle2,
  CalendarIcon,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import api from "@/lib/api";
import { PurchaseRequisition, PurchaseOrderPO } from "../types";
import { useAuth } from "@/context/AuthContext";

interface ItemRow {
  itemId: number;
  itemName: string;
  uomName: string;
  purchaseUomId: number;
  /** How many have ALREADY been ordered across all existing POs for this PR */
  alreadyOrdered: number;
  /** PR's original requested qty */
  requestedQty: number;
  /** Remaining available to order = requestedQty - alreadyOrdered */
  remaining: number;
  // editable
  orderQty: string;
  /** Supplier catalog price; read-only and system generated. */
  unitPrice: number;
}

interface CreatePOModalProps {
  open: boolean;
  initialPrId?: number;
  initialPo?: PurchaseOrderPO | null;
  isEdit?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(n);

export function CreatePOModal({ open, initialPrId, initialPo, isEdit = false, onClose, onSuccess }: CreatePOModalProps) {
  const { user } = useAuth();

  const [step, setStep] = useState(1);

  // Step 1
  const [approvedPRs, setApprovedPRs] = useState<PurchaseRequisition[]>([]);
  const [prSearch, setPrSearch] = useState("");
  const [selectedPR, setSelectedPR] = useState<PurchaseRequisition | null>(null);
  const [loadingPRs, setLoadingPRs] = useState(false);

  // Step 2
  const [eligibleSuppliers, setEligibleSuppliers] = useState<{ supplierId: number; supplierName: string }[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Step 3
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [notes, setNotes] = useState("");
  const [nextPoNumber, setNextPoNumber] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [itemSearch, setItemSearch] = useState("");
  const [confirmModal, setConfirmModal] = useState<"Draft" | "Pending Approval" | null>(null);
  const [eta, setEta] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0]);

  useEffect(() => {
    if (open) {
      if (isEdit && initialPo) {
        setStep(3);
        setNextPoNumber(initialPo.poNumber);
        setSelectedSupplierId(initialPo.supplierId);
        setEligibleSuppliers([{ supplierId: initialPo.supplierId, supplierName: initialPo.supplierName }]);
        if (initialPo.prId) {
          setSelectedPR({
            prId: initialPo.prId,
            prNumber: initialPo.prNumber || `PR-${initialPo.prId}`,
            requestedBy: initialPo.requestedBy,
            items: [],
          } as any);
        } else {
          setSelectedPR(null);
        }
        setItemRows(
          (initialPo.items || []).map((it: any) => ({
            itemId: it.itemId,
            itemName: it.itemName,
            uomName: it.purchaseUomName || "pcs",
            purchaseUomId: it.purchaseUomId || 0,
            alreadyOrdered: 0,
            requestedQty: it.poItemQuantity,
            remaining: it.poItemQuantity,
            orderQty: String(it.poItemQuantity),
            unitPrice: Number(it.totalPrice || it.lineTotal || 0) / Math.max(1, Number(it.poItemQuantity)),
          }))
        );
        setNotes("");
        setErrors({});
        setItemSearch("");
        setConfirmModal(null);
      } else {
        setStep(1);
        setPrSearch("");
        setSelectedPR(null);
        setSelectedSupplierId(null);
        setItemRows([]);
        setNotes("");
        setErrors({});
        setItemSearch("");
        setConfirmModal(null);
        fetchApprovedPRs();
        fetchNextPoNumber();
      }
    }
  }, [open, isEdit, initialPo]);

  useEffect(() => {
    if (!isEdit && initialPrId && approvedPRs.length > 0) {
      const pr = approvedPRs.find((p) => p.prId === initialPrId);
      if (pr) {
        setSelectedPR(pr);
        fetchEligibleSuppliers(pr);
        setStep(2);
      }
    }
  }, [initialPrId, approvedPRs, isEdit]);

  const fetchApprovedPRs = async () => {
    setLoadingPRs(true);
    try {
      const res = await api.get("/api/purchase-requisitions?status=Approved");
      if (res.data?.success) {
        const prs: PurchaseRequisition[] = res.data.data || [];
        const eligible: PurchaseRequisition[] = [];
        await Promise.all(
          prs.map(async (pr) => {
            try {
              const ordRes = await api.get(`/api/purchase-orders/pr/${pr.prId}/ordered-qty`);
              const orderedMap: Record<number, number> = {};
              if (ordRes.data?.success && Array.isArray(ordRes.data.data)) {
                ordRes.data.data.forEach((o: any) => {
                  orderedMap[o.itemId] = Number(o.orderedQty) || 0;
                });
              }
              const hasRemaining = (pr.items || []).some((item) => {
                const ordered = orderedMap[item.itemId] || 0;
                return item.requestedQuantity > ordered;
              });
              if (hasRemaining) {
                eligible.push(pr);
              }
            } catch {
              eligible.push(pr);
            }
          })
        );
        eligible.sort((a, b) => b.prId - a.prId);
        setApprovedPRs(eligible);
      }
    } catch (e) {
      console.error("Failed to fetch PRs:", e);
    } finally {
      setLoadingPRs(false);
    }
  };

  const fetchNextPoNumber = async () => {
    try {
      const res = await api.get("/api/purchase-orders/next-number");
      if (res.data?.success && res.data.data) {
        setNextPoNumber(res.data.data);
      }
    } catch (e) {
      console.error("Failed to fetch next PO number preview:", e);
    }
  };

  const fetchEligibleSuppliers = async (pr: PurchaseRequisition) => {
    setLoadingSuppliers(true);
    setEligibleSuppliers([]);
    try {
      const itemIds = pr.items.map((i) => i.itemId);
      const supplierMap: Map<number, { supplierId: number; supplierName: string }> = new Map();
      await Promise.all(
        itemIds.map(async (itemId) => {
          try {
            const res = await api.get(`/api/supplier-items/by-item/${itemId}`);
            if (res.data?.success) {
              (res.data.data || []).forEach((s: any) => {
                if (!supplierMap.has(s.supplierId)) {
                  supplierMap.set(s.supplierId, { supplierId: s.supplierId, supplierName: s.supplierName });
                }
              });
            }
          } catch {}
        })
      );
      setEligibleSuppliers(Array.from(supplierMap.values()));
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const fetchItemsForSupplier = async (supplierId: number, pr: PurchaseRequisition) => {
    setLoadingItems(true);
    try {
      // Fetch supplier catalog and already-ordered quantities in parallel
      const [catalogRes, orderedRes] = await Promise.all([
        api.get(`/api/supplier-items/by-supplier/${supplierId}`),
        api.get(`/api/purchase-orders/pr/${pr.prId}/ordered-qty`),
      ]);

      const catalog: any[] = catalogRes.data?.success ? catalogRes.data.data || [] : [];
      const orderedMap: Record<number, number> = {};
      if (orderedRes.data?.success) {
        (orderedRes.data.data || []).forEach((o: any) => {
          orderedMap[o.itemId] = Number(o.orderedQty) || 0;
        });
      }

      const rows: ItemRow[] = pr.items
        .map((prItem) => {
          const catalogEntry = catalog.find((c) => c.itemId === prItem.itemId);
          if (!catalogEntry) return null;

          const alreadyOrdered = orderedMap[prItem.itemId] || 0;
          const remaining = Math.max(0, prItem.requestedQuantity - alreadyOrdered);

          return {
            itemId: prItem.itemId,
            itemName: prItem.itemName,
            uomName: prItem.uomName || catalogEntry.purchaseUomName || "Unit",
            purchaseUomId: catalogEntry.purchaseUomId || prItem.purchaseUomId || 0,
            alreadyOrdered,
            requestedQty: prItem.requestedQuantity,
            remaining,
            orderQty: remaining > 0 ? String(remaining) : "0",
            unitPrice: Number(catalogEntry.unitPrice) || 0,
          } as ItemRow;
        })
        .filter(Boolean) as ItemRow[];

      setItemRows(rows);
    } catch (e) {
      console.error("Failed to fetch supplier items:", e);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectPR = (pr: PurchaseRequisition) => {
    setSelectedPR(pr);
    setSelectedSupplierId(null);
    setItemRows([]);
    fetchEligibleSuppliers(pr);
    setStep(2);
  };

  const handleSelectSupplier = (supplierId: number) => {
    setSelectedSupplierId(supplierId);
    if (selectedPR) fetchItemsForSupplier(supplierId, selectedPR);
    fetchNextPoNumber();
    setStep(3);
  };

  const updateRow = (idx: number, field: "orderQty", value: string) => {
    // For orderQty — only allow whole numbers
    if (field === "orderQty" && value !== "" && !/^\d*\.?\d{0,3}$/.test(value)) return;
    // For totalPrice — allow valid decimal format (up to 2 decimals)
    setItemRows((prev) => prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)));
  };

  const totalAmount = useMemo(
    () => itemRows.reduce((sum, row) => sum + (parseFloat(row.orderQty) || 0) * row.unitPrice, 0),
    [itemRows]
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    const hasAnyQty = itemRows.some((row) => (parseInt(row.orderQty, 10) || 0) > 0);
    if (!hasAnyQty) {
      errs.items = "Please enter an order quantity greater than 0 for at least one item.";
    }
    itemRows.forEach((row, idx) => {
      const qty = parseFloat(row.orderQty);
      if (!row.orderQty || isNaN(qty) || qty <= 0) {
        errs[`qty_${idx}`] = "Required";
      } else if (qty > row.remaining) {
        errs[`qty_${idx}`] = `Cannot exceed remaining qty (${row.remaining})`;
      }
      if (row.unitPrice <= 0) {
        errs[`price_${idx}`] = "Supplier price is not configured";
      }
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isStep3Valid = useMemo(() => {
    const activeRows = itemRows.filter((r) => (parseInt(r.orderQty, 10) || 0) > 0);
    if (activeRows.length === 0) return false;
    return activeRows.every((r) => {
      const qty = parseInt(r.orderQty, 10) || 0;
      if (!isEdit && qty > r.remaining) return false;
      if (!Number.isFinite(r.unitPrice) || r.unitPrice <= 0) return false;
      return true;
    });
  }, [itemRows, isEdit]);

  const handleSubmit = async (initialStatus: "Draft" | "Pending Approval") => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const activeRows = itemRows.filter((row) => (parseInt(row.orderQty, 10) || 0) > 0);
      const payload = {
        prId: selectedPR?.prId ?? initialPo?.prId ?? null,
        supplierId: selectedSupplierId,
        expectedArrivalDate: new Date(`${eta}T00:00:00`).toISOString(),
        totalAmount,
        requestedBy: user?.firstName
          ? `${user.firstName} ${user.lastName || ""}`.trim()
          : user?.username || "Inventory Manager",
        initialStatus,
        items: activeRows.map((row) => ({
          itemId: row.itemId,
          poItemQuantity: parseFloat(row.orderQty),
          purchaseUomId: row.purchaseUomId || undefined,
        })),
      };

      const res = isEdit && initialPo?.poId
        ? await api.put(`/api/purchase-orders/${initialPo.poId}`, payload)
        : await api.post("/api/purchase-orders", payload);

      if (res.data?.success) {
        onSuccess();
        onClose();
      } else {
        setErrors((p) => ({ ...p, general: res.data?.message || "Failed to save purchase order." }));
      }
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.title ||
        (e?.response?.data?.errors
          ? Object.values(e.response.data.errors).flat().filter(Boolean).join("; ")
          : null) ||
        e?.message ||
        "Failed to save purchase order.";
      setErrors((p) => ({ ...p, general: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPRs = useMemo(() => {
    const s = prSearch.toLowerCase();
    return approvedPRs.filter(
      (pr) =>
        !s ||
        pr.prNumber.toLowerCase().includes(s) ||
        pr.requestedBy?.toLowerCase().includes(s) ||
        pr.department?.toLowerCase().includes(s)
    );
  }, [approvedPRs, prSearch]);

  const selectedSupplier = eligibleSuppliers.find((s) => s.supplierId === selectedSupplierId);

  return (
    <ModalWrapper
      open={open}
      title={isEdit ? `Edit Purchase Order — ${initialPo?.poNumber}` : "Create Purchase Order"}
      onClose={onClose}
      size="max-w-5xl"
    >
      <div className="space-y-6">
        {errors.general && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between animate-in fade-in-50">
            <span className="font-medium">{errors.general}</span>
            <button
              type="button"
              onClick={() =>
                setErrors((prev) => {
                  const c = { ...prev };
                  delete c.general;
                  return c;
                })
              }
              className="font-bold underline ml-2 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
        {/* Step Progress (only in create mode) */}
        {!isEdit && (
          <div className="flex items-center gap-0">
            {[1, 2, 3].map((s) => (
              <React.Fragment key={s}>
                <div
                  onClick={() => {
                    if (step > s) setStep(s);
                  }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    step > s ? "cursor-pointer hover:bg-muted/80" : ""
                  } ${
                    step === s
                      ? "bg-foreground text-background"
                      : step > s
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      step === s
                        ? "bg-background text-foreground"
                        : step > s
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step > s ? "✓" : s}
                  </span>
                  <span>
                    {s === 1 && "Select Purchase Requisition"}
                    {s === 2 && "Select Supplier"}
                    {s === 3 && "Order Details"}
                  </span>
                </div>
                {s < 3 && <ChevronRight className="w-4 h-4 text-muted-foreground mx-1 shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* ─── STEP 1: Select PR ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Select an <strong>Approved</strong> Purchase Requisition to base this Purchase Order on. A Purchase Requisition is required to create a Purchase Order.
            </p>

            <div className="flex items-center gap-2 border border-border rounded-xl px-3 py-2 bg-card">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search Purchase Requisition number, requester, or department..."
                value={prSearch}
                onChange={(e) => setPrSearch(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent text-xs p-0 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* PR List */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {loadingPRs ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPRs.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  {prSearch ? "No approved PRs match your search." : "No approved PRs available."}
                </div>
              ) : (
                filteredPRs.map((pr) => (
                  <button
                    key={pr.prId}
                    type="button"
                    onClick={() => handleSelectPR(pr)}
                    className="w-full text-left rounded-xl border border-border p-3.5 hover:bg-muted/50 transition-colors bg-card group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-foreground group-hover:underline">
                            {pr.prNumber}
                          </span>
                          {pr.priority && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                pr.priority === "Urgent"
                                  ? "bg-red-100 text-red-700"
                                  : pr.priority === "High"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {pr.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          By: <span className="text-foreground font-medium">{pr.requestedBy}</span> · Dept:{" "}
                          <span className="text-foreground font-medium">{pr.department}</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {pr.items?.length || 0} item(s) · Required:{" "}
                          {pr.requiredDate
                            ? new Date(pr.requiredDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Select Supplier ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            {selectedPR && (
              <div className="p-3.5 rounded-xl border border-border bg-muted/30">
                <p className="text-xs font-semibold text-foreground mb-0.5">
                  Purchase Requisition Reference: <span className="font-mono">{selectedPR.prNumber}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedPR.items?.length || 0} items · Dept: {selectedPR.department || "Inventory"} ·
                  Priority: {selectedPR.priority || "Normal"} · Required:{" "}
                  {selectedPR.requiredDate
                    ? new Date(selectedPR.requiredDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Choose a supplier. Only suppliers who can supply at least one item from this Purchase Requisition are shown.
            </p>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {loadingSuppliers ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : eligibleSuppliers.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  No eligible suppliers found for the selected Purchase Requisition items.
                </div>
              ) : (
                eligibleSuppliers.map((s) => (
                  <button
                    key={s.supplierId}
                    type="button"
                    onClick={() => handleSelectSupplier(s.supplierId)}
                    className="w-full text-left rounded-xl border border-border px-4 py-3 hover:bg-muted/50 transition-colors bg-card group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold text-foreground group-hover:underline">
                          {s.supplierName}
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Order Details ──────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            {/* Top Cards: Target PO Number + PR Reference + Supplier */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl border border-border bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Purchase Order Number to Generate</p>
                  <span className="text-[9px] font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                    Auto-Assigned
                  </span>
                </div>
                <p className="text-xs font-mono font-bold text-foreground">
                  {nextPoNumber || "PO-..."}
                </p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Purchase Requisition Reference</p>
                <p className="text-xs font-mono font-bold text-foreground">{selectedPR?.prNumber || "—"}</p>
              </div>
              <div className="p-3 rounded-xl border border-border bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Supplier</p>
                <p className="text-xs font-semibold text-foreground truncate" title={selectedSupplier?.supplierName}>
                  {selectedSupplier?.supplierName || "—"}
                </p>
              </div>
            </div>

            {/* PR Details Summary (read-only) */}
            {selectedPR && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-3.5 shadow-sm">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-foreground" />
                    <span className="text-xs font-bold text-foreground">Requisition Information</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Ref: {selectedPR.prNumber}
                  </span>
                </div>

                {/* 4 key metrics in neat pill cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-muted/30 border border-border/70">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Requested By</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5 truncate" title={selectedPR.requestedBy}>
                      {selectedPR.requestedBy || "—"}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/30 border border-border/70">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Department</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5 truncate" title={selectedPR.department}>
                      {selectedPR.department || "—"}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/30 border border-border/70">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Priority</p>
                    <div className="mt-0.5">
                      <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                        selectedPR.priority === "High" || selectedPR.priority === "Urgent"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                          : "bg-muted text-foreground"
                      }`}>
                        {selectedPR.priority || "Normal"}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/30 border border-border/70">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Required Date</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">
                      {selectedPR.requiredDate
                        ? new Date(selectedPR.requiredDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Purpose & Admin Notes in clean side-by-side callouts if present */}
                {(selectedPR.purpose || selectedPR.adminNotes) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedPR.purpose && (
                      <div className="p-2.5 rounded-lg bg-muted/20 border border-border/70 text-xs">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Purpose
                        </span>
                        <p className="text-foreground text-xs leading-relaxed break-words">
                          {selectedPR.purpose}
                        </p>
                      </div>
                    )}
                    {selectedPR.adminNotes && (
                      <div className="p-2.5 rounded-lg bg-muted/20 border border-border/70 text-xs">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Admin / Approval Notes
                        </span>
                        <p className="text-foreground text-xs leading-relaxed break-words">
                          {selectedPR.adminNotes}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* PR Items Reference Table (read-only) */}
                <div className="pt-2 border-t border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Purchase Requisition Items Reference
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Item</th>
                          <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Unit of Measure</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Requested</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Already Ordered</th>
                          <th className="px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Remaining</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {itemRows.map((row) => (
                          <tr key={row.itemId} className="bg-card">
                            <td className="px-3 py-2 font-medium text-foreground">{row.itemName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{row.uomName}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{row.requestedQty}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{row.alreadyOrdered}</td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-semibold ${
                                row.remaining <= 0 ? "text-red-500" : "text-green-600"
                              }`}
                            >
                              {row.remaining}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Items Input Table */}
            {loadingItems ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : errors.items ? (
              <div className="py-6 text-center text-xs text-foreground font-medium">{errors.items}</div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${errors.items ? "text-destructive" : "text-muted-foreground"}`}>
                    Order Quantities &amp; Pricing <span className="text-destructive">*</span>
                  </label>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search items..."
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="h-7 text-xs pl-7 rounded-lg border-border bg-card focus-visible:ring-1"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                  <thead className="border-b border-border bg-muted/40">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider">ITEM</th>
                      <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider">Unit of Measure</th>
                      <th className="px-4 py-3 text-right font-bold text-muted-foreground tracking-wider whitespace-nowrap">
                        ORDER QTY <span className="text-foreground">*</span>
                      </th>
                      <th className="px-4 py-3 text-right font-bold text-muted-foreground tracking-wider whitespace-nowrap">
                        QTY LEFT
                      </th>
                      <th className="px-4 py-3 text-right font-bold text-muted-foreground tracking-wider whitespace-nowrap">
                        SYSTEM PRICE
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {itemRows
                      .map((row, originalIndex) => ({ row, originalIndex }))
                      .filter(({ row }) =>
                        !itemSearch ||
                        row.itemName?.toLowerCase().includes(itemSearch.toLowerCase())
                      )
                      .map(({ row, originalIndex: idx }) => {
                        const qty = parseFloat(row.orderQty) || 0;
                        const qtyLeft = row.remaining - qty;
                      const isOverQty = qty > row.remaining;
                      const isFullyOrdered = row.remaining <= 0;

                      return (
                        <tr key={row.itemId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {row.itemName}
                            {isFullyOrdered && (
                              <span className="ml-2 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                FULLY ORDERED
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{row.uomName}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={row.orderQty}
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                onChange={(e) => updateRow(idx, "orderQty", e.target.value)}
                                disabled={isFullyOrdered}
                                className={`w-24 text-right rounded-lg border px-2 py-1 text-xs bg-card focus:outline-none focus:ring-1 focus:ring-foreground/30 ${
                                  isOverQty || errors[`qty_${idx}`]
                                    ? "border-red-500 bg-red-50 text-red-600"
                                    : "border-border"
                                } ${isFullyOrdered ? "opacity-50 cursor-not-allowed" : ""}`}
                              />
                              {(isOverQty || errors[`qty_${idx}`]) && (
                                <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Max {row.remaining}
                                </span>
                              )}
                            </div>
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono font-semibold whitespace-nowrap ${
                              qtyLeft < 0 ? "text-red-500" : qtyLeft === 0 ? "text-muted-foreground" : "text-green-600"
                            }`}
                          >
                            {qtyLeft < 0 ? (
                              <span className="flex items-center justify-end gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {qtyLeft}
                              </span>
                            ) : (
                              qtyLeft
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className={`flex flex-col items-end gap-0.5 ${errors[`price_${idx}`] ? "text-red-600" : "text-foreground"}`}>
                              <span className="font-mono font-semibold whitespace-nowrap">
                                {fmtCurrency(row.unitPrice)} × {qty} = {fmtCurrency(row.unitPrice * qty)}
                              </span>
                              {errors[`price_${idx}`] && (
                                <span className="text-[10px] text-red-500">{errors[`price_${idx}`]}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            )}

            {/* ETA + Total */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Left: ETA */}
              <div>
                <label className={`mb-1.5 block text-xs font-semibold ${errors.eta ? "text-destructive" : "text-foreground"}`}>
                  Expected Arrival Date <span className="text-foreground">*</span>
                </label>
                <div className="relative">
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={eta}
                    onChange={(e) => {
                      setEta(e.target.value);
                      setErrors((p) => ({ ...p, eta: "" }));
                    }}
                    className={`w-full rounded-xl border ${
                      errors.eta ? "border-red-500" : "border-border"
                    } bg-card px-3 py-2 text-xs text-foreground shadow-none focus:outline-none focus:ring-1 focus:ring-foreground/30`}
                  />
                </div>
                {errors.eta && <p className="mt-1 text-xs text-red-500">{errors.eta}</p>}
              </div>

              {/* Right: Total */}
              <div className="flex flex-col justify-end">
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-right">
                  <p className="text-xs text-muted-foreground mb-1">Estimated Total</p>
                  <p className="text-2xl font-bold text-foreground font-mono">{fmtCurrency(totalAmount)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{itemRows.length} item(s)</p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-5 pb-3 border-t border-border mt-6 mb-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={submitting || !isStep3Valid}
                onClick={() => {
                  if (validate()) setConfirmModal("Draft");
                }}
                className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                type="button"
                disabled={submitting || !isStep3Valid}
                onClick={() => {
                  if (validate()) setConfirmModal("Pending Approval");
                }}
                className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Submitting..."
                  : isEdit && initialPo?.status === "Returned"
                  ? "Submit for Revision"
                  : "Submit for Approval"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Review Modal for Submit/Draft (matching PR & Delivery layout) */}
      {confirmModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            style={{ width: "100%", maxWidth: "672px" }}
            className="w-full rounded-2xl border border-border bg-card shadow-2xl p-6 flex flex-col shrink-0"
          >
            <h3 className="text-xl font-bold text-foreground">Review Purchase Order</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Please review the details below before {confirmModal === "Pending Approval" ? "submitting for approval" : "saving as draft"}.
            </p>

            <div className="space-y-4 text-sm text-foreground">
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border">
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Purchase Requisition Reference</span>
                  <span className="font-semibold">{selectedPR?.prNumber || initialPo?.prNumber || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Supplier</span>
                  <span className="font-semibold">{selectedSupplier?.supplierName || initialPo?.supplierName || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Purchase Order No.</span>
                  <span className="font-semibold font-mono">{nextPoNumber || "Auto-assigned"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-1">Total Amount</span>
                  <span className="font-semibold font-mono">{fmtCurrency(totalAmount)}</span>
                </div>
              </div>

              <div className="mt-4 border border-border rounded-xl overflow-hidden bg-card">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-bold text-muted-foreground">ITEM NAME</th>
                      <th className="px-3 py-2.5 text-left font-bold text-muted-foreground">Unit of Measure</th>
                      <th className="px-3 py-2.5 text-right font-bold text-muted-foreground">ORDER QTY</th>
                      <th className="px-3 py-2.5 text-right font-bold text-muted-foreground">TOTAL PRICE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {itemRows.filter(row => parseFloat(row.orderQty) > 0).map((row, idx) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="px-3 py-2.5 font-medium">{row.itemName}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">{row.orderQty} {row.uomName}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmtCurrency((parseFloat(row.orderQty) || 0) * row.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setConfirmModal(null)}
                disabled={submitting}
                className="rounded-xl px-6"
              >
                Back to Edit
              </Button>
              <Button
                disabled={submitting}
                onClick={async () => {
                  const action = confirmModal;
                  setConfirmModal(null);
                  await handleSubmit(action);
                }}
                className="rounded-xl px-6 shadow-sm bg-foreground text-background hover:bg-foreground/85"
              >
                {submitting
                  ? "Processing..."
                  : confirmModal === "Pending Approval"
                  ? isEdit && initialPo?.status === "Returned"
                    ? "Confirm & Submit Revision"
                    : "Confirm & Submit"
                  : "Confirm & Save Draft"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ModalWrapper>
  );
}
