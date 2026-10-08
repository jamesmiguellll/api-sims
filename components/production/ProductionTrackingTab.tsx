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

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/ProductionBatches");
      const list = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      setBatches(list);
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
      fetchBatches();
    }
  }, [initialBatchId, fetchBatches]);

  // Active Batches = Batches currently undergoing kitchen production or packaging
  // (Excluding rejected, completed, stocked in, for stock-in, or already sent to QA)
  const activeBatches = useMemo(() => {
    return batches.filter(
      (b) =>
        b.status !== "Rejected" &&
        b.status !== "Completed" &&
        b.status !== "Stocked In" &&
        b.status !== "For Stock-in" &&
        b.status !== "For QA" &&
        b.status !== "Cancelled"
    );
  }, [batches]);

  const displayedBatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeBatches;

    return activeBatches.filter(
      (b) =>
        b.batchNumber?.toLowerCase().includes(q) ||
        (b.reqNumber && b.reqNumber.toLowerCase().includes(q)) ||
        b.productName?.toLowerCase().includes(q) ||
        (b.assignedCook && b.assignedCook.toLowerCase().includes(q))
    );
  }, [activeBatches, searchQuery]);

  // If currently selected batch is no longer active (e.g. finished packaging -> moved to QA), clear selection
  useEffect(() => {
    if (selectedBatchId && !loading) {
      const stillActive = activeBatches.some((b) => b.batchId === selectedBatchId);
      if (!stillActive) {
        setSelectedBatchId(null);
      }
    }
  }, [activeBatches, selectedBatchId, loading]);

  return (
    <div className="space-y-6 animate-page-in">
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

      {/* ── Slim Sidebar + Spacious Main Production Layout ── */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Column: Slimmer Active Batches Bar (w-full lg:w-72 shrink-0) */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="border border-border rounded-2xl bg-card p-3.5 space-y-3 shadow-xs">
            {/* Card Header matching user reference */}
            <div className="flex items-center justify-between pb-1 border-b border-border/60">
              <h3 className="font-bold text-xs uppercase tracking-wider text-foreground">Active Batches</h3>
              <span className="text-[11px] font-semibold text-muted-foreground font-mono">
                {activeBatches.length} {activeBatches.length === 1 ? "Batch" : "Batches"}
              </span>
            </div>

            {/* Search Input */}
            <div>
              <Input
                placeholder="Search active batches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs border-border bg-background"
              />
            </div>

            {/* Batches List */}
            <div className="space-y-2 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
              {loading ? (
                <div className="py-8 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                  Loading active batches...
                </div>
              ) : displayedBatches.length === 0 ? (
                <div className="py-10 px-3 text-center text-xs text-muted-foreground">
                  No active batches in kitchen production.
                </div>
              ) : (
                displayedBatches.map((b) => {
                  const isSelected = b.batchId === selectedBatchId;
                  return (
                    <div
                      key={b.batchId}
                      onClick={() => setSelectedBatchId(b.batchId)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer text-left ${
                        isSelected
                          ? "border-foreground bg-muted/20 ring-1 ring-foreground shadow-sm"
                          : "border-border bg-card hover:border-foreground/40 hover:bg-muted/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0 flex-1">
                          <span className="font-mono font-bold text-xs text-foreground block truncate">
                            {b.batchNumber}
                          </span>
                          <span className="font-semibold text-xs text-foreground block mt-0.5 truncate">
                            {b.productName}
                          </span>
                          {b.variant && (
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {b.variant}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-border bg-background text-foreground shrink-0">
                          {b.status}
                        </span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-border/70 flex items-center justify-between text-[11px]">
                        <span className="font-medium text-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border text-[10px]">
                          {b.currentStage || b.stage || "Pre-Production"}
                        </span>
                        <span className="font-mono font-bold text-foreground text-[11px]">
                          {b.estimatedQuantity} {b.yieldUom || "jars"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Waterfall Stage Progression & Packaging (flex-1) */}
        <div className="flex-1 min-w-0 w-full">
          {!selectedBatchId ? (
            <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-xs flex flex-col items-center justify-center min-h-[380px]">
              <p className="text-sm text-muted-foreground">
                Select an active batch from the left to execute the waterfall stages.
              </p>
            </div>
          ) : (
            <ProductionBatchDetailView
              batchId={selectedBatchId}
              onBack={() => setSelectedBatchId(null)}
              currentUser={currentUser}
              onRefreshList={fetchBatches}
              onSwitchToQaOfficer={onSwitchToQaOfficer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
