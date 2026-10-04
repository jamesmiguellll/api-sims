"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { LocationItem } from "./types";
import api from "@/lib/api";

interface CreateTransferModalProps {
  open: boolean;
  locations: LocationItem[];
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateTransferModal({
  open,
  locations,
  onClose,
  onCreated,
}: CreateTransferModalProps) {
  const [product, setProduct] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [quantity, setQuantity] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setProduct("");
      setToLocation("");
      setQuantity("");
      setTransferDate(new Date().toISOString().split("T")[0]);
      setError("");

      const load = async () => {
        try {
          const res = await api.get("/api/finished-products");
          if (res.data?.success) setProducts(res.data.data.items || res.data.data || []);
        } catch (e) { console.error(e); }
      };
      load();
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!product || !toLocation || !quantity || !transferDate) {
      setError("Please complete all required fields.");
      return;
    }
    setError("");

    try {
      setIsSubmitting(true);
      const commissary = locations.find((l) => l.name.toLowerCase().includes("commissary")) || locations[0];
      const payload = {
        productId: Number(product),
        sourceLocationId: Number(commissary?.id || 1),
        destLocationId: Number(toLocation),
        quantity: Number(quantity),
        transferDate,
        status: "Pending",
      };

      await api.post("/api/stock-transfers", payload);
      onCreated();
      onClose();
    } catch {
      setError("Failed to create stock transfer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalWrapper open={open} title="Create Stock Transfer" onClose={onClose} size="max-w-xl">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">Product <span className="text-muted-foreground">*</span></label>
          <select value={product} onChange={(e) => setProduct(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-ring">
            <option value="" disabled hidden>Select product...</option>
            {products.map((p) => <option key={p.productId} value={p.productId}>{p.itemName}{p.variant ? ` (${p.variant})` : ""}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">Destination Location <span className="text-muted-foreground">*</span></label>
          <select value={toLocation} onChange={(e) => setToLocation(e.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-ring">
            <option value="" disabled hidden>Select destination...</option>
            {locations.filter((l) => !l.name.toLowerCase().includes("commissary")).map((l) => (
              <option key={l.id} value={l.id}>{l.name} ({l.type})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Quantity <span className="text-muted-foreground">*</span></label>
            <Input type="number" min={0.001} step={0.001} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 50" className="rounded-xl border border-border bg-card text-foreground text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">Transfer Date <span className="text-muted-foreground">*</span></label>
            <Input type="date" min={new Date().toISOString().split("T")[0]} value={transferDate} onChange={(e) => setTransferDate(e.target.value)} className="rounded-xl border border-border bg-card text-foreground text-sm" />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background transition-colors">
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting} className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors">
            Create Transfer
          </Button>
        </div>
      </div>
    </ModalWrapper>
  );
}
