"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Upload, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import api from "@/lib/api";
import { Delivery } from "../types";

interface MarkDispatchedModalProps {
  delivery: Delivery | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CARRIER_OPTIONS = [
  "Supplier Truck",
  "In-House Logistics",
  "Third-Party Logistics (3PL)",
  "Lalamove",
  "Transportify",
  "DHL Express",
  "J&T Express",
  "Other Logistics (Specify)",
];

export function MarkDispatchedModal({
  delivery,
  onClose,
  onSuccess,
}: MarkDispatchedModalProps) {
  if (!delivery) return null;

  const [dispatchedDate, setDispatchedDate] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [carrier, setCarrier] = useState(
    delivery.carrier || CARRIER_OPTIONS[0]
  );
  const [customCarrier, setCustomCarrier] = useState("");
  const [driverName, setDriverName] = useState(delivery.driverName || "");
  const [vehiclePlateNumber, setVehiclePlateNumber] = useState(
    delivery.vehiclePlateNumber || ""
  );
  const [dispatchAttachmentBase64, setDispatchAttachmentBase64] = useState("");
  const [attachmentFileName, setAttachmentFileName] = useState("");
  const [confirmModal, setConfirmModal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalCarrier =
    carrier === "Other Logistics (Specify)"
      ? customCarrier.trim() || "Other Logistics"
      : carrier;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      setError("File exceeds 8MB limit.");
      return;
    }

    setAttachmentFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setDispatchAttachmentBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    setError(null);

    if (!dispatchedDate) {
      setError("Please specify the dispatch date and time.");
      return;
    }

    if (!finalCarrier) {
      setError("Please select or specify a carrier.");
      return;
    }

    if (!dispatchAttachmentBase64) {
      setError("Dispatch proof or photo is required before confirming dispatch.");
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        dispatchedDate: new Date(dispatchedDate).toISOString(),
        carrier: finalCarrier,
        driverName: driverName.trim() || null,
        vehiclePlateNumber: vehiclePlateNumber.trim() || null,
        dispatchAttachmentBase64: dispatchAttachmentBase64,
        attachmentUrl: dispatchAttachmentBase64,
      };

      const res = await api.put(
        `/api/deliveries/${delivery.deliveryId}/dispatch`,
        payload
      );

      if (res.data?.success) {
        onSuccess();
      } else {
        setError(res.data?.message || "Failed to dispatch delivery.");
      }
    } catch (err: any) {
      console.error("Dispatch error:", err);
      setError(
        err?.response?.data?.message ||
          "An unexpected error occurred while dispatching delivery."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper
      open={!!delivery}
      title={`Dispatch Delivery — ${delivery.deliveryNumber}`}
      onClose={onClose}
      size="max-w-2xl"
    >
      <form onSubmit={(e) => { e.preventDefault(); setConfirmModal(true); }} className="space-y-4">
        {error && (
          <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Quick Reference Summary */}
        <div className="rounded-xl border border-border bg-muted/20 p-3.5 text-xs grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <span className="text-muted-foreground block text-[11px]">Delivery No:</span>
            <span className="font-mono font-bold text-foreground">{delivery.deliveryNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px]">Purchase Order Reference:</span>
            <span className="font-mono font-medium text-foreground">{delivery.poNumber}</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-muted-foreground block text-[11px]">Supplier:</span>
            <span className="font-semibold text-foreground truncate block">{delivery.supplierName}</span>
          </div>
        </div>

        {/* Dispatch Date & Time (single icon) */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">
            Dispatch Date &amp; Time <span className="text-destructive">*</span>
          </label>
          <Input
            type="datetime-local"
            value={dispatchedDate}
            onChange={(e) => setDispatchedDate(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground"
          />
        </div>

        {/* Carrier Dropdown */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">
            Carrier / Logistics <span className="text-destructive">*</span>
          </label>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CARRIER_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* If Custom Carrier */}
        {carrier === "Other Logistics (Specify)" && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Specify Logistics Provider <span className="text-destructive">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. QuadX, Airspeed, 2GO..."
              value={customCarrier}
              onChange={(e) => setCustomCarrier(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground"
            />
          </div>
        )}

        {/* Driver Information (2 Columns) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Driver Name
            </label>
            <Input
              type="text"
              placeholder="e.g. Juan Dela Cruz"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Vehicle Plate Number
            </label>
            <Input
              type="text"
              placeholder="e.g. ABC-1234"
              value={vehiclePlateNumber}
              onChange={(e) => setVehiclePlateNumber(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground font-mono"
            />
          </div>
        </div>

        {/* Proof / Dispatch Photo (Required) */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">
            Dispatch Proof / Photo <span className="text-destructive">*</span>
          </label>
          <div className="rounded-xl border border-dashed border-border bg-card p-4 transition-colors">
            {dispatchAttachmentBase64 ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 truncate">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-foreground shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-medium text-foreground truncate">
                      {attachmentFileName || "Dispatch photo attached"}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDispatchAttachmentBase64("");
                    setAttachmentFileName("");
                  }}
                  className="text-muted-foreground hover:text-destructive h-8 px-2"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center cursor-pointer py-2">
                <Upload className="w-5 h-5 text-muted-foreground mb-1.5" />
                <span className="text-xs font-medium text-foreground">
                  Click to upload dispatch proof or photo <span className="text-destructive">*</span>
                </span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  JPG, PNG, PDF up to 8MB
                </span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Close
          </Button>
          <Button
            type="submit"
            disabled={submitting || !dispatchAttachmentBase64}
            className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm disabled:opacity-50"
          >
            {submitting ? "Dispatching..." : "Dispatch"}
          </Button>
        </div>
      </form>

      {/* Review Modal for Submission */}
      {confirmModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div
            style={{ width: "100%", maxWidth: "500px" }}
            className="w-full rounded-2xl border border-border bg-card shadow-2xl p-6 flex flex-col shrink-0"
          >
            <h3 className="text-xl font-bold text-foreground">Confirm Dispatch</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Please review the dispatch details for {delivery.deliveryNumber} before proceeding.
            </p>

            <div className="space-y-4 text-sm text-foreground mb-8">
              <div className="grid grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border">
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Carrier</span>
                  <span className="font-medium">{finalCarrier}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Date & Time</span>
                  <span className="font-medium">{new Date(dispatchedDate).toLocaleString()}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Driver</span>
                  <span className="font-medium">{driverName || "—"}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted-foreground mb-1">Vehicle</span>
                  <span className="font-medium">{vehiclePlateNumber || "—"}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={() => setConfirmModal(false)}
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmModal(false);
                  handleSubmit();
                }}
                className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85"
                disabled={submitting}
              >
                {submitting ? "Dispatching..." : "Confirm Dispatch"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ModalWrapper>
  );
}
