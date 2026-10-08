"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ProductionBatchEntity } from "./types";

import { FileUploadField } from "@/components/orders-procurement/delivery/FileUploadField";

export const COOKING_STAGES = [
  "Steaming",
  "Peeling",
  "Grinding",
  "Mixing",
  "Cooking",
  "Cooling",
] as const;

export const WORKFLOW_STEPS = [
  "Production",
  "Packaging",
] as const;

export function formatTo12Hour(timeStr?: string): string {
  if (!timeStr) return "";
  if (/am|pm/i.test(timeStr)) return timeStr.toUpperCase();
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1].slice(0, 2);
    if (isNaN(hours)) return timeStr;
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours.toString().padStart(2, "0")}:${minutes} ${period}`;
  }
  return timeStr;
}

export function getCurrent12HourTime(): { hour: string; minute: string; period: "AM" | "PM" } {
  const now = new Date();
  let hours = now.getHours();
  const period: "AM" | "PM" = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const minutes = now.getMinutes();
  return {
    hour: hours.toString().padStart(2, "0"),
    minute: minutes.toString().padStart(2, "0"),
    period,
  };
}

interface ProductionBatchDetailViewProps {
  batchId: number;
  onBack: () => void;
  currentUser?: string;
  onRefreshList?: () => void;
  onSwitchToQaOfficer?: () => void;
}

export default function ProductionBatchDetailView({
  batchId,
  onBack,
  currentUser = "Head Cook",
  onRefreshList,
  onSwitchToQaOfficer,
}: ProductionBatchDetailViewProps) {
  const [mounted, setMounted] = useState<boolean>(false);
  const [batch, setBatch] = useState<ProductionBatchEntity | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Active cooking stage inputs (12-hour time)
  const [stageHour, setStageHour] = useState<string>("08");
  const [stageMinute, setStageMinute] = useState<string>("00");
  const [stagePeriod, setStagePeriod] = useState<"AM" | "PM">("AM");
  const [stageNotes, setStageNotes] = useState<string>("");
  const [stageLoading, setStageLoading] = useState<boolean>(false);
  const [confirmStageModal, setConfirmStageModal] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const cur = getCurrent12HourTime();
    setStageHour(cur.hour);
    setStageMinute(cur.minute);
    setStagePeriod(cur.period);
  }, []);

  // Reject Batch modal state (Kitchen production only)
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectCook, setRejectCook] = useState<string>(currentUser);
  const [rejectProofUrl, setRejectProofUrl] = useState<string>("");
  const [rejectNotes, setRejectNotes] = useState<string>("");
  const [rejectLoading, setRejectLoading] = useState<boolean>(false);

  // Packaging form state
  const [pkgDate, setPkgDate] = useState<string>("");
  const [pkgExpiryDate, setPkgExpiryDate] = useState<string>("");
  const [pkgPackedBy, setPkgPackedBy] = useState<string>(currentUser);
  const [pkgProofUrl, setPkgProofUrl] = useState<string>("");
  const [pkgQuantity, setPkgQuantity] = useState<number>(0);
  const [pkgNotes, setPkgNotes] = useState<string>("");
  const [pkgLoading, setPkgLoading] = useState<boolean>(false);
  const [confirmPackagingModal, setConfirmPackagingModal] = useState<boolean>(false);

  // Fetch single batch detail
  const fetchBatchDetail = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/ProductionBatches/${batchId}`);
      if (res.data?.success && res.data.data) {
        const b = res.data.data;
        setBatch(b);

        // Prepopulate packaging defaults if empty
        if (!pkgQuantity && b.estimatedQuantity) {
          setPkgQuantity(b.estimatedQuantity);
        }
        if (!pkgDate) {
          setPkgDate(new Date().toISOString().slice(0, 16));
        }
        if (!pkgExpiryDate) {
          const exp = new Date();
          exp.setFullYear(exp.getFullYear() + 1);
          setPkgExpiryDate(exp.toISOString().slice(0, 10));
        }
      } else {
        toast.error("Failed to load batch details.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Error loading batch details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatchDetail();
  }, [batchId]);

  // Derived current stage and step index
  const currentStage = batch?.currentStage || batch?.stage || "Steaming";
  const status = batch?.status || "In Production";

  // Parse stage logs from batch.notes (Activity timeline removed per user instruction)
  const stageLogs = useMemo(() => {
    const sLogs: Record<string, { endTime: string; by: string; notes?: string }> = {};
    const notesStr = batch?.notes || "";
    const lines = notesStr.split("\n");

    for (const line of lines) {
      const stageMatch = line.match(/\[STAGE:([^|]+)\|END:([^|]+)\|BY:([^|\]]+)(?:\|NOTES:([^\]]+))?\]/);
      if (stageMatch) {
        sLogs[stageMatch[1]] = {
          endTime: stageMatch[2],
          by: stageMatch[3],
          notes: stageMatch[4],
        };
      }
    }
    return sLogs;
  }, [batch?.notes]);

  // Determine stage progression in cooking
  const currentCookingStageIndex = COOKING_STAGES.indexOf(currentStage as any);
  const isCookingComplete =
    currentCookingStageIndex === -1 &&
    (currentStage === "Packaging" || status === "For QA" || status === "For Stock-in" || status === "Stocked In");

  // Stepper current active index calculation for kitchen lifecycle:
  // 0: Production (Cooking Stages) | 1: Packaging
  const currentStepIndex = useMemo(() => {
    if (
      currentStage === "Packaging" ||
      status === "For QA" ||
      status === "For Stock-in" ||
      status === "Stocked In" ||
      status === "Completed"
    ) {
      return 1;
    }
    return 0;
  }, [status, currentStage]);

  const formattedStageEndTime = `${stageHour}:${stageMinute} ${stagePeriod}`;

  // Handle Complete Stage
  const handleCompleteCurrentStage = async () => {
    const stageToComplete =
      currentCookingStageIndex >= 0 ? COOKING_STAGES[currentCookingStageIndex] : COOKING_STAGES[0];

    setStageLoading(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${batchId}/stages/complete`, {
        stage: stageToComplete,
        endTime: formattedStageEndTime,
        notes: stageNotes,
        completedBy: currentUser,
      });

      if (res.data?.success) {
        toast.success(`Stage ${stageToComplete} completed at ${formattedStageEndTime}!`);
        const cur = getCurrent12HourTime();
        setStageHour(cur.hour);
        setStageMinute(cur.minute);
        setStagePeriod(cur.period);
        setStageNotes("");
        setConfirmStageModal(false);
        await fetchBatchDetail();
        if (onRefreshList) onRefreshList();
      } else {
        toast.error(res.data?.message || "Failed to complete stage.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setStageLoading(false);
    }
  };

  // Handle Proceed to Packaging
  const handleProceedToPackaging = async () => {
    setStageLoading(true);
    try {
      const res = await api.patch(`/api/ProductionBatches/${batchId}/stage`, {
        stage: "Packaging",
        notes: "Cooking stages finished. Ready for packaging.",
      });

      if (res.data?.success) {
        toast.success("Advanced to Packaging phase.");
        await fetchBatchDetail();
        if (onRefreshList) onRefreshList();
      } else {
        toast.error(res.data?.message || "Failed to advance to packaging.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setStageLoading(false);
    }
  };

  // Handle Reject Batch (Only available during cooking/production)
  const handleRejectBatch = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason.");
      return;
    }
    if (!rejectCook.trim()) {
      toast.error("Please specify who was cooking.");
      return;
    }

    setRejectLoading(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${batchId}/reject`, {
        reason: rejectReason.trim(),
        assignedCook: rejectCook.trim(),
        proofImageUrl: rejectProofUrl.trim() || "proof-rejection.jpg",
        notes: rejectNotes.trim(),
      });

      if (res.data?.success) {
        toast.error(`Batch rejected. Loss Report ${res.data.data.lossReportNumber} generated.`);
        setShowRejectModal(false);
        if (onRefreshList) onRefreshList();
        onBack();
      } else {
        toast.error(res.data?.message || "Failed to reject batch.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setRejectLoading(false);
    }
  };

  // Handle Finish Packaging
  const handleFinishPackaging = async () => {
    if (!pkgPackedBy.trim()) {
      toast.error("Please specify who is assigned to pack.");
      return;
    }
    if (!pkgProofUrl.trim()) {
      toast.error("Proof of packaging photo is required.");
      return;
    }
    if (pkgQuantity <= 0) {
      toast.error("Please enter a valid packed quantity greater than zero.");
      return;
    }
    if (!pkgExpiryDate) {
      toast.error("Please enter the product expiry date.");
      return;
    }

    setPkgLoading(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${batchId}/packaging`, {
        packageDate: pkgDate || new Date(),
        expiryDate: pkgExpiryDate,
        packedBy: pkgPackedBy.trim(),
        proofImageUrl: pkgProofUrl.trim(),
        finalQuantity: pkgQuantity,
        notes: pkgNotes.trim(),
      });

      if (res.data?.success) {
        toast.success(`Packaging completed! Lot ${res.data.data.fgLotCode} forwarded to QA.`);
        setConfirmPackagingModal(false);
        if (onRefreshList) onRefreshList();
        // Since packaging is finished, it is no longer an active batch in kitchen tracking
        onBack();
      } else {
        toast.error(res.data?.message || "Failed to complete packaging.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setPkgLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
        Loading batch details...
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="p-8 text-center space-y-3">
        <p className="text-sm font-semibold text-foreground">Batch record not found.</p>
        <Button onClick={onBack} variant="outline" size="sm" className="text-xs">
          Back to Batches
        </Button>
      </div>
    );
  }

  const reqQty = Number(batch.requestedQty || batch.estimatedQuantity || 0);
  const isPackagingPhase = currentStage === "Packaging";
  const isQaPhase = status === "For QA" || currentStage === "For QA";
  const isPostQaPhase = status === "For Stock-in" || status === "Stocked In" || status === "Completed";

  return (
    <div className="space-y-5">
      {/* ── Top Header Bar matching mockups ── */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {batch.productName}
            </h2>
            {batch.variant && (
              <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded border border-border">
                {batch.variant}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-foreground text-background">
              <span className="w-1.5 h-1.5 rounded-full bg-background" />
              {status === "For QA" ? "For QA" : status === "For Stock-in" ? "For Stock-in" : status}
            </span>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              {batch.reqNumber || `PR-${batch.batchId}`}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1.5 flex-wrap">
            <span>
              Request qty{" "}
              <strong className="text-foreground font-semibold">
                {reqQty.toLocaleString()} {batch.yieldUom || "jars"}
              </strong>
            </span>
            <span>•</span>
            <span>
              Requested by{" "}
              <strong className="text-foreground">{batch.requestedBy || "Planning"}</strong>
            </span>
            <span>•</span>
            <span>
              Approved by{" "}
              <strong className="text-foreground">{batch.approvedBy || "Admin"}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="text-xs h-8 rounded-lg border-border hover:bg-muted font-semibold cursor-pointer"
          >
            ← Back to Batches
          </Button>
        </div>
      </div>

      {/* ── Sleek, Compact Progress Bar (Production -> Packaging) ── */}
      <div className="px-4 py-2.5 rounded-xl border border-border bg-card flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Workflow
        </span>

        <div className="flex items-center gap-4 sm:gap-8">
          <div className={`flex items-center gap-2 text-xs transition-colors ${
            currentStepIndex === 0 ? "font-bold text-foreground" : "text-muted-foreground"
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStepIndex > 0
                ? "bg-foreground text-background"
                : "border-2 border-foreground text-foreground"
            }`}>
              {currentStepIndex > 0 ? "✓" : "1"}
            </span>
            <span className="font-semibold">Production</span>
          </div>

          <div className="w-8 sm:w-16 h-px bg-border" />

          <div className={`flex items-center gap-2 text-xs transition-colors ${
            currentStepIndex === 1 ? "font-bold text-foreground" : "text-muted-foreground"
          }`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
              currentStepIndex === 1
                ? "border-2 border-foreground text-foreground"
                : "border border-border text-muted-foreground"
            }`}>
              2
            </span>
            <span className="font-semibold">Packaging</span>
          </div>
        </div>
      </div>

      {/* ── Main Body: Responsive Layout inside split view ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Main Stage Content (2 Cols on xl screens) */}
        <div className="xl:col-span-2 space-y-6">
          {/* ── PHASE 1: COOKING STAGES ── */}
          {!isPackagingPhase && !isQaPhase && !isPostQaPhase && (
            <div className="p-5 rounded-xl border border-border bg-card space-y-5">
              <div>
                <h3 className="text-base font-bold text-foreground">Kitchen Production Stages</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Follow sequential kitchen stages to produce the batch.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Stages for this Product
                </p>

                <div className="space-y-2">
                  {COOKING_STAGES.map((stName, idx) => {
                    const isDone = Boolean(stageLogs[stName]);
                    const isCurrent =
                      !isDone &&
                      (currentCookingStageIndex === idx || (currentCookingStageIndex === -1 && idx === 0));
                    const isWaiting = !isDone && !isCurrent;

                    return (
                      <div
                        key={stName}
                        className={`p-3.5 rounded-lg border transition-all ${
                          isCurrent
                            ? "border-foreground bg-muted/20"
                            : isDone
                            ? "border-border bg-card"
                            : "border-border/60 bg-muted/10 opacity-70"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-muted-foreground">
                              {idx + 1}.
                            </span>
                            <span className="text-xs font-bold text-foreground">{stName}</span>
                          </div>
                          <div>
                            {isDone ? (
                              <span className="text-[11px] font-mono text-muted-foreground">
                                ✓ Done ({formatTo12Hour(stageLogs[stName].endTime)})
                              </span>
                            ) : isCurrent ? (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-foreground text-background">
                                Current Stage
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">• Waiting</span>
                            )}
                          </div>
                        </div>

                        {/* Interactive inputs only for Current active stage */}
                        {isCurrent && (
                          <div className="mt-3 pt-3 border-t border-border/80 space-y-3 animate-in fade-in">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[11px] text-muted-foreground font-semibold">
                                    End Time (12-Hour) <span className="text-destructive">*</span>
                                  </Label>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const cur = getCurrent12HourTime();
                                      setStageHour(cur.hour);
                                      setStageMinute(cur.minute);
                                      setStagePeriod(cur.period);
                                    }}
                                    className="text-[10px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                                  >
                                    Set to Now
                                  </button>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={stageHour}
                                    onChange={(e) => setStageHour(e.target.value)}
                                    className="h-8 px-2 text-xs border border-border rounded-lg bg-background text-foreground font-mono font-bold"
                                  >
                                    {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0")).map((h) => (
                                      <option key={h} value={h}>{h}</option>
                                    ))}
                                  </select>
                                  <span className="text-muted-foreground font-bold">:</span>
                                  <select
                                    value={stageMinute}
                                    onChange={(e) => setStageMinute(e.target.value)}
                                    className="h-8 px-2 text-xs border border-border rounded-lg bg-background text-foreground font-mono font-bold"
                                  >
                                    {Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0")).map((m) => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                  <div className="flex rounded-lg border border-border overflow-hidden bg-background">
                                    <button
                                      type="button"
                                      onClick={() => setStagePeriod("AM")}
                                      className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors ${
                                        stagePeriod === "AM" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                    >
                                      AM
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setStagePeriod("PM")}
                                      className={`px-2 py-1 text-[11px] font-bold cursor-pointer transition-colors ${
                                        stagePeriod === "PM" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                                      }`}
                                    >
                                      PM
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground font-semibold">
                                  Stage Notes (Optional)
                                </Label>
                                <Input
                                  placeholder="Chef observations, temp, consistency"
                                  value={stageNotes}
                                  onChange={(e) => setStageNotes(e.target.value)}
                                  className="h-8 text-xs border-border bg-background"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end pt-1">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setConfirmStageModal(true)}
                                disabled={stageLoading}
                                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
                              >
                                {stageLoading ? "Completing..." : `Complete ${stName} (${formattedStageEndTime})`}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Packaging stage placeholder */}
                  <div className="p-3.5 rounded-lg border border-border/60 bg-muted/10 opacity-70 flex items-center justify-between text-xs">
                    <span className="font-semibold text-muted-foreground">Packaging</span>
                    <span className="text-[11px] text-muted-foreground">• After stages</span>
                  </div>
                </div>
              </div>

              {/* Bottom Action Controls after Cooling is done */}
              <div className="pt-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRejectModal(true)}
                  className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold cursor-pointer"
                >
                  Reject Batch
                </Button>

                {/* If all stages done, allow proceeding to Packaging */}
                {COOKING_STAGES.every((s) => Boolean(stageLogs[s])) && (
                  <Button
                    type="button"
                    onClick={handleProceedToPackaging}
                    disabled={stageLoading}
                    className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
                  >
                    Proceed to Packaging →
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── PHASE 2: PACKAGING ── */}
          {isPackagingPhase && (
            <div className="p-5 rounded-xl border border-border bg-card space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-base font-bold text-foreground">Packaging Details</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record packaging results, inspect final counts, and register Finished Goods lot.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
                  <p className="text-[11px] text-muted-foreground">Production Start Date</p>
                  <p className="text-xs font-bold text-foreground">
                    {batch.startedAt
                      ? new Date(batch.startedAt).toLocaleString("en-US", { hour12: true })
                      : new Date().toLocaleDateString()}
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/10 space-y-1">
                  <p className="text-[11px] text-muted-foreground">Target Request Quantity</p>
                  <p className="text-xs font-bold text-foreground">
                    {reqQty.toLocaleString()} {batch.yieldUom || "jars"}
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Packaging Date & Time <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="datetime-local"
                    value={pkgDate}
                    onChange={(e) => setPkgDate(e.target.value)}
                    className="h-9 text-xs border-border bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Product Expiry Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={pkgExpiryDate}
                    onChange={(e) => setPkgExpiryDate(e.target.value)}
                    className="h-9 text-xs border-border bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Assigned to Pack (Packer) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Packer full name"
                    value={pkgPackedBy}
                    onChange={(e) => setPkgPackedBy(e.target.value)}
                    className="h-9 text-xs border-border bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Packed Quantity ({batch.yieldUom || "jars"}) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={pkgQuantity || ""}
                    onChange={(e) => setPkgQuantity(Number(e.target.value))}
                    className="h-9 text-xs border-border bg-background font-mono font-bold"
                  />
                  {reqQty > 0 && pkgQuantity > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      Yield: {((pkgQuantity / reqQty) * 100).toFixed(1)}% of requested
                    </p>
                  )}
                </div>

                {/* Proof of Packaging via FileUploadField (same as delivery) */}
                <div className="sm:col-span-2">
                  <FileUploadField
                    label="Proof of Packaging / Photo Verification *"
                    helperText="Upload photo verification of packaged jars, sealing integrity, or lot labels"
                    accept="image/*,.pdf"
                    value={pkgProofUrl}
                    onChange={({ fileName, fileUrl }) => setPkgProofUrl(fileUrl || fileName)}
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-foreground">Packaging Remarks (Optional)</Label>
                  <Textarea
                    placeholder="Packaging notes, cap condition, label alignment..."
                    rows={2}
                    value={pkgNotes}
                    onChange={(e) => setPkgNotes(e.target.value)}
                    className="text-xs border-border bg-background"
                  />
                </div>
              </div>

              {/* In Packaging phase: strictly no Reject Batch button (rejection is production only) */}
              <div className="pt-3 border-t border-border flex items-center justify-end">
                <Button
                  type="button"
                  onClick={() => setConfirmPackagingModal(true)}
                  disabled={pkgLoading || !pkgPackedBy || !pkgProofUrl || pkgQuantity <= 0}
                  className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
                >
                  Finish Packaging & Send to QA
                </Button>
              </div>
            </div>
          )}

          {/* ── PHASE 3: PACKAGING COMPLETED & SUBMITTED TO QA ── */}
          {(isQaPhase || isPostQaPhase) && (
            <div className="p-6 rounded-xl border border-border bg-card space-y-5 animate-in fade-in">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Packaging Completed — Submitted to QA
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Kitchen cooking and packaging are complete. The finished goods lot has been forwarded to Quality Assurance for inspection.
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-border bg-muted/10 text-xs">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">FINISHED GOODS LOT</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {batch.fgLotCode || "CCS-261008-01"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">MFG DATE</p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {batch.packagedAt
                      ? new Date(batch.packagedAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "08 Oct 2026"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">EXPIRY DATE</p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {batch.expiryDate
                      ? new Date(batch.expiryDate).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "08 Oct 2027"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">REQUEST QTY</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {reqQty.toLocaleString()} {batch.yieldUom || "jars"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">PACKED QTY</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {Number(batch.finalQuantity || batch.actualQuantity).toLocaleString()} {batch.yieldUom || "jars"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">KITCHEN YIELD</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {Number(batch.yieldPercentage || 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Status Note */}
              <div className="p-3.5 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">Next Step: Quality Assurance</p>
                <p className="text-[11px] leading-relaxed">
                  The QA Officer will inspect seal integrity, vacuum levels, fill weights, and sensory attributes under the <strong>Quality Assurance</strong> tab. Once verified, approved units will be made available for <strong>Stock-In</strong>.
                </p>
              </div>

              <div className="pt-2 flex justify-start">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onBack}
                  className="text-xs font-semibold border-border hover:bg-muted cursor-pointer"
                >
                  ← Back to Active Batches
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Materials Only (Activity timeline removed per user instruction) */}
        <div className="space-y-5">
          {/* ── Materials Card ── */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-border/60">
              <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Reserved Materials
              </h4>
              <span className="text-[10px] text-muted-foreground font-mono">BOM Verification</span>
            </div>

            <div className="divide-y divide-border/60 text-xs">
              {(batch.reservations && batch.reservations.length > 0
                ? batch.reservations
                : batch.consumptions
              ).map((m: any, idx: number) => (
                <div key={idx} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-foreground block">{m.itemName}</span>
                    {m.lotNumber && (
                      <span className="font-mono text-[10px] text-muted-foreground block">
                        Lot: {m.lotNumber}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-semibold text-foreground text-xs">
                    {Number(m.reservedQuantity ?? m.quantityUsed ?? m.requiredQuantity)} {m.uomAbbr || "kg"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal: Complete Stage ── */}
      {mounted && confirmStageModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setConfirmStageModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: "440px" }}
            className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col p-6 text-foreground shrink-0 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-foreground shrink-0">
                <CheckCircle2 className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Confirm Stage Completion
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Are you sure you want to mark{" "}
                <strong className="text-foreground">
                  {currentCookingStageIndex >= 0 ? COOKING_STAGES[currentCookingStageIndex] : "Current Stage"}
                </strong>{" "}
                as complete at <strong className="text-foreground">{formattedStageEndTime}</strong>?
              </p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                You cannot return to this stage once confirmed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmStageModal(false)}
                className="text-xs border-border hover:bg-muted font-medium cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCompleteCurrentStage}
                disabled={stageLoading}
                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
              >
                {stageLoading ? "Confirming..." : "Confirm & Proceed"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Confirmation Modal: Finish Packaging ── */}
      {mounted && confirmPackagingModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setConfirmPackagingModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: "440px" }}
            className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col p-6 text-foreground shrink-0 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-foreground shrink-0">
                <Package className="w-6 h-6 text-foreground" />
              </div>
              <h3 className="text-base font-bold text-foreground">
                Confirm Packaging Finish
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                This will finalize{" "}
                <strong className="text-foreground">
                  {pkgQuantity.toLocaleString()} {batch.yieldUom || "jars"}
                </strong>
                , register the Finished Goods lot, and advance the batch to{" "}
                <strong className="text-foreground">Quality Assurance</strong>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmPackagingModal(false)}
                className="text-xs border-border hover:bg-muted font-medium cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleFinishPackaging}
                disabled={pkgLoading}
                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
              >
                {pkgLoading ? "Submitting..." : "Confirm & Send to QA"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Reject Batch Modal ── */}
      {mounted && showRejectModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowRejectModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: "480px" }}
            className="w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col p-6 text-foreground shrink-0 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border pb-3">
              <div className="w-10 h-10 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Reject Production Batch
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Record reason and details for batch rejection.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">
                  Reason for Rejection <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., Burned during cooking, foreign smell, broken seal"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="h-8 text-xs border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">
                  Assigned Cook / In-Charge <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={rejectCook}
                  onChange={(e) => setRejectCook(e.target.value)}
                  className="h-8 text-xs border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">
                  Proof of Picture / Photo Attachment <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="rejection_defect_photo.jpg"
                  value={rejectProofUrl}
                  onChange={(e) => setRejectProofUrl(e.target.value)}
                  className="h-8 text-xs border-border bg-background"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Additional Notes</Label>
                <Textarea
                  placeholder="Detailed notes regarding incident..."
                  rows={2}
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  className="text-xs border-border bg-background"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRejectModal(false)}
                className="text-xs border-border hover:bg-muted font-medium cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleRejectBatch}
                disabled={rejectLoading || !rejectReason.trim()}
                className="text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer shadow-xs"
              >
                {rejectLoading ? "Rejecting..." : "Confirm Batch Rejection"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
