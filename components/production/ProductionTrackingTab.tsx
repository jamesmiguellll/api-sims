"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Layers,
  Clock,
  ArrowRight,
  CheckCircle2,
  Package,
  Calendar,
  User,
  Sparkles,
  ChevronRight,
  FileCheck2,
  RefreshCw,
} from "lucide-react";
import { ProductionBatchEntity } from "./types";
import BatchCompletionModal from "./BatchCompletionModal";

export const STAGES = [
  "Pre-Production",
  "Peeling",
  "Steaming",
  "Mixing/Grinding",
  "Cooking",
  "Cooling",
  "Packaging",
  "Completed",
] as const;

interface ProductionTrackingTabProps {
  initialBatchId?: number | null;
  onNavigateToBatches?: () => void;
  currentUser?: string;
}

export default function ProductionTrackingTab({
  initialBatchId,
  onNavigateToBatches,
  currentUser,
}: ProductionTrackingTabProps) {
  const [batches, setBatches] = useState<ProductionBatchEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(initialBatchId ?? null);
  const [stageNotes, setStageNotes] = useState<string>("");
  const [advancing, setAdvancing] = useState<boolean>(false);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "completed">("active");

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/ProductionBatches");
      if (res.data && Array.isArray(res.data)) {
        setBatches(res.data);
        if (!selectedBatchId && res.data.length > 0) {
          // Select first in-production batch or first batch
          const active = res.data.find((b: ProductionBatchEntity) => b.status === "In Production");
          setSelectedBatchId(active ? active.batchId : res.data[0].batchId);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load production batches.");
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (initialBatchId) {
      setSelectedBatchId(initialBatchId);
    }
  }, [initialBatchId]);

  const selectedBatch = batches.find((b) => b.batchId === selectedBatchId) || null;

  const currentStageIndex = selectedBatch ? STAGES.indexOf(selectedBatch.currentStage as any) : -1;
  const isLastStage = currentStageIndex === STAGES.length - 2; // "Packaging"
  const isCompleted = selectedBatch?.status === "Completed" || selectedBatch?.currentStage === "Completed";
  const nextStageName = currentStageIndex >= 0 && currentStageIndex < STAGES.length - 1 ? STAGES[currentStageIndex + 1] : null;

  // Advance Stage
  const handleAdvanceStage = async () => {
    if (!selectedBatch || !nextStageName) return;

    if (nextStageName === "Completed") {
      setShowCompletionModal(true);
      return;
    }

    setAdvancing(true);
    try {
      const res = await api.patch(`/api/ProductionBatches/${selectedBatch.batchId}/stage`, {
        stage: nextStageName,
        notes: stageNotes.trim() || undefined,
      });

      if (res.data?.success && res.data.data) {
        toast.success(`Batch advanced to ${nextStageName}!`);
        setStageNotes("");
        fetchBatches();
      } else {
        toast.error(res.data?.message || "Failed to advance stage.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setAdvancing(false);
    }
  };

  const filteredBatches = batches.filter((b) =>
    statusFilter === "active" ? b.status === "In Production" : b.status === "Completed"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Production Waterfall Tracking</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Advance batches sequentially through kitchen stages from Pre-Production to Packaging and Final Inspection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBatches}
            className="text-xs h-9 rounded-xl border-border"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            <span>Refresh</span>
          </Button>
          {onNavigateToBatches && (
            <Button
              onClick={onNavigateToBatches}
              className="bg-foreground text-background font-semibold text-xs h-9 px-4 rounded-xl hover:bg-foreground/90 transition-colors shadow-sm"
            >
              Ready Batches
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Layout: Left Sidebar Batch List, Right Detail & Stage Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Batches List */}
        <div className="lg:col-span-4 space-y-3">
          {/* Status Tabs (Active vs Completed) */}
          <div className="flex rounded-xl bg-muted/40 p-1 border border-border">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                statusFilter === "active"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              In Production ({batches.filter((b) => b.status === "In Production").length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("completed")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                statusFilter === "completed"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Completed ({batches.filter((b) => b.status === "Completed").length})
            </button>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {filteredBatches.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl bg-card text-xs text-muted-foreground">
                No {statusFilter} batches found.
              </div>
            ) : (
              filteredBatches.map((b) => {
                const isSelected = b.batchId === selectedBatchId;

                return (
                  <div
                    key={b.batchId}
                    onClick={() => setSelectedBatchId(b.batchId)}
                    className={`p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-card border-foreground shadow-sm ring-1 ring-foreground"
                        : "bg-card border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono font-bold text-xs text-foreground">{b.batchNumber}</div>
                        <div className="font-semibold text-sm text-foreground mt-0.5">{b.productName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{b.recipeName}</div>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>

                    <div className="flex items-center justify-between text-xs pt-3 mt-3 border-t border-border">
                      <span className="font-semibold text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border">
                        {b.currentStage}
                      </span>
                      <span className="font-mono font-bold text-foreground">
                        {b.estimatedQuantity} {b.yieldUom}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Stage Progress & Action Tracker */}
        <div className="lg:col-span-8">
          {selectedBatch ? (
            <div className="space-y-6">
              {/* Batch Overview Header Card */}
              <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-foreground">{selectedBatch.productName}</h3>
                      {selectedBatch.variant && (
                        <span className="text-xs text-muted-foreground font-medium">({selectedBatch.variant})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-1">
                      <span>Batch: {selectedBatch.batchNumber}</span>
                      {selectedBatch.reqNumber && <span>• Req: {selectedBatch.reqNumber}</span>}
                      <span>• Recipe: {selectedBatch.recipeName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm bg-muted/60 px-3 py-1 rounded-xl border border-border">
                      Target: {selectedBatch.estimatedQuantity} {selectedBatch.yieldUom}
                    </span>
                    <StatusBadge status={selectedBatch.status} />
                  </div>
                </div>

                {/* Waterfall Stage Stepper */}
                <div className="pt-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                    Waterfall Stage Progression
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                    {STAGES.map((stage, idx) => {
                      const isPast = currentStageIndex > idx;
                      const isCurrent = currentStageIndex === idx;

                      return (
                        <div
                          key={stage}
                          className={`p-2.5 rounded-xl border text-center transition-all ${
                            isCurrent
                              ? "bg-foreground text-background border-foreground font-bold shadow-sm"
                              : isPast
                              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-semibold"
                              : "bg-muted/30 text-muted-foreground border-border font-medium"
                          }`}
                        >
                          <div className="text-[10px] uppercase font-mono tracking-wider opacity-75">
                            Step {idx + 1}
                          </div>
                          <div className="text-xs truncate mt-0.5 font-bold">
                            {stage}
                          </div>
                          {isPast && (
                            <CheckCircle2 className="w-3.5 h-3.5 mx-auto mt-1 text-emerald-500" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Stage Advance Action Controls */}
              {!isCompleted ? (
                <div className="p-5 rounded-2xl border border-border bg-muted/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-foreground">Current Stage: {selectedBatch.currentStage}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isLastStage
                          ? "This is the final stage. Packaging completion will finalize output and stock in Finished Goods."
                          : `When cooking operations for this step are finished, advance to ${nextStageName}.`}
                      </p>
                    </div>

                    <Button
                      onClick={handleAdvanceStage}
                      disabled={advancing}
                      className="bg-foreground text-background font-semibold text-xs px-6 py-2.5 rounded-xl hover:bg-foreground/90 transition-colors shadow-sm shrink-0"
                    >
                      {isLastStage ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 mr-1.5" />
                          <span>Finalize & Complete Batch</span>
                        </>
                      ) : (
                        <>
                          <span>Advance to {nextStageName}</span>
                          <ArrowRight className="w-4 h-4 ml-1.5" />
                        </>
                      )}
                    </Button>
                  </div>

                  {!isLastStage && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">
                        Stage Notes / Kitchen Observations (Optional)
                      </label>
                      <Input
                        type="text"
                        placeholder="e.g. Temperature reached 95°C, smooth texture achieved..."
                        value={stageNotes}
                        onChange={(e) => setStageNotes(e.target.value)}
                        className="h-10 text-xs rounded-xl border-border bg-card"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    <div>
                      <h4 className="text-sm font-bold text-emerald-500">Batch Completed & Verified</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Finished Goods lot <span className="font-mono font-bold text-foreground">FG-{selectedBatch.batchNumber}</span> stocked in with {selectedBatch.actualQuantity} units.
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="text-muted-foreground block">Packaged By</span>
                    <span className="font-semibold text-foreground">{selectedBatch.packagedBy || "Head Cook"}</span>
                  </div>
                </div>
              )}

              {/* Consumed Raw Material Lots */}
              <div className="p-5 rounded-2xl border border-border bg-card shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-foreground" />
                  <span>Consumed Raw Material Supplies</span>
                </h4>

                <div className="border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-muted/40 border-b border-border">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold text-muted-foreground">Material Item</th>
                        <th className="py-2.5 px-4 font-semibold text-muted-foreground">Lot Code</th>
                        <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Quantity Used</th>
                        <th className="py-2.5 px-4 font-semibold text-muted-foreground">UOM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedBatch.consumptions?.map((c) => (
                        <tr key={c.consumptionId} className="hover:bg-muted/10">
                          <td className="py-3 px-4 font-semibold text-foreground">{c.itemName}</td>
                          <td className="py-3 px-4 font-mono font-medium text-foreground">
                            <span className="bg-muted/60 px-2 py-0.5 rounded border border-border">
                              {c.lotCode || "Assigned Lot"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground">
                            {c.quantityUsed}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground font-mono">{c.uomAbbr}</td>
                        </tr>
                      ))}
                      {(!selectedBatch.consumptions || selectedBatch.consumptions.length === 0) && (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                            No consumption records attached to this batch.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-card text-xs text-muted-foreground">
              Select a batch from the left list to view stage tracking and advance production.
            </div>
          )}
        </div>
      </div>

      {/* Batch Completion Modal */}
      <BatchCompletionModal
        open={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
        batch={selectedBatch}
        onSuccess={() => {
          fetchBatches();
          setShowCompletionModal(false);
        }}
      />
    </div>
  );
}
