"use client";

import React, { useState } from "react";
import { AlertCircle, Upload, Check, Trash2, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import api from "@/lib/api";
import { Delivery } from "../types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { HR_EMPLOYEES } from "@/lib/employees";

interface MarkArrivedModalProps {
  delivery: Delivery | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function MarkArrivedModal({
  delivery,
  onClose,
  onSuccess,
}: MarkArrivedModalProps) {
  const { user } = useAuth();
  if (!delivery) return null;

  const defaultReceiver = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : (user?.username || "Warehouse Officer");

  const [actualArrivalDate, setActualArrivalDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [receivedBy, setReceivedBy] = useState(defaultReceiver);
  const [arrivalAttachmentBase64, setArrivalAttachmentBase64] = useState("");
  const [attachmentFileName, setAttachmentFileName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setArrivalAttachmentBase64(reader.result as string);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!actualArrivalDate) {
      setError("Please specify the actual arrival date.");
      return;
    }

    if (!receivedBy.trim()) {
      setError("Please specify who received the delivery.");
      return;
    }

    if (!arrivalAttachmentBase64) {
      setError("Arrival proof photo is required before confirming arrival.");
      return;
    }

    try {
      setSubmitting(true);
      const combinedDateTime = new Date(`${actualArrivalDate}T12:00:00Z`).toISOString();

      const payload = {
        actualArrivalDate: combinedDateTime,
        receivedBy: receivedBy.trim(),
        arrivalAttachmentBase64: arrivalAttachmentBase64,
        attachmentUrl: arrivalAttachmentBase64,
      };

      // Try direct arrive endpoint
      let res = await api.put(
        `/api/deliveries/${delivery.deliveryId}/arrive`,
        payload
      ).catch(async (err) => {
        // If transitioning from Scheduled requires dispatch first on older backend
        if (delivery.status === "Scheduled") {
          try {
            await api.put(`/api/deliveries/${delivery.deliveryId}/dispatch`, {
              dispatchedDate: new Date().toISOString(),
              carrier: delivery.carrier || "In-House Logistics",
            });
            return await api.put(
              `/api/deliveries/${delivery.deliveryId}/arrive`,
              payload
            );
          } catch {
            throw err;
          }
        }
        throw err;
      });

      if (res?.data?.success) {
        onSuccess();
        onClose();
      } else {
        setError(res?.data?.message || "Failed to confirm arrival.");
      }
    } catch (err: any) {
      console.error("Arrival confirmation error:", err);
      setError(
        err?.response?.data?.message ||
          "An unexpected error occurred while confirming delivery arrival."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = Boolean(
    actualArrivalDate &&
    receivedBy.trim() &&
    arrivalAttachmentBase64.trim()
  );

  return (
    <ModalWrapper
      open={!!delivery}
      title={`Confirm Delivery Arrival — ${delivery.deliveryNumber}`}
      onClose={onClose}
      size="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="p-3.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2.5 animate-in fade-in-50">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Quick Reference Summary Card with Status */}
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3 items-center">
          <div>
            <span className="text-muted-foreground block text-[11px] mb-0.5">Delivery No</span>
            <span className="font-mono font-bold text-foreground">{delivery.deliveryNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px] mb-0.5">Purchase Order Ref</span>
            <span className="font-mono font-medium text-foreground">{delivery.poNumber}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px] mb-0.5">Supplier</span>
            <span className="font-semibold text-foreground truncate block">{delivery.supplierName || "—"}</span>
          </div>
          <div>
            <span className="text-muted-foreground block text-[11px] mb-0.5">Current Status</span>
            <StatusBadge status={delivery.status} />
          </div>
        </div>

        {/* Arriving Items Overview */}
        {delivery.items && delivery.items.length > 0 && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Arriving Items (will proceed to GRN after arrival)
            </label>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold text-xs">
                    <th className="px-3.5 py-2">Item Name</th>
                    <th className="px-3.5 py-2">Unit of Measure</th>
                    <th className="px-3.5 py-2 text-right">Shipment Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {delivery.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/10">
                      <td className="px-3.5 py-2 font-medium text-foreground">{item.itemName}</td>
                      <td className="px-3.5 py-2 text-muted-foreground">{item.purchaseUomName}</td>
                      <td className="px-3.5 py-2 text-right font-mono font-bold text-foreground">
                        {item.declaredQuantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Streamlined Arrival Details: Date & Receiver (2 Columns, NO arrival time) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Arrival Date <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                value={actualArrivalDate}
                onChange={(e) => setActualArrivalDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm text-foreground cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
              />
              <Calendar className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Received By <span className="text-destructive">*</span>
            </label>
            <select
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {receivedBy && !HR_EMPLOYEES.includes(receivedBy as (typeof HR_EMPLOYEES)[number]) && (
                <option value={receivedBy}>{receivedBy}</option>
              )}
              {HR_EMPLOYEES.map((employee) => (
                <option key={employee} value={employee}>{employee}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Arrival Proof Photo (Required with Image Preview) */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground flex items-center justify-between">
            <span>
              Arrival Proof / Photo <span className="text-destructive">*</span>
            </span>
            {!arrivalAttachmentBase64 && (
              <span className="text-[11px] text-destructive font-normal">
                Required to confirm arrival
              </span>
            )}
          </label>
          <div className="rounded-xl border border-dashed border-border bg-card p-4 transition-colors">
            {arrivalAttachmentBase64 ? (
              <div className="space-y-3">
                <div className="relative flex flex-col items-center justify-center p-3 bg-muted/20 rounded-xl border border-border">
                  {arrivalAttachmentBase64.startsWith("data:image/") ? (
                    <img
                      src={arrivalAttachmentBase64}
                      alt="Arrival proof"
                      className="max-h-56 rounded-lg object-contain border border-border shadow-xs"
                    />
                  ) : (
                    <div className="flex items-center gap-2.5 p-4 text-xs font-medium text-foreground">
                      <FileText className="w-8 h-8 text-muted-foreground shrink-0" />
                      <span className="truncate">{attachmentFileName || "Uploaded document"}</span>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] font-mono text-muted-foreground truncate max-w-xs text-center">
                    {attachmentFileName || "Arrival proof photo"}
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <label className="cursor-pointer text-xs font-semibold px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    Change File
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setArrivalAttachmentBase64("");
                      setAttachmentFileName("");
                    }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center cursor-pointer py-4 hover:bg-muted/30 rounded-xl transition-colors">
                <Upload className="w-6 h-6 text-muted-foreground mb-2" />
                <span className="text-xs font-medium text-foreground">
                  Click to upload arrival proof or photo <span className="text-destructive">*</span>
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
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-4">
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
            disabled={submitting || !isFormValid}
            className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting ? "Confirming..." : "Confirm Arrival"}
          </Button>
        </div>
      </form>
    </ModalWrapper>
  );
}
