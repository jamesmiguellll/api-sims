"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface ProductionQaTabProps {
  isQaOfficer: boolean;
  isAdmin: boolean;
  currentUser?: string;
  onSwitchToQaOfficer?: () => void;
}

export default function ProductionQaTab({
  isQaOfficer,
  isAdmin,
  currentUser = "Ramon Dela Cruz",
  onSwitchToQaOfficer,
}: ProductionQaTabProps) {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [subTab, setSubTab] = useState<"pending" | "completed">("pending");

  // QA Form fields
  const [acceptedQty, setAcceptedQty] = useState<number>(0);
  const [acceptedReason, setAcceptedReason] = useState<string>("Meets All Sensory & Packaging Standards");
  const [rejectedQty, setRejectedQty] = useState<number>(0);
  const [rejectedReason, setRejectedReason] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    sealIntegrity: true,
    labelClarity: true,
    colorConsistency: true,
    flavorProfile: true,
    fillWeightTolerance: true,
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmModal, setConfirmModal] = useState<boolean>(false);

  // Fetch batches
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/production-qa?status=${subTab}`);
      if (res.data?.success && Array.isArray(res.data.data)) {
        setBatches(res.data.data);
        if (res.data.data.length > 0 && !selectedBatchId) {
          setSelectedBatchId(res.data.data[0].batchId);
          setAcceptedQty(res.data.data[0].packedQty);
          setRejectedQty(0);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load QA batches.");
    } finally {
      setLoading(false);
    }
  }, [subTab, selectedBatchId]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const selectedBatch = batches.find((b) => b.batchId === selectedBatchId) || null;

  // When changing batch selection
  const handleSelectBatch = (b: any) => {
    setSelectedBatchId(b.batchId);
    setAcceptedQty(b.packedQty || 0);
    setRejectedQty(0);
    setRejectedReason("");
    setRemarks("");
  };

  // Submit QA Inspection
  const handleSubmitQa = async () => {
    if (!selectedBatch) return;

    const totalPacked = selectedBatch.packedQty;
    if (acceptedQty + rejectedQty !== totalPacked) {
      toast.error(
        `Accepted (${acceptedQty}) + Rejected (${rejectedQty}) must equal total packed units (${totalPacked}).`
      );
      return;
    }

    if (acceptedQty > 0 && !acceptedReason) {
      toast.error("Please select an acceptance reason.");
      return;
    }

    if (rejectedQty > 0 && !rejectedReason) {
      toast.error("Please select a rejection reason for rejected units.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/api/production-qa", {
        batchId: selectedBatch.batchId,
        acceptedQuantity: acceptedQty,
        acceptedReason,
        rejectedQuantity: rejectedQty,
        rejectedReason,
        remarks,
        checklist,
        inspectorName: currentUser || "Ramon Dela Cruz",
      });

      if (res.data?.success) {
        toast.success(
          `QA inspection completed under ${res.data.data.pqaNumber}! Status: ${res.data.data.status}`
        );
        if (res.data.data.lossReportNumber) {
          toast.warning(`Loss report ${res.data.data.lossReportNumber} generated for rejected units.`);
        }
        setConfirmModal(false);
        setSelectedBatchId(null);
        fetchBatches();
      } else {
        toast.error(res.data?.message || "Failed to submit QA inspection.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  const isReadOnly = !isQaOfficer;

  return (
    <div className="space-y-6 animate-page-in">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Quality Assurance Review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect finished production lots, verify sensory and packaging parameters, and approve for stock-in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isQaOfficer && onSwitchToQaOfficer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSwitchToQaOfficer}
              className="text-xs h-8 rounded-lg border-border font-semibold cursor-pointer"
            >
              Switch to Ramon (QA Officer)
            </Button>
          )}
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

      {/* ── Notice for non-QA officers matching Screenshot 1 ── */}
      {!isQaOfficer && (
        <div className="p-3.5 rounded-xl border border-border bg-muted/20 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground font-medium">
            Only the QA Officer can perform and submit QA reviews.
          </span>
          {onSwitchToQaOfficer && (
            <Button
              type="button"
              size="sm"
              onClick={onSwitchToQaOfficer}
              className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
            >
              Switch to Ramon
            </Button>
          )}
        </div>
      )}

      {/* ── Subtab Navigation (Pending QA & Completed QA) ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSubTab("pending");
            setSelectedBatchId(null);
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            subTab === "pending"
              ? "bg-foreground text-background shadow-xs"
              : "border border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>Pending Inspection</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSubTab("completed");
            setSelectedBatchId(null);
          }}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            subTab === "completed"
              ? "bg-foreground text-background shadow-xs"
              : "border border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>Cleared / Completed QA</span>
        </button>
      </div>

      {/* ── Main Layout: Batch List & QA Form ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left List of Batches in this subtab */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {subTab === "pending" ? "Batches Awaiting QA" : "Inspected Batches"}
          </p>

          <div className="space-y-2">
            {loading ? (
              <div className="p-6 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
                Loading batches...
              </div>
            ) : batches.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground rounded-xl border border-border bg-card">
                No batches found in this view.
              </div>
            ) : (
              batches.map((b) => {
                const isSelected = b.batchId === selectedBatchId;
                return (
                  <div
                    key={b.batchId}
                    onClick={() => handleSelectBatch(b)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-foreground bg-muted/20 shadow-xs"
                        : "border-border bg-card hover:bg-muted/10"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-foreground">{b.fgLotCode || b.batchNumber}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-card font-semibold text-foreground">
                        {b.status}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-foreground mt-1">{b.productName}</div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2 font-mono">
                      <span>Packed: {b.packedQty.toLocaleString()}</span>
                      <span>Yield: {b.yieldPercentage.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right QA Inspection Card (matching Screenshot 1) */}
        <div className="lg:col-span-2">
          {selectedBatch ? (
            <div className="p-5 rounded-xl border border-border bg-card space-y-5 animate-in fade-in">
              <div>
                <h3 className="text-base font-bold text-foreground">QA review</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Count what passed and what failed. Passed units go to stock. Failed units go to loss and disposal.
                </p>
              </div>

              {/* Summary Metadata Grid matching Screenshot 1 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-border bg-muted/10 text-xs">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">FINISHED GOODS LOT</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {selectedBatch.fgLotCode || "CCS-261008-01"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">MFG DATE</p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {new Date(selectedBatch.mfgDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">EXPIRY</p>
                  <p className="font-semibold text-foreground mt-0.5">
                    {selectedBatch.expiryDate
                      ? new Date(selectedBatch.expiryDate).toLocaleDateString("en-GB", {
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
                    {selectedBatch.requestQty.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">PACKED QTY</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {selectedBatch.packedQty.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground">YIELD</p>
                  <p className="font-mono font-bold text-foreground mt-0.5">
                    {selectedBatch.yieldPercentage.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Form Controls */}
              {subTab === "pending" ? (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Accepted Input */}
                    <div className="space-y-2 p-3 rounded-lg border border-border bg-card">
                      <Label className="text-xs font-bold text-foreground">
                        Accepted (units) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={selectedBatch.packedQty}
                        value={acceptedQty}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setAcceptedQty(val);
                          setRejectedQty(Math.max(0, selectedBatch.packedQty - val));
                        }}
                        className="h-9 text-xs border-border bg-background font-mono font-bold"
                      />

                      {acceptedQty > 0 && (
                        <div className="space-y-1 pt-1 animate-in fade-in">
                          <Label className="text-[11px] text-muted-foreground">Acceptance Reason</Label>
                          <Select
                            value={acceptedReason}
                            onValueChange={setAcceptedReason}
                            disabled={isReadOnly}
                          >
                            <SelectTrigger className="h-8 text-xs border-border bg-background">
                              <SelectValue placeholder="Select reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Meets All Sensory & Packaging Standards">
                                Meets All Sensory & Packaging Standards
                              </SelectItem>
                              <SelectItem value="Approved with Minor Packaging Tolerance">
                                Approved with Minor Packaging Tolerance
                              </SelectItem>
                              <SelectItem value="Within Critical Chemical & Physical Limits">
                                Within Critical Chemical & Physical Limits
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Rejected Input */}
                    <div className="space-y-2 p-3 rounded-lg border border-border bg-card">
                      <Label className="text-xs font-bold text-foreground">
                        Rejected (units) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max={selectedBatch.packedQty}
                        value={rejectedQty}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const val = Math.max(0, Number(e.target.value));
                          setRejectedQty(val);
                          setAcceptedQty(Math.max(0, selectedBatch.packedQty - val));
                        }}
                        className="h-9 text-xs border-border bg-background font-mono font-bold text-destructive"
                      />

                      {rejectedQty > 0 && (
                        <div className="space-y-1 pt-1 animate-in fade-in">
                          <Label className="text-[11px] text-muted-foreground">Rejection Reason</Label>
                          <Select
                            value={rejectedReason}
                            onValueChange={setRejectedReason}
                            disabled={isReadOnly}
                          >
                            <SelectTrigger className="h-8 text-xs border-border bg-background">
                              <SelectValue placeholder="Select defect reason" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Improper Seal / Leakage">Improper Seal / Leakage</SelectItem>
                              <SelectItem value="Off-Flavor / Color Discrepancy">Off-Flavor / Color Discrepancy</SelectItem>
                              <SelectItem value="Contamination / Foreign Matter">Contamination / Foreign Matter</SelectItem>
                              <SelectItem value="Incorrect Fill Weight / Volume">Incorrect Fill Weight / Volume</SelectItem>
                              <SelectItem value="Damaged Jar / Cap / Label">Damaged Jar / Cap / Label</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-[10px] text-destructive pt-1">
                            Notice: Rejected units will automatically log a Loss Report in Loss & Disposal.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="p-3 rounded-lg border border-border bg-card space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Quality Inspection Checklist
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[
                        { key: "sealIntegrity", label: "Packaging seal integrity & tightness" },
                        { key: "labelClarity", label: "Label accuracy & expiry date clarity" },
                        { key: "colorConsistency", label: "Visual appearance & color consistency" },
                        { key: "flavorProfile", label: "Aroma & sensory flavor profile" },
                        { key: "fillWeightTolerance", label: "Fill weight within tolerance bounds" },
                      ].map((item) => (
                        <label key={item.key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checklist[item.key] ?? true}
                            disabled={isReadOnly}
                            onChange={(e) =>
                              setChecklist((prev) => ({ ...prev, [item.key]: e.target.checked }))
                            }
                            className="rounded border-border"
                          />
                          <span className="text-foreground">{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-foreground">Remarks (Optional)</Label>
                    <Textarea
                      placeholder="Add sensory findings, inspector observations..."
                      rows={2}
                      value={remarks}
                      disabled={isReadOnly}
                      onChange={(e) => setRemarks(e.target.value)}
                      className="text-xs border-border bg-background"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end pt-2">
                    <Button
                      type="button"
                      disabled={isReadOnly || submitting}
                      onClick={() => setConfirmModal(true)}
                      className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
                    >
                      Confirm & Sign Off QA Review
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-border bg-muted/20 text-xs space-y-1">
                  <p className="font-bold text-foreground">Inspection Completed</p>
                  <p className="text-muted-foreground text-[11px]">
                    This batch has passed QA and is ready for inventory stock-in.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center border border-border rounded-xl bg-card text-xs text-muted-foreground">
              Select a batch from the list on the left to begin quality inspection.
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 space-y-4 shadow-xl">
            <div>
              <h4 className="text-sm font-bold text-foreground">Confirm Quality Assurance Review</h4>
              <p className="text-xs text-muted-foreground mt-1">
                You are approving <strong>{acceptedQty} units</strong> to proceed to stock-in
                {rejectedQty > 0 ? ` and logging ${rejectedQty} units to Loss & Disposal` : ""}. This action is permanent.
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
                onClick={handleSubmitQa}
                disabled={submitting}
                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/85 cursor-pointer shadow-xs"
              >
                {submitting ? "Signing Off..." : "Sign Off & Complete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
