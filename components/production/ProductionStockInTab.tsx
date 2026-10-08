"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Search, Plus, MoreHorizontal, Eye, ArrowDownToLine, X } from "lucide-react";

interface ProductionStockInTabProps {
  currentUser?: string;
}

export default function ProductionStockInTab({ currentUser = "Inventory Manager" }: ProductionStockInTabProps) {
  const [mounted, setMounted] = useState<boolean>(false);
  const [batches, setBatches] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filter & Search states (matching Resources & Suppliers layout)
  const [subTab, setSubTab] = useState<"all" | "pending" | "history">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("All");

  // Dropdown row action state
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);

  // Modal State: "Create Stock-In Report"
  const [isStockInModalOpen, setIsStockInModalOpen] = useState<boolean>(false);
  const [modalSelectedBatchId, setModalSelectedBatchId] = useState<number | "">("");
  const [stockInNotes, setStockInNotes] = useState<string>("");
  const [committing, setCommitting] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close row dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".action-menu-container")) {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Fetch batches & inventory reference
  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const [batchesRes, invRes] = await Promise.all([
        api.get("/api/ProductionBatches"),
        api.get("/api/inventory?pageSize=1000").catch(() => ({ data: { data: [] } })),
      ]);

      const batchList = Array.isArray(batchesRes.data)
        ? batchesRes.data
        : Array.isArray(batchesRes.data?.data)
        ? batchesRes.data.data
        : [];
      setBatches(batchList);

      const invList = Array.isArray(invRes.data?.data?.items)
        ? invRes.data.data.items
        : Array.isArray(invRes.data?.data)
        ? invRes.data.data
        : [];
      setInventoryItems(invList);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load batches for stock-in.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Derived unique product names for dropdown filter
  const uniqueProducts = useMemo(() => {
    return Array.from(new Set(batches.map((b) => b.productName).filter(Boolean)));
  }, [batches]);

  // Status Filter splits
  const pendingBatches = useMemo(() => {
    return batches.filter((b) => b.status === "For Stock-in");
  }, [batches]);

  const historyBatches = useMemo(() => {
    return batches.filter((b) => b.status === "Stocked In" || b.status === "Completed");
  }, [batches]);

  const allBatches = useMemo(() => {
    return batches.filter(
      (b) => b.status === "For Stock-in" || b.status === "Stocked In" || b.status === "Completed"
    );
  }, [batches]);

  // Filtered batches according to subTab, search, and product filter
  const displayedBatches = useMemo(() => {
    let list = subTab === "all" ? allBatches : subTab === "pending" ? pendingBatches : historyBatches;

    if (productFilter !== "All") {
      list = list.filter((b) => b.productName === productFilter);
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;

    return list.filter(
      (b) =>
        b.batchNumber?.toLowerCase().includes(q) ||
        (b.reqNumber && b.reqNumber.toLowerCase().includes(q)) ||
        b.productName?.toLowerCase().includes(q) ||
        (b.fgLotCode && b.fgLotCode.toLowerCase().includes(q))
    );
  }, [subTab, allBatches, pendingBatches, historyBatches, productFilter, searchQuery]);

  // Currently selected batch inside the modal
  const selectedBatchInModal = useMemo(() => {
    if (!modalSelectedBatchId) return null;
    return batches.find((b) => b.batchId === Number(modalSelectedBatchId)) || null;
  }, [batches, modalSelectedBatchId]);

  // Get current stock for the selected batch product
  const currentStockForSelected = useMemo(() => {
    if (!selectedBatchInModal) return 126;
    const match = inventoryItems.find(
      (i) => i.itemName?.toLowerCase() === selectedBatchInModal.productName?.toLowerCase()
    );
    return match ? Number(match.currentStock ?? match.quantityOnHand ?? 10) : 10;
  }, [selectedBatchInModal, inventoryItems]);

  // Eligible finished goods lots for the dropdown:
  // Strictly finished batches ready for stock in (plus the active one if viewing details)
  const availableLotsForDropdown = useMemo(() => {
    if (selectedBatchInModal && !pendingBatches.some((b) => b.batchId === selectedBatchInModal.batchId)) {
      return [selectedBatchInModal, ...pendingBatches];
    }
    return pendingBatches;
  }, [pendingBatches, selectedBatchInModal]);

  // Open modal from Header button: start empty (not pre-filled)
  const handleOpenCreateModal = () => {
    setModalSelectedBatchId("");
    setStockInNotes("");
    setIsStockInModalOpen(true);
  };

  // Open modal from row "View Details" or "Commit"
  const handleOpenForBatch = (b: any) => {
    setModalSelectedBatchId(b.batchId);
    setStockInNotes("");
    setIsStockInModalOpen(true);
    setActiveDropdownId(null);
  };

  // Commit Stock-In Handler
  const handleCommitStockIn = async () => {
    if (!selectedBatchInModal) {
      toast.error("Please select a finished goods lot first.");
      return;
    }

    if (selectedBatchInModal.status !== "For Stock-in") {
      toast.error(`Batch is currently in status "${selectedBatchInModal.status}". Only batches in "For Stock-in" can be committed.`);
      return;
    }

    setCommitting(true);
    try {
      const res = await api.post(`/api/ProductionBatches/${selectedBatchInModal.batchId}/add-to-inventory`, {
        notes: stockInNotes.trim(),
      });

      if (res.data?.success) {
        toast.success(
          `Stock-in committed! ${res.data.data?.quantityAdded ?? selectedBatchInModal.finalQuantity ?? selectedBatchInModal.actualQuantity} units added under lot ${res.data.data?.lotCode || selectedBatchInModal.fgLotCode}.`
        );
        setIsStockInModalOpen(false);
        setModalSelectedBatchId("");
        setStockInNotes("");
        await fetchBatches();
      } else {
        toast.error(res.data?.message || "Failed to commit stock-in.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred during stock-in.");
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-page-in">
      {/* ── Header (Matching Resources & Suppliers Header) ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Finished Goods Stock-In</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review completed batches passed by Quality Assurance and commit finished products into active inventory.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBatches}
            className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Refresh
          </Button>
          <Button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 transition-colors shadow-sm cursor-pointer"
          >
            <Plus size={16} /> Create Stock-In
          </Button>
        </div>
      </div>

      {/* ── Search & Filter Bar (Matching Resources & Suppliers Card) ── */}
      <div className="border border-border rounded-md overflow-hidden bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/20">
          <div className="flex items-center gap-2.5 flex-1">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search by name, lot, or batch (e.g. UJ-261008-02)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-xs flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="h-9 min-w-[200px] w-auto rounded-xl border border-border bg-card px-3.5 text-xs font-medium text-foreground shadow-xs">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent className="min-w-[200px]">
                <SelectItem value="All">All Products</SelectItem>
                {uniqueProducts.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Status Pills (Matching Resources & Suppliers Pill Tabs) ── */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSubTab("all")}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            subTab === "all"
              ? "bg-foreground text-background shadow-sm"
              : "border border-border/80 bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>All</span>
          <span
            className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
              subTab === "all" ? "bg-background text-foreground font-bold" : "bg-muted text-muted-foreground"
            }`}
          >
            {allBatches.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab("pending")}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            subTab === "pending"
              ? "bg-foreground text-background shadow-sm"
              : "border border-border/80 bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>Ready for Stock-In</span>
          <span
            className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
              subTab === "pending" ? "bg-background text-foreground font-bold" : "bg-muted text-muted-foreground"
            }`}
          >
            {pendingBatches.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab("history")}
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
            subTab === "history"
              ? "bg-foreground text-background shadow-sm"
              : "border border-border/80 bg-card text-muted-foreground hover:bg-muted"
          }`}
        >
          <span>Stock-In History</span>
          <span
            className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
              subTab === "history" ? "bg-background text-foreground font-bold" : "bg-muted text-muted-foreground"
            }`}
          >
            {historyBatches.length}
          </span>
        </button>
      </div>

      {/* ── Table (Matching SupplyTable layout: No QA Status, No Variant Under Name) ── */}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-muted-foreground uppercase tracking-widest">
            Loading stock-in records...
          </div>
        ) : displayedBatches.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-foreground">
              {subTab === "pending"
                ? "No finished goods batches waiting for stock-in."
                : "No stock-in records found."}
            </p>
            <p className="text-xs text-muted-foreground">
              Batches cleared by Quality Assurance will appear here ready to commit to inventory.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Finished Goods Lot</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Batch Number</th>
                <th className="py-3 px-4 text-right">Units to Stock</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4 text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedBatches.map((b) => (
                <tr key={b.batchId} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                    {b.fgLotCode || "Pending Lot"}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-foreground">
                    {b.productName}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-muted-foreground">
                    {b.batchNumber}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                    {Number(b.finalQuantity || b.actualQuantity).toLocaleString()} {b.yieldUom || "jars"}
                  </td>
                  <td className="py-3.5 px-4 text-muted-foreground">
                    {b.expiryDate
                      ? new Date(b.expiryDate).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="py-3.5 px-4 text-right relative action-menu-container" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() =>
                        setActiveDropdownId(activeDropdownId === b.batchId ? null : b.batchId)
                      }
                      className="p-1.5 rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer"
                      title="Actions"
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    {activeDropdownId === b.batchId && (
                      <div className="absolute right-4 top-10 z-[100] w-40 rounded-xl border border-border bg-card shadow-xl py-1.5 text-left animate-in fade-in">
                        <button
                          type="button"
                          onClick={() => handleOpenForBatch(b)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          <Eye size={14} className="shrink-0" />
                          <span>View Details</span>
                        </button>
                        {b.status === "For Stock-in" && (
                          <button
                            type="button"
                            onClick={() => handleOpenForBatch(b)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer border-t border-border/60"
                          >
                            <ArrowDownToLine size={14} className="shrink-0" />
                            <span>Commit Stock-In</span>
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: Create Stock-In Report (Exact layout matching User Images 1 & 2) ── */}
      {mounted && isStockInModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setIsStockInModalOpen(false)}
        >
          <div
            style={{ width: "100%", maxWidth: "780px" }}
            className="w-full max-h-[90vh] p-6 rounded-2xl border border-border bg-card flex flex-col shadow-2xl shrink-0 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4 flex-shrink-0">
              <h2 className="text-xl font-bold text-foreground">Create Stock-In Report</h2>
              <button
                type="button"
                onClick={() => setIsStockInModalOpen(false)}
                className="text-foreground/60 hover:text-foreground hover:bg-muted p-1 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-5">
              {/* Select Finished Goods Lot (Not pre-filled) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Select Finished Goods Lot
                </label>
                <div>
                  <select
                    value={modalSelectedBatchId}
                    onChange={(e) => setModalSelectedBatchId(e.target.value ? Number(e.target.value) : "")}
                    className="w-80 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  >
                    <option value="">
                      Select Finished Goods Lot
                    </option>
                    {availableLotsForDropdown.map((b) => (
                      <option key={b.batchId} value={b.batchId}>
                        {b.fgLotCode || b.batchNumber} — {b.productName} ({b.finalQuantity || b.actualQuantity} {b.yieldUom || "jars"})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Table when batch selected (Matching User Image 2: No variant under product name) */}
              {selectedBatchInModal && (
                <div className="space-y-3 animate-in fade-in">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground block">
                    Items
                  </span>

                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 py-3">Supply Name</th>
                          <th className="px-3 py-3 text-center">Unit of Measure</th>
                          <th className="px-3 py-3 text-right">Stock to Put In</th>
                          <th className="px-3 py-3 text-right">Current Stock</th>
                          <th className="px-4 py-3 whitespace-nowrap">Lot No.</th>
                          <th className="px-4 py-3 text-center whitespace-nowrap">Expiry Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hover:bg-muted/10 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">
                            {selectedBatchInModal.productName}
                          </td>
                          <td className="px-3 py-3 text-center text-muted-foreground">
                            {selectedBatchInModal.yieldUom || "jars"}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-foreground">
                            {Number(
                              selectedBatchInModal.finalQuantity || selectedBatchInModal.actualQuantity
                            ).toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                            {currentStockForSelected.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                            {selectedBatchInModal.fgLotCode || selectedBatchInModal.batchNumber}
                          </td>
                          <td className="px-4 py-3 text-center text-muted-foreground whitespace-nowrap">
                            {selectedBatchInModal.expiryDate
                              ? new Date(selectedBatchInModal.expiryDate).toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Stock-In Notes / Storage Instructions */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-semibold text-foreground block">
                      Stock-In Notes / Storage Instructions
                    </label>
                    <Textarea
                      rows={2}
                      value={stockInNotes}
                      onChange={(e) => setStockInNotes(e.target.value)}
                      placeholder="Specify designated warehouse aisle, refrigeration, or special storage notes..."
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                    />
                  </div>
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsStockInModalOpen(false)}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancel
                </Button>
                {selectedBatchInModal && (
                  <Button
                    type="button"
                    disabled={committing || selectedBatchInModal.status !== "For Stock-in"}
                    onClick={handleCommitStockIn}
                    className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 transition-colors shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {committing
                      ? "Committing..."
                      : selectedBatchInModal.status === "For Stock-in"
                      ? "Commit to Inventory"
                      : "Already Stocked In"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
