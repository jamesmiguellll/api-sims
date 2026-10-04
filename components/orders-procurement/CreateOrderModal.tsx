"use client";

import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, Sparkles, Clock, DollarSign, Package } from "lucide-react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Order, SupplyItem, Supplier, PaymentType } from "./types";
import api from "@/lib/api";

interface ItemSupplierOption {
  supplierId: number;
  supplierName: string;
  unitPrice: number;
  currency: string;
  purchaseUomId: number;
  purchaseUomName: string;
  packSize: number;
  leadTimeDays: number;
  minOrderQuantity: number;
  isPreferred: boolean;
}

interface CreateOrderModalProps {
  open: boolean;
  editingOrder: Order | null;
  itemsList: SupplyItem[];
  suppliersList: Supplier[];
  onClose: () => void;
  onSave: (formData: FormData, isEdit: boolean) => Promise<void>;
}

export default function CreateOrderModal({
  open,
  editingOrder,
  itemsList,
  suppliersList,
  onClose,
  onSave,
}: CreateOrderModalProps) {
  const [supplierId, setSupplierId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [eta, setEta] = useState("");
  const [payment, setPayment] = useState<PaymentType>("Payable");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Supplier Catalog Filtering State
  const [itemSuppliers, setItemSuppliers] = useState<ItemSupplierOption[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [selectedSupplierOption, setSelectedSupplierOption] = useState<ItemSupplierOption | null>(null);

  const [supplierError, setSupplierError] = useState("");
  const [itemError, setItemError] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [etaError, setEtaError] = useState("");
  const [receiptError, setReceiptError] = useState("");

  useEffect(() => {
    if (editingOrder) {
      setSupplierId(editingOrder.supplierId?.toString() || "");
      setItemId(editingOrder.itemId?.toString() || "");
      setQuantity(editingOrder.quantity?.toString() || "");
      setEta(editingOrder.eta || "");
      setPayment(editingOrder.payment || "Payable");
    } else {
      setSupplierId("");
      setItemId("");
      setQuantity("");
      setEta("");
      setPayment("Payable");
    }
    setReceiptFile(null);
    setSupplierError("");
    setItemError("");
    setQuantityError("");
    setEtaError("");
    setReceiptError("");
    setItemSuppliers([]);
    setSelectedSupplierOption(null);
  }, [editingOrder, open]);

  // When Item changes, load suppliers specifically catalogued for that item
  const handleItemChange = async (newItemIdStr: string) => {
    setItemId(newItemIdStr);
    setItemError("");
    setSupplierId("");
    setSelectedSupplierOption(null);

    if (!newItemIdStr) {
      setItemSuppliers([]);
      return;
    }

    const newItemId = parseInt(newItemIdStr, 10);
    if (isNaN(newItemId)) return;

    setLoadingSuppliers(true);
    try {
      let res;
      try {
        res = await api.get(`/api/supplier-items/by-item/${newItemId}`);
      } catch {
        res = await api.get(`/api/SupplierItems/by-item/${newItemId}`);
      }

      if (res.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const suppliers: ItemSupplierOption[] = res.data.data;
        setItemSuppliers(suppliers);

        // Auto-select preferred supplier or first vendor
        const preferred = suppliers.find((s) => s.isPreferred) || suppliers[0];
        if (preferred) {
          setSupplierId(preferred.supplierId.toString());
          setSelectedSupplierOption(preferred);
          setSupplierError("");

          // Auto-calculate suggested ETA if not set
          if (!eta && preferred.leadTimeDays > 0) {
            const d = new Date();
            d.setDate(d.getDate() + preferred.leadTimeDays);
            setEta(d.toISOString().split("T")[0]);
          }
        }
      } else {
        setItemSuppliers([]);
      }
    } catch (err) {
      console.error("Failed to load item supplier options", err);
      setItemSuppliers([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const handleSupplierChange = (newSupplierIdStr: string) => {
    setSupplierId(newSupplierIdStr);
    setSupplierError("");

    const matched = itemSuppliers.find((s) => s.supplierId.toString() === newSupplierIdStr);
    setSelectedSupplierOption(matched || null);

    if (matched && matched.leadTimeDays > 0 && !editingOrder) {
      const d = new Date();
      d.setDate(d.getDate() + matched.leadTimeDays);
      setEta(d.toISOString().split("T")[0]);
    }
  };

  const handleSubmit = async () => {
    let isValid = true;
    if (!itemId) { setItemError("Item is required."); isValid = false; }
    if (!supplierId) { setSupplierError("Supplier is required."); isValid = false; }
    if (!quantity || Number(quantity) <= 0) { setQuantityError("Valid quantity is required."); isValid = false; }
    if (!eta) { setEtaError("Expected arrival date is required."); isValid = false; }
    if (!editingOrder && !receiptFile) { setReceiptError("Receipt or PO proof is required."); isValid = false; }

    if (!isValid) return;

    try {
      setIsSaving(true);
      const fd = new FormData();
      fd.append("SupplierId", supplierId);
      fd.append("ItemId", itemId);
      fd.append("Quantity", quantity);
      fd.append("Eta", eta);
      fd.append("Payment", payment);
      if (receiptFile) fd.append("Receipt", receiptFile);

      await onSave(fd, !!editingOrder);
      onClose();
    } catch {
      alert("Failed to save order.");
    } finally {
      setIsSaving(false);
    }
  };

  const numQty = parseFloat(quantity) || 0;
  const estTotal = selectedSupplierOption && numQty > 0 ? (selectedSupplierOption.unitPrice * numQty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;

  return (
    <ModalWrapper open={open} title={editingOrder ? "Edit Purchase Order" : "Create New Purchase Order"} onClose={onClose} size="max-w-xl">
      <div className="space-y-4">
        {/* Item Selection First */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">
            1. Select Product / Raw Material <span className="text-muted-foreground">*</span>
          </label>
          <select
            value={itemId}
            onChange={(e) => handleItemChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-ring"
          >
            <option value="" disabled hidden>Choose item to order...</option>
            {itemsList.map((i) => (
              <option key={i.itemId} value={i.itemId}>
                {i.itemName} {i.uomName ? `(${i.uomName})` : ""} - {i.categoryName}
              </option>
            ))}
          </select>
          {itemError && <p className="mt-1 text-xs text-red-500">{itemError}</p>}
        </div>

        {/* Supplier Dropdown - Filtered by Item */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-foreground">
              2. Vendor / Supplier <span className="text-muted-foreground">*</span>
            </label>
            {loadingSuppliers && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" /> Finding approved vendors...
              </span>
            )}
            {itemSuppliers.length > 0 && !loadingSuppliers && (
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {itemSuppliers.length} vendor(s) catalogued
              </span>
            )}
          </div>

          <select
            value={supplierId}
            onChange={(e) => handleSupplierChange(e.target.value)}
            disabled={loadingSuppliers || !itemId}
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-ring disabled:opacity-50"
          >
            <option value="" disabled hidden>
              {!itemId ? "Select item first..." : itemSuppliers.length > 0 ? "Select from approved item suppliers..." : "Select supplier..."}
            </option>
            {itemSuppliers.length > 0
              ? itemSuppliers.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.supplierName} {s.isPreferred ? "★ (Preferred Vendor)" : ""} — ₱{s.unitPrice.toFixed(2)} / {s.purchaseUomName} (Lead: {s.leadTimeDays}d)
                  </option>
                ))
              : suppliersList.map((s) => (
                  <option key={s.supplierId} value={s.supplierId}>
                    {s.companyName}
                  </option>
                ))}
          </select>
          {supplierError && <p className="mt-1 text-xs text-red-500">{supplierError}</p>}

          {/* Supplier Catalog Info Card */}
          {selectedSupplierOption && (
            <div className="mt-2 rounded-lg border border-border bg-muted/20 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 font-semibold text-foreground">
                  <DollarSign size={13} className="text-primary" /> ₱{selectedSupplierOption.unitPrice.toFixed(2)} / {selectedSupplierOption.purchaseUomName}
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock size={13} /> {selectedSupplierOption.leadTimeDays} days lead time
                </span>
                {selectedSupplierOption.packSize > 1 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Package size={13} /> Pack: {selectedSupplierOption.packSize} units
                  </span>
                )}
              </div>
              {selectedSupplierOption.isPreferred && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                  <Sparkles size={10} /> Preferred Supplier
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              3. Order Quantity <span className="text-muted-foreground">*</span>
            </label>
            <Input
              type="number"
              min={0.001}
              step={0.001}
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setQuantityError(""); }}
              placeholder="e.g. 50"
              className="rounded-xl border border-border bg-card text-foreground text-sm"
            />
            {quantityError && <p className="mt-1 text-xs text-red-500">{quantityError}</p>}
            {estTotal && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Est. Total: <span className="font-semibold text-foreground">₱{estTotal}</span>
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-foreground">
              Expected Arrival (ETA) <span className="text-muted-foreground">*</span>
            </label>
            <Input
              type="date"
              min={new Date().toISOString().split("T")[0]}
              value={eta}
              onChange={(e) => { setEta(e.target.value); setEtaError(""); }}
              className="rounded-xl border border-border bg-card text-foreground text-sm"
            />
            {etaError && <p className="mt-1 text-xs text-red-500">{etaError}</p>}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">Payment Type <span className="text-muted-foreground">*</span></label>
          <select value={payment} onChange={(e) => setPayment(e.target.value as PaymentType)} className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-ring">
            <option value="Payable">Payable</option>
            <option value="Paid">Paid</option>
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-foreground">Receipt / Purchase Order Attachment {!editingOrder && "*"}</label>
          <div className="border border-dashed border-border rounded-xl p-4 text-center hover:bg-muted/30 transition-colors relative">
            <Input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => { setReceiptFile(e.target.files?.[0] || null); setReceiptError(""); }} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            <div className="flex flex-col items-center pointer-events-none">
              <Upload className="w-6 h-6 text-muted-foreground mb-1" />
              <span className="text-xs font-medium text-foreground">{receiptFile ? receiptFile.name : "Upload receipt / Purchase Order document"}</span>
            </div>
          </div>
          {receiptError && <p className="mt-1 text-xs text-red-500">{receiptError}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving} className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background transition-colors">
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSaving} className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity">
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : editingOrder ? "Save Changes" : "Create Order"}
          </Button>
        </div>
      </div>
    </ModalWrapper>
  );
}
