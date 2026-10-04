"use client";

import React, { useState } from "react";
import { X, Loader2, CheckCircle, XCircle } from "lucide-react";
import api from "../lib/api";

interface Props {
  open: boolean;
  batchId: number;
  onClose: () => void;
  onSubmit: () => void; // called after successful QA + decision
}

export default function QAChecklistModal({ open, batchId, onClose, onSubmit }: Props) {
  // QA fields
  const [taste, setTaste] = useState("Pass");
  const [texture, setTexture] = useState("Pass");
  const [packaging, setPackaging] = useState("Pass");
  const [appearance, setAppearance] = useState("Pass");
  const [notes, setNotes] = useState("");
  const [notesError, setNotesError] = useState("");

  // Decision fields
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState("");

  const validateNoSpecialChars = (text: string) => {
    return /^[A-Za-z0-9\s]*$/.test(text);
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!decision) return;
    if (decision === "reject" && !rejectionReason.trim()) return;
    if (notesError || rejectionError) return;

    setSubmitting(true);
    try {
      // Save QA data
      const qaPayload = { taste, texture, packaging, appearance, notes };
      await api.put(`/api/ProductionBatches/${batchId}/qa`, qaPayload);

      // Execute approval or rejection
      const endpoint = `/api/ProductionBatches/${batchId}/${decision}`;
      const decisionPayload = decision === "reject" ? { reason: rejectionReason } : {};
      await api.put(endpoint, decisionPayload);

      // Success – close modal and refresh parent
      onSubmit();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const selectClass =
    "w-full rounded-xl border border-border bg-card py-2.5 px-3 text-sm text-foreground";

  const canSubmit = decision !== null && (decision === "approve" || rejectionReason.trim() !== "") && !submitting && !notesError && !rejectionError;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-[90vw] max-w-[90vw] sm:max-w-[80vw] md:max-w-[700px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto p-md sm:p-lg rounded-lg sm:rounded-xl bg-card border border-border shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            QA Checklist – Batch {batchId}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:opacity-80 transition-opacity">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* QA fields */}
          {[
            { label: "Taste", value: taste, setter: setTaste },
            { label: "Texture", value: texture, setter: setTexture },
            { label: "Packaging", value: packaging, setter: setPackaging },
            { label: "Appearance", value: appearance, setter: setAppearance },
          ].map((field) => (
            <div key={field.label}>
              <label className="block text-sm font-medium text-foreground mb-1">
                {field.label}
              </label>
              <select
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                className={selectClass}
              >
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
              </select>
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => {
                const val = e.target.value;
                setNotes(val);
                if (!validateNoSpecialChars(val)) {
                  setNotesError("Special characters are not allowed.");
                } else {
                  setNotesError("");
                }
              }}
              placeholder="QA notes..."
              className={`w-full rounded-xl border ${notesError ? '!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive' : 'border-border'} bg-card py-2.5 px-3 text-sm text-foreground`}
            />
            {notesError && <p className="mt-1 text-xs text-destructive">{notesError}</p>}
          </div>

          {/* ---------- Decision Section ---------- */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Final Decision
            </label>
            <div className="flex gap-3 mb-3">
              <button
                onClick={() => setDecision("approve")}
                className={`flex-1 py-2.5 rounded-xl border font-medium text-sm flex items-center justify-center gap-2
                  ${decision === "approve" ? "bg-primary border-primary text-primary-foreground" : "border-border text-foreground"}
                `}
              >
                <CheckCircle size={16} /> Approve
              </button>
              <button
                onClick={() => setDecision("reject")}
                className={`flex-1 py-2.5 rounded-xl border font-medium text-sm flex items-center justify-center gap-2
                  ${decision === "reject" ? "bg-muted border-border text-foreground font-semibold" : "border-border text-foreground"}
                `}
              >
                <XCircle size={16} /> Reject
              </button>
            </div>

            {decision === "reject" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Rejection Reason <span className="text-muted-foreground">*</span></label>
                <textarea
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRejectionReason(val);
                    if (!validateNoSpecialChars(val)) {
                      setRejectionError("Special characters are not allowed.");
                    } else {
                      setRejectionError("");
                    }
                  }}
                  placeholder="Explain why this batch is rejected..."
                  className={`w-full rounded-xl border ${rejectionError ? '!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive' : 'border-border'} bg-card py-2.5 px-3 text-sm text-foreground`}
                />
                {rejectionError && <p className="mt-1 text-xs text-destructive">{rejectionError}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-foreground border border-border rounded-lg hover:opacity-80 transition-opacity">Cancel</button>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Submit QA & Decision
          </button>
        </div>
      </div>
    </div>
  );
}