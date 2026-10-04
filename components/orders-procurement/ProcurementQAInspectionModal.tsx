"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, Upload, Loader2 } from "lucide-react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Order } from "./types";
import api from "@/lib/api";
import { HR_EMPLOYEES } from "@/lib/employees";

interface ProcurementQAInspectionModalProps {
  order: Order | null;
  onClose: () => void;
  onComplete: () => void;
}

export default function ProcurementQAInspectionModal({
  order,
  onClose,
  onComplete,
}: ProcurementQAInspectionModalProps) {
  const [checklist, setChecklist] = useState({
    quantityMatch: false,
    goodCondition: false,
    specsMatch: false,
    docsCorrect: false,
  });
  const [comment, setComment] = useState("");
  const [inspectedBy, setInspectedBy] = useState("");
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [inspectedByError, setInspectedByError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!order) return null;

  const isAllChecked = checklist.quantityMatch && checklist.goodCondition && checklist.specsMatch && checklist.docsCorrect;
  const result = isAllChecked ? "Passed" : "Failed";

  const handleComplete = async () => {
    let isValid = true;
    if (!inspectedBy.trim()) { setInspectedByError("Inspected by is required."); isValid = false; }
    if (!pictureFile) { setPhotoError("Inspection proof photo is required."); isValid = false; }
    if (!isValid) return;

    try {
      setIsSaving(true);
      const targetStatus = result === "Passed" ? "Completed" : "Rejected";
      const res = await api.put(`/api/purchase-orders/${order.poId}/status`, {
        status: targetStatus,
        qaNotes: comment,
        qaStatus: result,
        inspectedBy: inspectedBy.trim(),
      });

      if (res.data.success) {
        if (pictureFile) {
          const formData = new FormData();
          formData.append("file", pictureFile);
          await api.post(`/api/purchase-orders/${order.poId}/upload-receipt`, formData);
        }
        onComplete();
        onClose();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to submit Quality Assurance Inspection.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalWrapper open={!!order} title={`Quality Assurance Inspection - Order ${order.id}`} onClose={onClose} size="max-w-3xl">
      <div className="space-y-4">
        <div className="p-3 bg-muted/30 border border-border rounded-xl grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><span className="text-muted-foreground">Item:</span> <span className="font-bold text-foreground">{order.item}</span></div>
          <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium text-foreground">{order.supplier}</span></div>
          <div><span className="text-muted-foreground">Qty:</span> <span className="font-bold text-foreground">{order.quantity}</span></div>
          <div><span className="text-muted-foreground">Status:</span> <span className="font-semibold text-foreground">{result}</span></div>
        </div>

        <div className="space-y-2">
          {[
            { key: "quantityMatch", label: "Quantity Verification", desc: "Delivered quantity matches ordered quantity." },
            { key: "goodCondition", label: "Condition & Quality", desc: "Materials arrived with no defects or damage." },
            { key: "specsMatch", label: "Specification Match", desc: "Item specifications match the purchase order." },
            { key: "docsCorrect", label: "Documentation Check", desc: "Receipts and invoices are verified." },
          ].map((item) => {
            const isChecked = checklist[item.key as keyof typeof checklist];
            return (
              <div
                key={item.key}
                onClick={() => setChecklist((prev) => ({ ...prev, [item.key]: !isChecked }))}
                className={`p-3 rounded-xl border transition-colors cursor-pointer flex items-start gap-3 select-none ${
                  isChecked ? "border-foreground bg-muted/40" : "border-border bg-card hover:border-foreground/40"
                }`}
              >
                <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border ${isChecked ? "bg-foreground border-foreground text-background" : "border-border"}`}>
                  {isChecked && <Check size={12} strokeWidth={3} />}
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Inspected By <span className="text-muted-foreground">*</span></label>
            <select
              value={inspectedBy}
              onChange={(e) => { setInspectedBy(e.target.value); setInspectedByError(""); }}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              <option value="" disabled>Select inspector...</option>
              {HR_EMPLOYEES.map((employee) => (
                <option key={employee} value={employee}>{employee}</option>
              ))}
            </select>
            {inspectedByError && <p className="mt-1 text-xs text-red-500">{inspectedByError}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Inspection Photo / Proof <span className="text-muted-foreground">*</span></label>
            <div className="border border-dashed border-border rounded-xl p-3 text-center hover:bg-muted/30 relative">
              <Input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => { setPictureFile(e.target.files?.[0] || null); setPhotoError(""); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
              <div className="flex items-center justify-center gap-2 pointer-events-none text-xs text-foreground">
                <Upload className="w-4 h-4 text-muted-foreground" />
                <span>{pictureFile ? pictureFile.name : "Upload photo"}</span>
              </div>
            </div>
            {photoError && <p className="mt-1 text-xs text-red-500">{photoError}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">Notes (Optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Inspection feedback or remarks..." rows={2} className="w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground resize-none" />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving} className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background transition-colors">
            Cancel
          </Button>
          <Button type="button" onClick={handleComplete} disabled={isSaving} className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors flex items-center gap-2">
            {isSaving && <Loader2 className="animate-spin h-4 w-4" />}
            Submit Quality Assurance Inspection ({result})
          </Button>
        </div>
      </div>
    </ModalWrapper>
  );
}
