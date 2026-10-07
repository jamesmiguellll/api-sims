"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ProductionBatchEntity } from "./types";
import ProductionBatchDetailView from "./ProductionBatchDetailView";

interface ProductionTrackingTabProps {
  initialBatchId?: number | null;
  onNavigateToBatches?: () => void;
  currentUser?: string;
  onSwitchToQaOfficer?: () => void;
}

export default function ProductionTrackingTab({
  initialBatchId,
  currentUser = "Head Cook",
  onSwitchToQaOfficer,
}: ProductionTrackingTabProps) {
  const [batches, setBatches] = useState<ProductionBatchEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(initialBatchId ?? null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [subTab, setSubTab] = useState<"active" | "rejected">("active");

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/ProductionBatches");
      if (res.data && Array.isArray(res.data)) {
        setBatches(res.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load production batches.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (initialBatchId) {
      setSelectedBatchId(initialBatchId);
    }
  }, [initialBatchId]);

  // Active Batches = All batches in production or packaging (excluding Rejected and fully Completed)
  const activeBatches = useMemo(() => {
    return batches.filter(
      (b) => b.status !== "Rejected" && b.status !== "Completed" && b.status !== "Stocked In"
    );
  }, [batches]);

  // Rejected Batches = Batches rejected during production or packaging
  const rejectedBatches = useMemo(() => {
    return batches.filter((b) => b.status === "Rejected");
  }, [batches]);

  const displayedBatches = useMemo(() => {
    const list = subTab === "active" ? activeBatches : rejectedBatches;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;

    return list.filter(
      (b) =>
        b.batchNumber.toLowerCase().includes(q) ||
        (b.reqNumber && b.reqNumber.toLowerCase().includes(q)) ||
        b.productName.toLowerCase().includes(q) ||
        (b.assignedCook && b.assignedCook.toLowerCase().includes(q))
    );
  }, [subTab, activeBatches, rejectedBatches, searchQuery]);

  // If a batch is selected, render the dedicated Detail View (split-panel layout matching mockups)
  if (selectedBatchId) {
    return (
      <ProductionBatchDetailView
        batchId={selectedBatchId}
        onBack={() => setSelectedBatchId(null)}
        currentUser={currentUser}
        onRefreshList={fetchBatches}
        onSwitchToQaOfficer={onSwitchToQaOfficer}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Production Tracking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track active kitchen batches, advance cooking stages, complete packaging, and record batch outcomes.
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

      {/* ── Subtab Pill Navigation (Active Batches & Rejected Batches) ── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab("active")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === "active"
                ? "bg-foreground text-background shadow-xs"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>Active Batches</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                subTab === "active" ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {activeBatches.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab("rejected")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              subTab === "rejected"
                ? "bg-foreground text-background shadow-xs"
                : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            <span>Rejected Batches</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                subTab === "rejected" ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {rejectedBatches.length}
            </span>
          </button>
        </div>

        <div className="w-full sm:w-64">
          <Input
            placeholder="Search by batch, PR, or product..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-xs border-border bg-card"
          />
        </div>
      </div>

      {/* ── Monochromatic Table of Batches ── */}
      <div className="border border-border rounded-xl bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Loading batches...
          </div>
        ) : displayedBatches.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-foreground">
              {subTab === "active" ? "No active production batches." : "No rejected batches recorded."}
            </p>
            <p className="text-xs text-muted-foreground">
              {subTab === "active"
                ? "When ready for production requests are started, active batches appear here."
                : "Any rejected cooking or packaging batches will be archived here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Batch Number</th>
                  <th className="py-3 px-4">Request No.</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4 text-right">Target Qty</th>
                  <th className="py-3 px-4">Current Stage</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned Cook</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {displayedBatches.map((b) => (
                  <tr
                    key={b.batchId}
                    onClick={() => setSelectedBatchId(b.batchId)}
                    className="hover:bg-muted/20 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-foreground">
                      {b.batchNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {b.reqNumber || "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-foreground">{b.productName}</div>
                      {b.variant && (
                        <div className="text-[11px] text-muted-foreground">{b.variant}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-foreground">
                      {Number(b.estimatedQuantity).toLocaleString()} {b.yieldUom || "jars"}
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {b.currentStage || b.stage}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-border bg-muted/40 text-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground" />
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {b.assignedCook || "Head Cook"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBatchId(b.batchId);
                        }}
                        className="h-7 px-2.5 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        Open Batch →
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
