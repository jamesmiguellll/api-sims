"use client";

import React, { useState, useEffect } from "react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MaterialIssuanceDTO, LotReservationDTO } from "./types";
import QrScannerModal from "./QrScannerModal";

interface MaterialIssuanceModalProps {
  open: boolean;
  onClose: () => void;
  issuanceId: number | null;
  onSuccess: () => void;
}

export default function MaterialIssuanceModal({
  open,
  onClose,
  issuanceId,
  onSuccess,
}: MaterialIssuanceModalProps) {
  const [issuance, setIssuance] = useState<MaterialIssuanceDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [issuing, setIssuing] = useState<boolean>(false);

  // Scanner modal state for a specific lot
  const [scannerOpen, setScannerOpen] = useState<boolean>(false);
  const [selectedLotForScan, setSelectedLotForScan] = useState<LotReservationDTO | null>(null);

  // Fetch Issuance Details
  const fetchDetails = async () => {
    if (!issuanceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/material-issuances/${issuanceId}`);
      if (res.data?.success && res.data.data) {
        setIssuance(res.data.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load material issuance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && issuanceId) {
      fetchDetails();
    }
  }, [open, issuanceId]);

  if (!issuanceId) return null;

  // Track verified lots
  const verifiedLotIds = new Set(
    (issuance?.scans ?? []).filter((s) => s.isVerified).map((s) => s.lotId)
  );

  const totalLots = issuance?.reservations?.length ?? 0;
  const verifiedCount = issuance?.reservations?.filter((r) => verifiedLotIds.has(r.lotId)).length ?? 0;
  const allVerified = totalLots > 0 && verifiedCount === totalLots;
  const isAlreadyIssued = issuance?.status === "Issued";

  // Open Scanner for a specific lot
  const handleOpenScanForLot = (res: LotReservationDTO) => {
    setSelectedLotForScan(res);
    setScannerOpen(true);
  };

  // When a lot is successfully scanned
  const handleScanSuccess = async (scannedLotCode: string) => {
    if (!selectedLotForScan) return;

    try {
      const res = await api.post(`/api/material-issuances/${issuanceId}/scan`, {
        qrRaw: scannedLotCode,
        ingredientId: selectedLotForScan.ingredientId,
        scannedBy: issuance?.issuedBy || "Inventory Manager",
      });

      if (res.data?.success && res.data.verified) {
        toast.success(`Lot ${scannedLotCode} verified successfully!`);
        fetchDetails();
      } else {
        toast.error(res.data?.message || "Lot verification failed.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to record scan.");
    } finally {
      setScannerOpen(false);
      setSelectedLotForScan(null);
    }
  };

  // Final Issue Materials
  const handleIssueMaterials = async () => {
    if (!allVerified && !isAlreadyIssued) {
      toast.error("Please verify all ingredient lots by QR code scan before issuing.");
      return;
    }

    setIssuing(true);
    try {
      const res = await api.post(`/api/material-issuances/${issuanceId}/issue`, {
        issuedBy: issuance?.issuedBy || "Inventory Manager",
      });

      if (res.data?.success) {
        toast.success("Materials successfully issued! Ready for production.");
        onSuccess();
        onClose();
      } else {
        toast.error(res.data?.message || "Failed to issue materials.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred during issuance.");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <>
      <ModalWrapper
        open={open}
        title={`Material Issuance: ${issuance?.issuanceNumber || "Loading..."}`}
        onClose={onClose}
        size="max-w-4xl"
      >
        <div className="space-y-6 overflow-y-auto max-h-[calc(85vh-120px)] pr-1">
          {/* Header Summary Card (Minimalist Monochromatic) */}
          {issuance && (
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 border border-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground text-sm">{issuance.productName}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>Request No: {issuance.reqNumber}</span>
                  <span>•</span>
                  <span>Recipe: {issuance.recipeName}</span>
                  <span>•</span>
                  <span>Target: {issuance.requestQuantity} units</span>
                  <span>•</span>
                  <span>Issued By: {issuance.issuedBy}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={issuance.status} />
              </div>
            </div>
          )}

          {/* Verification Progress (Monochromatic) */}
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">Verification Progress</span>
              <span className="font-mono font-bold text-foreground">
                {verifiedCount} of {totalLots} lots verified ({totalLots > 0 ? Math.round((verifiedCount / totalLots) * 100) : 0}%)
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${totalLots > 0 ? (verifiedCount / totalLots) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Reserved Materials List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Material Lot Verification
            </h4>

            <div className="border border-border rounded-xl overflow-hidden bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold text-muted-foreground">Ingredient Name</th>
                      <th className="py-2.5 px-4 font-semibold text-muted-foreground">Supply No.</th>
                      <th className="py-2.5 px-4 font-semibold text-muted-foreground">Suggested Lot</th>
                      <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Reserved Qty</th>
                      <th className="py-2.5 px-4 font-semibold text-muted-foreground">Expiry Date</th>
                      <th className="py-2.5 px-4 font-semibold text-muted-foreground text-center">Scan QR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {issuance?.reservations?.map((res) => {
                      const isVerified = verifiedLotIds.has(res.lotId);

                      return (
                        <tr
                          key={res.reservationId}
                          className="hover:bg-muted/10 transition-colors"
                        >
                          {/* Ingredient Name */}
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {res.itemName}
                          </td>

                          {/* Supply No. */}
                          <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                            {res.itemCode || "—"}
                          </td>

                          {/* Suggested Lot Code */}
                          <td className="py-3 px-4 font-mono font-medium text-foreground whitespace-nowrap">
                            <span className="bg-muted/60 px-2 py-0.5 rounded border border-border">
                              {res.lotCode}
                            </span>
                          </td>

                          {/* Reserved Quantity */}
                          <td className="py-3 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                            {res.reservedQuantity}
                          </td>

                          {/* Expiry Date */}
                          <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                            {res.expiryDate ? new Date(res.expiryDate).toLocaleDateString() : "—"}
                          </td>

                          {/* Scan QR Action */}
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isVerified || isAlreadyIssued ? (
                              <span className="inline-flex items-center text-[11px] font-semibold text-background bg-foreground border border-foreground px-2.5 py-0.5 rounded-full">
                                Verified ✓
                              </span>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenScanForLot(res)}
                                className="h-7 text-xs font-semibold px-3 rounded-lg border-border hover:bg-muted text-foreground transition-colors"
                              >
                                Scan QR
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {(!issuance?.reservations || issuance.reservations.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                          No material reservations recorded for this issuance.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="text-xs font-semibold rounded-xl border-border hover:bg-muted"
            >
              Close
            </Button>

            {!isAlreadyIssued ? (
              <Button
                type="button"
                onClick={handleIssueMaterials}
                disabled={!allVerified || issuing}
                className={`text-xs font-semibold px-6 py-2 rounded-xl transition-all shadow-sm ${
                  allVerified
                    ? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {issuing ? "Issuing..." : "Issue Materials"}
              </Button>
            ) : (
              <span className="text-xs font-semibold text-foreground bg-muted border border-border px-3 py-1.5 rounded-xl">
                Materials Issued
              </span>
            )}
          </div>
        </div>
      </ModalWrapper>

      {/* QR Scanner Modal for individual lot */}
      <QrScannerModal
        open={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setSelectedLotForScan(null);
        }}
        itemName={selectedLotForScan?.itemName}
        suggestedLot={selectedLotForScan?.lotCode}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
