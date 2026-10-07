"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ProductionBatchEntity } from "./types";

export const COOKING_STAGES = [
  "Steaming",
  "Peeling",
  "Grinding",
  "Mixing",
  "Cooking",
  "Cooling",
] as const;

export const WORKFLOW_STEPS = [
  "Approved",
  "Issuance",
  "Production",
  "Packaging",
  "QA",
  "Stock-in",
] as const;

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
  const [batch, setBatch] = useState<ProductionBatchEntity | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Active cooking stage inputs
  const [stageEndTime, setStageEndTime] = useState<string>("");
  const [stageNotes, setStageNotes] = useState<string>("");
  const [stageLoading, setStageLoading] = useState<boolean>(false);
  const [confirmStageModal, setConfirmStageModal] = useState<boolean>(false);

  // Reject Batch modal state
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

  // Parse activity and stage logs from batch.notes
  const { stageLogs, activityLogs } = useMemo(() => {
    const sLogs: Record<string, { endTime: string; by: string; notes?: string }> = {};
    const aLogs: Array<{ dateStr: string; title: string; actor: string }> = [];

    const notesStr = batch?.notes || "";
    const lines = notesStr.split("\n");

    for (const line of lines) {
      // Stage log parse
      const stageMatch = line.match(/\[STAGE:([^|]+)\|END:([^|]+)\|BY:([^|\]]+)(?:\|NOTES:([^\]]+))?\]/);
      if (stageMatch) {
        sLogs[stageMatch[1]] = {
          endTime: stageMatch[2],
          by: stageMatch[3],
          notes: stageMatch[4],
        };
      }

      // Activity log parse
      const actMatch = line.match(/\[ACTIVITY:([^|]+)\|TITLE:([^|]+)\|ACTOR:([^\]]+)\]/);
      if (actMatch) {
        try {
          const d = new Date(actMatch[1]);
          const dateStr = d.toLocaleDateString("en-US", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          aLogs.unshift({ dateStr, title: actMatch[2], actor: actMatch[3] });
        } catch {
          aLogs.unshift({ dateStr: "Recent", title: actMatch[2], actor: actMatch[3] });
        }
      }
    }

    // Default activity if empty
    if (aLogs.length === 0 && batch?.startedAt) {
      try {
        const d = new Date(batch.startedAt);
        const dateStr = d.toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        aLogs.push({
          dateStr,
          title: "Production batch initialized & ready for cooking",
          actor: batch.assignedCook || "Head Cook",
        });
      } catch {
        // ignore
      }
    }

    return { stageLogs: sLogs, activityLogs: aLogs };
  }, [batch?.notes, batch?.startedAt, batch?.assignedCook]);

  // Stepper current active index calculation
  const currentStepIndex = useMemo(() => {
    if (status === "Stocked In" || status === "Completed") return 5; // Stock-in done
    if (status === "For Stock-in") return 5;
    if (status === "For QA") return 4; // QA
    if (currentStage === "Packaging" || status === "For Packaging") return 3; // Packaging
    return 2; // Production
  }, [status, currentStage]);

  // Determine stage progression in cooking
  const currentCookingStageIndex = COOKING_STAGES.indexOf(currentStage as any);
  const isCookingComplete =
    currentCookingStageIndex === -1 &&
    (currentStage === "Packaging" || status === "For QA" || status === "For Stock-in" || status === "Stocked In");

  // Handle Complete Stage
  const handleCompleteCurrentStage = async () => {
    if (!stageEndTime) {
      toast.error("Please enter the end time for this stage.");
      return;
    }

    const stageToComplete =
      currentCookingStageIndex >= 0 ? COOKING_STAGES[currentCookingStageIndex] : COOKING_STAGES[0];

    setStageLoading(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${batchId}/stages/complete`, {
        stage: stageToComplete,
        endTime: stageEndTime,
        notes: stageNotes,
        completedBy: currentUser,
      });

      if (res.data?.success) {
        toast.success(`Stage ${stageToComplete} completed!`);
        setStageEndTime("");
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

  // Handle Reject Batch
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
      toast.error("Photo proof of packaging is required.");
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
        toast.success(`Packaging completed! Lot ${res.data.data.fgLotCode} sent to QA.`);
        setConfirmPackagingModal(false);
        await fetchBatchDetail();
        if (onRefreshList) onRefreshList();
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
    <div className="space-y-6">
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

      {/* ── Monochromatic Stepper Header ── */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between relative max-w-4xl mx-auto px-4">
          {/* Connector Line */}
          <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-0.5 bg-border -z-0" />

          {WORKFLOW_STEPS.map((stepName, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isCurrent = idx === currentStepIndex;
            return (
              <div key={stepName} className="flex flex-col items-center gap-1.5 z-10 bg-card px-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCompleted
                      ? "bg-foreground text-background shadow-xs"
                      : isCurrent
                      ? "border-2 border-foreground bg-background text-foreground"
                      : "border border-border bg-muted/30 text-muted-foreground"
                  }`}
                >
                  {isCompleted ? "✓" : idx + 1}
                </div>
                <span
                  className={`text-[11px] font-medium tracking-tight ${
                    isCurrent
                      ? "font-bold text-foreground"
                      : isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {stepName}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main Body: 2-Column Responsive Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2 Cols wide on desktop): Main Stage Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* ── PHASE 1: COOKING STAGES ── */}
          {!isPackagingPhase && !isQaPhase && !isPostQaPhase && (
            <div className="p-5 rounded-xl border border-border bg-card space-y-5">
              <div>
                <h3 className="text-base font-bold text-foreground">Ready for production</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  All materials are issued. Follow sequential kitchen stages to prepare the batch.
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
                                ✓ Done ({stageLogs[stName].endTime})
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">
                                  End Time <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  type="time"
                                  value={stageEndTime}
                                  onChange={(e) => setStageEndTime(e.target.value)}
                                  className="h-8 text-xs border-border bg-background"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[11px] text-muted-foreground">
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
                                disabled={stageLoading || !stageEndTime}
                                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
                              >
                                {stageLoading ? "Completing..." : `Complete ${stName}`}
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
                      ? new Date(batch.startedAt).toLocaleString()
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

                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-foreground">
                    Proof of Packaging / Photo Attachment <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Photo file name or URL (e.g., packaged_batch_verification.jpg)"
                    value={pkgProofUrl}
                    onChange={(e) => setPkgProofUrl(e.target.value)}
                    className="h-9 text-xs border-border bg-background"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required: Attach visual confirmation of sealed jars and batch labels.
                  </p>
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

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRejectModal(true)}
                  className="text-xs border-destructive/40 text-destructive hover:bg-destructive/10 font-semibold cursor-pointer"
                >
                  Reject Batch
                </Button>

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

          {/* ── PHASE 3: FOR QA / SUMMARY ── */}
          {(isQaPhase || isPostQaPhase) && (
            <div className="p-5 rounded-xl border border-border bg-card space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">QA review</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Count what passed and what failed. Passed units go to stock. Failed units go to loss and disposal.
                  </p>
                </div>
                {onSwitchToQaOfficer && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onSwitchToQaOfficer}
                    className="text-xs border-border font-semibold cursor-pointer"
                  >
                    Switch to Ramon (QA)
                  </Button>
                )}
              </div>

              {/* Summary Metadata Grid matching Screenshot 1 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-border bg-muted/10 text-xs">
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
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">EXPIRY</p>
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
                    {reqQty.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">PACKED QTY</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {Number(batch.finalQuantity || batch.actualQuantity).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">YIELD</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {Number(batch.yieldPercentage || 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-border/80 bg-muted/20 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">QA Inspection Notice</p>
                <p className="mt-0.5 text-[11px]">
                  Quality Assurance inspection is conducted under the <strong>Quality Assurance</strong> tab by the QA Officer (Ramon).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Materials & Activity Sidebars */}
        <div className="space-y-6">
          {/* ── Materials Card matching mockups ── */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Materials
            </h4>

            <div className="divide-y divide-border/60 text-xs">
              {(batch.reservations && batch.reservations.length > 0
                ? batch.reservations
                : batch.consumptions
              ).map((m: any, idx: number) => (
                <div key={idx} className="py-2 flex items-center justify-between">
                  <span className="font-medium text-foreground">{m.itemName}</span>
                  <span className="font-mono font-semibold text-muted-foreground">
                    {Number(m.reservedQuantity ?? m.quantityUsed ?? m.requiredQuantity)} {m.uomAbbr || "kg"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Activity Timeline matching mockups ── */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-3">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Activity
            </h4>

            <div className="space-y-3 text-xs">
              {activityLogs.map((act, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {act.dateStr}
                  </span>
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <p className="font-semibold text-foreground leading-tight text-[11px]">
                      {act.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{act.actor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation Modal: Complete Stage ── */}
      {confirmStageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl">
            <div>
              <h4 className="text-sm font-bold text-foreground">Confirm Stage Completion</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Are you sure you want to mark this stage as complete at <strong>{stageEndTime}</strong>? You cannot return to this stage once confirmed.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmStageModal(false)}
                className="text-xs border-border"
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
        </div>
      )}

      {/* ── Confirmation Modal: Finish Packaging ── */}
      {confirmPackagingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl">
            <div>
              <h4 className="text-sm font-bold text-foreground">Confirm Packaging Finish</h4>
              <p className="text-xs text-muted-foreground mt-1">
                This will finalize packed units ({pkgQuantity} {batch.yieldUom || "jars"}), register the Finished Goods lot, and advance the batch to Quality Assurance.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmPackagingModal(false)}
                className="text-xs border-border"
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
        </div>
      )}

      {/* ── Reject Batch Modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl">
            <div>
              <h4 className="text-sm font-bold text-destructive">Reject Production Batch</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Rejecting this batch will remove it from active batches and automatically generate a Loss Report in Loss & Disposal.
              </p>
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

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRejectModal(false)}
                className="text-xs border-border"
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
        </div>
      )}
    </div>
  );
}
