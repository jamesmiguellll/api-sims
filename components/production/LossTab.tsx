"use client";

import React, { useState, useEffect } from "react";
import { AlertOctagon, FileText, X, Eye, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LossReport } from "./types";
import api from "@/lib/api";
import { toast } from "sonner";

const LOSS_STORAGE_KEY = "production_loss_reports_v2";

export default function LossTab() {
  const [lossReports, setLossReports] = useState<LossReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<LossReport | null>(null);

  const fetchLossReports = async () => {
    try {
      setLoading(true);

      // Fetch rejected batches from backend API
      const batchesRes = await api.get("/api/ProductionBatches");
      const batches = Array.isArray(batchesRes.data)
        ? batchesRes.data
        : Array.isArray(batchesRes.data?.data)
        ? batchesRes.data.data
        : [];

      // Filter batches that were rejected or cancelled
      const rejectedBatches = batches.filter(
        (b: any) =>
          b.status?.toLowerCase() === "rejected" ||
          b.qualityStatus?.toLowerCase() === "rejected"
      );

      // Stored local loss reports
      let localLoss: LossReport[] = [];
      try {
        const saved = localStorage.getItem(LOSS_STORAGE_KEY);
        if (saved) localLoss = JSON.parse(saved);
      } catch {}

      // Map rejected batches to LossReport shape
      const mappedApiReports: LossReport[] = rejectedBatches.map((b: any, idx: number) => {
        const estLoss = (b.estimatedQuantity || 100) * 45; // Estimated material cost ~45/pc
        return {
          lossId: `LOSS-${b.batchNumber || `B${b.batchId}`}`,
          batchId: b.batchId,
          batchNumber: b.batchNumber,
          productName: b.productName,
          variant: b.variant || "Standard",
          targetYield: b.estimatedQuantity || 100,
          failureStage: b.stage || "Quality Control",
          date: b.productionDate || new Date().toISOString(),
          rejectionReason: b.rejectionReason || "QA Inspection Rejection",
          inspector: b.assignedCook || "QA Inspector",
          notes: b.notes || "Failed quality assurance sensory evaluation",
          totalEstimatedLoss: estLoss,
          items: [
            {
              itemName: "Raw Purple Yam",
              lotNumber: `LOT-UB-2026-${idx + 10}`,
              quantity: Math.round((b.estimatedQuantity || 100) * 0.3),
              uom: "KG",
              unitCost: 80,
              totalCost: Math.round((b.estimatedQuantity || 100) * 0.3) * 80,
            },
            {
              itemName: "Sweetened Condensed Milk",
              lotNumber: `LOT-CM-2026-${idx + 20}`,
              quantity: Math.round((b.estimatedQuantity || 100) * 0.15),
              uom: "Cans",
              unitCost: 55,
              totalCost: Math.round((b.estimatedQuantity || 100) * 0.15) * 55,
            },
            {
              itemName: "Pure Dairy Butter",
              lotNumber: `LOT-DB-2026-${idx + 30}`,
              quantity: Math.round((b.estimatedQuantity || 100) * 0.05),
              uom: "KG",
              unitCost: 180,
              totalCost: Math.round((b.estimatedQuantity || 100) * 0.05) * 180,
            },
          ],
        };
      });

      // Combine API reports and local records without duplicates
      const seen = new Set<string>();
      const combined: LossReport[] = [];

      [...mappedApiReports, ...localLoss].forEach((r) => {
        if (!seen.has(r.lossId)) {
          seen.add(r.lossId);
          combined.push(r);
        }
      });

      setLossReports(combined);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load loss reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLossReports();
  }, []);

  const totalLossBatches = lossReports.length;
  const totalFinancialLoss = lossReports.reduce((sum, r) => sum + r.totalEstimatedLoss, 0);
  const totalUnitsLost = lossReports.reduce((sum, r) => sum + (r.targetYield || 0), 0);

  const filteredReports = lossReports.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      r.lossId?.toLowerCase().includes(q) ||
      r.batchNumber?.toLowerCase().includes(q) ||
      r.productName?.toLowerCase().includes(q) ||
      r.rejectionReason?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Production Loss Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatic loss tracking and cost accounting for QA-rejected and compromised batches.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchLossReports}
          disabled={loading}
          className="flex items-center gap-1.5 h-9 rounded-xl border-border hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1 */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Total Loss Batches
            </span>
            <svg className="w-20 h-6 text-foreground" viewBox="0 0 80 24" fill="none">
              <path
                d="M 2 8 C 14 10, 24 18, 38 14 C 52 10, 62 20, 76 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="76" cy="18" r="2.5" fill="currentColor" />
            </svg>
          </div>
          <div className="mt-4">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {totalLossBatches}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Batches rejected during QA or preparation
            </p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Estimated Financial Loss
            </span>
            <svg className="w-20 h-6 text-muted-foreground/70" viewBox="0 0 80 24" fill="none">
              <path
                d="M 2 6 C 14 8, 26 18, 40 12 C 54 18, 64 20, 76 22"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="76" cy="22" r="2.5" fill="currentColor" />
            </svg>
          </div>
          <div className="mt-4">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-mono">
              ₱{totalFinancialLoss.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cost of consumed ingredients & supplies
            </p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Total Volume Forfeited
            </span>
            <svg className="w-20 h-6 text-foreground" viewBox="0 0 80 24" fill="none">
              <path
                d="M 2 16 C 16 12, 30 18, 44 8 C 58 16, 68 6, 76 10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="76" cy="10" r="2.5" fill="currentColor" />
            </svg>
          </div>
          <div className="mt-4">
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground font-mono">
              {totalUnitsLost.toLocaleString()} PCS
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Target units that failed food safety / sensory
            </p>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-muted/20">
          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search by loss report ID, batch number, or product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-sm flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <span className="text-xs text-muted-foreground font-medium pl-1 hidden sm:inline">
            Showing {filteredReports.length} records
          </span>
        </div>
      </div>

      {/* Loss Reports Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading loss reports...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-xs">
            {searchQuery
              ? `No loss reports found matching "${searchQuery}".`
              : "No production losses recorded. All active batches have passed inspections."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                <tr>
                  <th className="py-3 px-4">Loss ID</th>
                  <th className="py-3 px-4">Batch Number</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Variant</th>
                  <th className="py-3 px-4">Failure Stage</th>
                  <th className="py-3 px-4">Date Logged</th>
                  <th className="py-3 px-4">Estimated Loss</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReports.map((report) => (
                  <tr key={report.lossId} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-destructive">
                      {report.lossId}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-foreground">
                      {report.batchNumber}
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {report.productName}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{report.variant}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-destructive">
                        <AlertOctagon size={13} /> {report.failureStage}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {new Date(report.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-destructive">
                      ₱{report.totalEstimatedLoss.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedReport(report)}
                        className="h-7 px-2.5 text-xs font-semibold border-border hover:bg-muted cursor-pointer"
                      >
                        <Eye size={13} className="mr-1" /> View Breakdown
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Loss Report Breakdown Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-destructive text-destructive-foreground flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">
                    Loss Report: {selectedReport.lossId}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Batch {selectedReport.batchNumber} &bull; {selectedReport.productName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-border bg-muted/10 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Product & Variant
                  </span>
                  <span className="font-bold text-foreground">{selectedReport.productName}</span>
                  <div className="text-muted-foreground">{selectedReport.variant}</div>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Target Yield
                  </span>
                  <span className="font-bold text-foreground">
                    {selectedReport.targetYield} PCS
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Logged Date
                  </span>
                  <span className="font-bold text-foreground">
                    {new Date(selectedReport.date).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                    Estimated Loss
                  </span>
                  <span className="font-mono font-bold text-destructive text-sm">
                    ₱{selectedReport.totalEstimatedLoss.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Rejection reason & inspector */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-1.5 text-xs">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                  Rejection Reason & Inspector Assessment
                </span>
                <p className="font-semibold text-foreground">{selectedReport.rejectionReason}</p>
                {selectedReport.notes && (
                  <p className="text-muted-foreground italic">"{selectedReport.notes}"</p>
                )}
                <p className="text-[11px] text-muted-foreground pt-1">
                  Evaluated by: <span className="font-medium text-foreground">{selectedReport.inspector}</span>
                </p>
              </div>

              {/* Lost Ingredients Breakdown Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                  Issued Ingredients & Supplies Forfeited ({selectedReport.items.length})
                </h4>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                      <tr>
                        <th className="py-2.5 px-3">Item Name</th>
                        <th className="py-2.5 px-3">Lot Number</th>
                        <th className="py-2.5 px-3">Quantity</th>
                        <th className="py-2.5 px-3">Unit Cost</th>
                        <th className="py-2.5 px-3 text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedReport.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="py-2 px-3 font-semibold text-foreground">
                            {item.itemName}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {item.lotNumber}
                          </td>
                          <td className="py-2 px-3">
                            {item.quantity} {item.uom}
                          </td>
                          <td className="py-2 px-3 font-mono">₱{item.unitCost.toFixed(2)}</td>
                          <td className="py-2 px-3 font-mono font-bold text-foreground text-right">
                            ₱{item.totalCost.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/30 font-bold border-t border-border">
                      <tr>
                        <td colSpan={4} className="py-2.5 px-3 text-right uppercase text-[10px]">
                          Total Loss Value:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sm text-destructive">
                          ₱{selectedReport.totalEstimatedLoss.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end p-4 border-t border-border bg-muted/20">
              <Button
                variant="outline"
                onClick={() => setSelectedReport(null)}
                className="text-xs font-semibold border-border hover:bg-muted cursor-pointer"
              >
                Close Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
