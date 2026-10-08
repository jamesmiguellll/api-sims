"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import api from "@/lib/api";
import { GRN, StockIn } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (stockIn: StockIn) => void;
}

interface StockInLineDraft {
  grnItemId?: number;
  itemId: number;
  itemName: string;
  categoryName?: string;
  purchaseUomId?: number;
  purchaseUomName: string;
  quantityToStock: number;
  currentStock: number;
  lotCode: string;
  expiryDate: string;
  notes: string;
}

export default function CreateStockInModal({ open, onClose, onSuccess }: Props) {
  const [grns, setGrns] = useState<GRN[]>([]);
  const [selectedGrnId, setSelectedGrnId] = useState<number | "">("");
  const [selectedGrn, setSelectedGrn] = useState<GRN | null>(null);
  const [lines, setLines] = useState<StockInLineDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    submitForApproval: boolean;
  }>({ open: false, submitForApproval: false });

  useEffect(() => {
    if (!open) return;
    setSelectedGrnId("");
    setSelectedGrn(null);
    setLines([]);
    setNotes("");
    setError(null);
    setLoading(true);

    api
      .get("/api/goods-receipts")
      .then(({ data }) => {
        const list: GRN[] = Array.isArray(data?.data) ? data.data : [];
        const eligible = list.filter(
          (g) =>
            g.status === "QaCompleted" ||
            g.status === "Received" ||
            g.status === "PartiallyPutAway"
        );
        setGrns(eligible);
      })
      .catch(() => setError("Unable to load Goods Receipt Notes."))
      .finally(() => setLoading(false));
  }, [open]);

  const handleSelectGrn = async (grnId: number) => {
    setSelectedGrnId(grnId);
    const grn = grns.find((g) => g.grnId === grnId);
    if (!grn) return;
    setSelectedGrn(grn);
    setLoading(true);
    setError(null);

    try {
      const [grnDetailRes, invRes] = await Promise.all([
        api.get(`/api/goods-receipts/${grnId}`),
        api.get("/api/Inventory?pageSize=1000").catch(() => ({ data: { data: [] } })),
      ]);

      const fullGrn: GRN = grnDetailRes.data?.data || grn;
      const invList = Array.isArray(invRes.data?.data?.items)
        ? invRes.data.data.items
        : Array.isArray(invRes.data?.data)
        ? invRes.data.data
        : [];

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}${mm}${dd}`;

      const cleanGrn = (fullGrn.grnNumber || `${dateStr}`).replace(/^GRN-?/i, "");
      let seq = 1;

      const draftedLines: StockInLineDraft[] = (fullGrn.items || []).map((item) => {
        const invMatch = invList.find((i: any) => i.itemId === item.itemId);
        const currentStock = Number(invMatch?.currentStock ?? invMatch?.quantityOnHand ?? 0);
        const generatedLot = `LOT-${cleanGrn}-${item.itemId}-${String(seq).padStart(2, "0")}`;
        seq++;

        return {
          grnItemId: item.grnItemId,
          itemId: item.itemId,
          itemName: item.itemName || `Item #${item.itemId}`,
          purchaseUomId: item.purchaseUomId,
          purchaseUomName: item.purchaseUomName || "Unit",
          quantityToStock: Number(item.deliveredQuantity) || 0,
          currentStock,
          lotCode: generatedLot,
          expiryDate: item.expiryDate ? item.expiryDate.split("T")[0] : "",
          notes: item.notes || "",
        };
      });

      setLines(draftedLines);
    } catch {
      setError("Failed to load Goods Receipt Note items and stock data.");
    } finally {
      setLoading(false);
    }
  };

  const handleTrySubmit = (submitForApproval: boolean) => {
    if (!selectedGrnId || lines.length === 0) {
      setError("Please select a valid Goods Receipt Note with item lines.");
      return;
    }

    const invalidQty = lines.some((l) => Number(l.quantityToStock) <= 0);
    if (invalidQty) {
      setError("Every line item must have a quantity to stock greater than zero.");
      return;
    }

    const invalidLot = lines.some((l) => !l.lotCode.trim());
    if (invalidLot) {
      setError("Every line item must have a valid lot number.");
      return;
    }

    setConfirmModal({ open: true, submitForApproval });
  };

  const executeSubmit = async (submitForApproval: boolean) => {
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        grnId: Number(selectedGrnId),
        notes: notes.trim() || undefined,
        submitForApproval,
        lines: lines.map((l) => ({
          grnItemId: l.grnItemId,
          itemId: l.itemId,
          purchaseUomId: l.purchaseUomId,
          quantityToStock: Number(l.quantityToStock),
          currentStockBeforeCommit: Number(l.currentStock),
          lotCode: l.lotCode.trim(),
          expiryDate: l.expiryDate ? `${l.expiryDate.split("T")[0]}T12:00:00Z` : undefined,
          notes: l.notes.trim() || undefined,
        })),
      };

      const { data } = await api.post("/api/StockIns", payload);
      if (!data?.success) {
        throw new Error(data?.message || "Failed to create Stock-In record.");
      }

      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "An unexpected error occurred while creating Stock-In."
      );
    } finally {
      setSubmitting(false);
      setConfirmModal({ open: false, submitForApproval: false });
    }
  };

  return (
    <ModalWrapper
      open={open}
      title="Create Stock-In Report"
      onClose={onClose}
      size="max-w-5xl"
    >
      <div className="space-y-5 text-foreground">
        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-foreground font-bold text-xs hover:underline ml-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* GRN Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Select Goods Receipt Note
          </label>
          <div>
            <select
              value={selectedGrnId}
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id) handleSelectGrn(id);
              }}
              className="w-56 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              <option value="" disabled>
                Select Goods Receipt Note
              </option>
              {grns.map((g) => (
                <option key={g.grnId} value={g.grnId}>
                  {g.grnNumber}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && (
          <div className="py-10 text-center text-xs text-muted-foreground animate-pulse">
            Loading Goods Receipt Note items…
          </div>
        )}

        {/* Stock-In Items Table */}
        {selectedGrn && !loading && lines.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Items
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">Supply Name</th>
                    <th className="px-3 py-3 text-center">Unit of Measure</th>
                    <th className="px-3 py-3 text-right">Stock to Put In</th>
                    <th className="px-3 py-3 text-right">Current Stock</th>
                    <th className="px-4 py-3 whitespace-nowrap">Lot No.</th>
                    <th className="px-4 py-3 text-center whitespace-nowrap">Expiry Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line, lineIndex) => (
                    <tr
                      key={`${line.grnItemId || line.itemId}-${lineIndex}`}
                      className="hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {line.itemName}
                      </td>
                      <td className="px-3 py-3 text-center text-muted-foreground">
                        {line.purchaseUomName}
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold text-foreground">
                        {line.quantityToStock}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                        {line.currentStock}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground whitespace-nowrap">
                        {line.lotCode}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {line.expiryDate
                          ? new Date(line.expiryDate).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* General Notes */}
            <div className="space-y-1.5 pt-2">
              <span className="text-xs font-semibold text-foreground">Stock-In Notes / Storage Instructions</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Specify designated warehouse aisle, refrigeration, or special storage notes..."
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={lines.length === 0 || submitting}
            onClick={() => handleTrySubmit(true)}
            className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm cursor-pointer"
          >
            {submitting ? "Committing…" : "Commit to Inventory"}
          </button>
        </div>
      </div>

      {/* Review Confirmation Modal (Matching POActionModal layout) */}
      {confirmModal.open &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setConfirmModal({ open: false, submitForApproval: false })}
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
                  {confirmModal.submitForApproval ? "Submit Stock-In Report" : "Save Stock-In as Draft"}
                </h2>

                {/* Reference */}
                <p className="text-xs font-mono font-semibold text-muted-foreground mb-3">
                  GRN Reference: {grns.find((g) => g.grnId === Number(selectedGrnId))?.grnNumber || "N/A"}
                </p>

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                  {confirmModal.submitForApproval
                    ? `Are you sure you want to submit this stock-in report with ${lines.length} item${lines.length === 1 ? "" : "s"} for admin approval? Once submitted, it will be routed for review.`
                    : `Save this stock-in report with ${lines.length} item${lines.length === 1 ? "" : "s"} as a draft? You can continue editing or submit it later.`}
                </p>

                {/* Action Buttons */}
                <div className="flex justify-center gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setConfirmModal({ open: false, submitForApproval: false })}
                    disabled={submitting}
                    className="flex-1 px-5 py-2.5 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => executeSubmit(confirmModal.submitForApproval)}
                    className="flex-1 px-5 py-2.5 text-sm font-semibold bg-foreground text-background hover:bg-foreground/85 rounded-xl transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? "Processing…" : "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ModalWrapper>
  );
}
