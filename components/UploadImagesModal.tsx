"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Upload,
  ImagePlus,
  Loader2,
  Trash2,
  ChevronRight,
} from "lucide-react";
import api from "@/lib/api";

interface Props {
  open: boolean;
  batchId: number;
  batchStatus?: string; // used to show/hide stage section
  onClose: () => void;
  onStageUpdated?: () => void; // refreshes parent data after stage change
}

export default function UploadImagesModal({
  open,
  batchId,
  batchStatus = "",
  onClose,
  onStageUpdated,
}: Props) {
  // ---- File upload states ----
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Stage update states ----
  const stages = [
    "Peeling",
    "Steaming",
    "Mixing",
    "Cooking",
    "Cooling",
    "Packaging",
    "QA Review",
  ];
  const [selectedStage, setSelectedStage] = useState("");
  const [updatingStage, setUpdatingStage] = useState(false);

  // ---- Confirmation modal state ----
  const [isUploading, setIsUploading] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setSelectedStage("");
      setSelectedFiles([]);
      setPreviews([]);
      setUpdatingStage(false);
      setUploading(false);
    }
  }, [open]);

  const showStageSection =
    batchStatus !== "Completed" && batchStatus !== "Rejected";

  // ---- Handlers for file upload ----
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) =>
      ["image/jpeg", "image/png", "image/jpg"].includes(f.type)
    );
    setSelectedFiles((prev) => [...prev, ...valid]);
    valid.forEach((f) => {
      const url = URL.createObjectURL(f);
      setPreviews((prev) => [...prev, url]);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadImages = async () => {
    if (selectedFiles.length === 0) return;
    // Upload one at a time — backend expects a single IFormFile named 'file'
    for (const file of selectedFiles) {
      const formData = new FormData();
      formData.append("file", file);
      await api.post(`/api/ProductionBatches/${batchId}/images`, formData);
    }
  };

  const updateStage = async () => {
    if (!selectedStage) return;
    await api.put(`/api/ProductionBatches/${batchId}/stage`, {
      stage: selectedStage,
    });
  };

  // Single submit handler
  const handleSubmit = async () => {
    if ((!selectedStage && selectedFiles.length === 0) || updatingStage || uploading) return;
    
    setUpdatingStage(true);
    setUploading(true);
    try {
      if (selectedStage) {
        await updateStage();
      }
      if (selectedFiles.length > 0) {
        await uploadImages();
      }
      if (onStageUpdated) onStageUpdated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingStage(false);
      setUploading(false);
    }
  };

  const canSubmit = (selectedStage !== "" || selectedFiles.length > 0) && !updatingStage && !uploading;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-[90vw] max-w-[90vw] sm:max-w-[80vw] md:max-w-[700px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto p-md sm:p-lg rounded-lg sm:rounded-xl bg-card border border-border shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Batch {batchId} – Update & Upload
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:opacity-80 transition-opacity"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stage Update Section */}
        {showStageSection && (
          <div className="px-6 pt-5 pb-2">
            <label className="block text-sm font-medium text-foreground mb-2">
              Production Stage
            </label>
            <div className="flex gap-3">
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 px-3 text-sm text-foreground"
              >
                <option value="">Select next stage</option>
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Image Upload Section */}
        <div className="p-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Upload Production Images
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 cursor-pointer hover:bg-muted/50"
          >
            <Upload size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Click to add JPG, PNG, or JPEG files
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png, image/jpeg, image/jpg"
            onChange={handleFileChange}
            className="hidden"
          />

          {previews.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {previews.map((src, idx) => (
                <div
                  key={idx}
                  className="relative group rounded-lg overflow-hidden border border-border"
                >
                  <img
                    src={src}
                    alt={`preview ${idx}`}
                    className="w-full h-20 object-cover"
                  />
                  <button
                    onClick={() => removeFile(idx)}
                    className="absolute top-1 right-1 p-1 bg-card rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={14} className="text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer – single Submit button */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <div className="flex items-center gap-3 w-full sm:w-auto">
             <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-foreground border border-border rounded-lg hover:opacity-80 transition-opacity">Cancel</button>
          </div>
           <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {updatingStage || uploading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <ChevronRight size={16} />
            )}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}