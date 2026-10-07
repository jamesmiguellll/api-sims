"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ProductionStockInTabProps {
  currentUser?: string;
}

export default function ProductionStockInTab({ currentUser = "Inventory Manager" }: ProductionStockInTabProps) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [committing, setCommitting] = useState<boolean>(false);
  const [confirmModal, setConfirmModal] = useState<boolean>(false);

  // Fetch batches ready for stock-in
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/ProductionBatches?status=For Stock-in");
      if (res.data && Array.isArray(res.data)) {
        setBatches(res.data);
        if (res.data.length > 0 && !selectedBatchId) {
          setSelectedBatchId(res.data[0].batchId);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load batches ready for stock-in.");
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const selectedBatch = batches.find((b) => b.batchId === selectedBatchId) || null;

  // Commit to inventory handler
  const handleCommitToInventory = async () => {
    if (!selectedBatch) return;

    setCommitting(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${selectedBatch.batchId}/add-to-inventory`, {
        notes: notes.trim(),
      });

      if (res.data?.success) {
        toast.success(
          `Committed to inventory! ${res.data.data.quantityAdded} units added under lot ${res.data.data.lotCode}.`
        );
        setConfirmModal(false);
        setNotes("");
        setSelectedBatchId(null);
        fetchBatches();
      } else {
        toast.error(res.data?.message || "Failed to commit to inventory.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred during stock-in.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-page-in">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Finished Goods Stock-In</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review completed batches passed by Quality Assurance and commit finished products into active inventory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBatches}
            className="text-xs h-8 rounded-lg border-border hover:bg-muted font-semibold cursor-pointer"
          >
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
          Loading batches ready for stock-in...
        </div>
      ) : batches.length === 0 ? (
        <div className="p-12 text-center border border-border rounded-xl bg-card space-y-2">
          <p className="text-sm font-semibold text-foreground">No finished goods batches waiting for stock-in.</p>
          <p className="text-xs text-muted-foreground">
            Batches that pass QA review will appear here ready to commit to inventory.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Batch Selector Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {batches.map((b) => {
              const isSelected = b.batchId === selectedBatchId;
              return (
                <button
                  key={b.batchId}
                  type="button"
                  onClick={() => setSelectedBatchId(b.batchId)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? "bg-foreground text-background shadow-xs"
                      : "border border-border bg-card text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="font-mono">{b.fgLotCode || b.batchNumber}</span>
                  <span className="opacity-80">({b.productName})</span>
                </button>
              );
            })}
          </div>

          {/* Stock-In Table matching user specification */}
          {selectedBatch && (
            <div className="border border-border rounded-xl bg-card overflow-hidden space-y-4 p-5">
              <div>
                <h3 className="text-sm font-bold text-foreground">Stock-In Verification Table</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Confirm stock to put in, lot tracking code, and expiry before committing to inventory.
                </p>
              </div>

              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Supply Name</th>
                      <th className="py-3 px-4">Unit of Measure</th>
                      <th className="py-3 px-4 text-right">Stock to Put In</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4">Lot No.</th>
                      <th className="py-3 px-4">Expiry Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {selectedBatch.productName}
                        {selectedBatch.variant && (
                          <span className="text-[11px] text-muted-foreground ml-1.5">
                            ({selectedBatch.variant})
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground font-mono">
                        {selectedBatch.yieldUom || "jars"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                        {Number(selectedBatch.finalQuantity || selectedBatch.actualQuantity).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-muted-foreground">
                        {Number(selectedBatch.actualQuantity || 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        {selectedBatch.fgLotCode || "CCS-261008-01"}
                      </td>
                      <td className="py-3.5 px-4 text-foreground">
                        {selectedBatch.expiryDate
                          ? new Date(selectedBatch.expiryDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "08 Oct 2027"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Stock-In Notes (Optional)</Label>
                <Textarea
                  placeholder="Storage aisle, bin assignment, or put-away notes..."
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs border-border bg-background"
                />
              </div>

              {/* Action Button */}
              <div className="flex items-center justify-end pt-2 border-t border-border">
                <Button
                  type="button"
                  onClick={() => setConfirmModal(true)}
                  disabled={committing}
                  className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
                >
                  Commit to Inventory
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl">
            <div>
              <h4 className="text-sm font-bold text-foreground">Confirm Inventory Commit</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Commit <strong>{Number(selectedBatch.finalQuantity || selectedBatch.actualQuantity)} units</strong> of{" "}
                <strong>{selectedBatch.productName}</strong> under Lot{" "}
                <strong>{selectedBatch.fgLotCode || "CCS-261008-01"}</strong> to inventory? This will update stock and log a stock ledger record.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmModal(false)}
                className="text-xs border-border"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCommitToInventory}
                disabled={committing}
                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
              >
                {committing ? "Committing..." : "Confirm Commit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
