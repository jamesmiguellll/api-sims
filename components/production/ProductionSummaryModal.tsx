"use client";

import React from "react";
import { X, CheckCircle2, FileText, Printer, Package, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductionSummaryReport } from "./types";

interface ProductionSummaryModalProps {
  open: boolean;
  onClose: () => void;
  report: ProductionSummaryReport;
}

export default function ProductionSummaryModal({
  open,
  onClose,
  report,
}: ProductionSummaryModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center">
              <FileText size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Batch Production Summary Report
              </h3>
              <p className="text-xs text-muted-foreground font-mono">
                {report.batchNumber} &mdash; {report.productName} ({report.variant})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="h-8 text-xs font-semibold border-border hover:bg-muted"
            >
              <Printer size={13} className="mr-1.5" /> Print
            </Button>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto print:max-h-none print:overflow-visible">
          {/* Top Overview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-border bg-muted/10 text-xs">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Target Output
              </span>
              <span className="font-bold text-foreground">{report.targetYield} PCS</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Actual Good Yield
              </span>
              <span className="font-bold text-foreground">{report.actualGoodOutput} PCS</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Approved By
              </span>
              <span className="font-bold text-foreground">{report.approvedBy}</span>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                Completed Date
              </span>
              <span className="font-bold text-foreground">
                {new Date(report.completedAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Finished Product Lot & Expiry Banner */}
          <div className="p-4 rounded-xl border border-foreground/30 bg-muted/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0">
                <Package size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Final System Generated Finished Good Lot
                </p>
                <p className="text-base font-bold font-mono text-foreground">
                  {report.packaging.fgLotNumber}
                </p>
              </div>
            </div>
            <div className="text-right sm:text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Assigned Expiry Date
              </p>
              <p className="text-sm font-semibold font-mono text-foreground">
                {report.packaging.expiryDate}
              </p>
            </div>
          </div>

          {/* Section 1: Materials & Lots Consumed */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-foreground" /> Raw Materials & Lots Issued
            </h4>
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">Ingredient</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3">Lot Number</th>
                    <th className="py-2.5 px-3">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Lot Expiry</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.materialsUsed.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 px-3 text-center text-muted-foreground">
                        Standard Bill of Materials recipe ingredients consumed
                      </td>
                    </tr>
                  ) : (
                    report.materialsUsed.map((m: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="py-2 px-3 font-semibold text-foreground">{m.itemName}</td>
                        <td className="py-2 px-3 text-muted-foreground">{m.supplierName || "Default Supplier"}</td>
                        <td className="py-2 px-3 font-mono font-bold text-foreground">{m.lotNumber}</td>
                        <td className="py-2 px-3">
                          {m.quantity} {m.uom}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                          {m.expiryDate || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Production Stages Timeline */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock size={13} className="text-foreground" /> Production Stages Execution
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {report.stageLogs.map((log: any) => (
                <div
                  key={log.stageName}
                  className="rounded-xl border border-border bg-card p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{log.stageName}</span>
                    <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-foreground text-background">
                      Done
                    </span>
                  </div>
                  {log.photoUrl && (
                    <div className="w-full h-24 rounded-lg border border-border bg-muted/30 overflow-hidden">
                      <img
                        src={log.photoUrl}
                        alt={log.stageName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground">
                    <p>In-Charge: <span className="font-medium text-foreground">{log.inCharge}</span></p>
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: QA Results */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-foreground" /> Quality Assurance Evaluation & Sensory Checklist
            </h4>
            <div className="p-4 rounded-xl border border-border bg-muted/10 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs text-center">
              <div className="p-2 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Appearance</span>
                <span className="font-bold text-foreground">{report.qaResults.overallAppearance}</span>
              </div>
              <div className="p-2 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Aroma</span>
                <span className="font-bold text-foreground">{report.qaResults.aroma}</span>
              </div>
              <div className="p-2 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Texture</span>
                <span className="font-bold text-foreground">{report.qaResults.texture}</span>
              </div>
              <div className="p-2 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Taste Test</span>
                <span className="font-bold text-foreground">{report.qaResults.tasteTest}</span>
              </div>
              <div className="p-2 rounded-lg border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Consistency</span>
                <span className="font-bold text-foreground">{report.qaResults.consistency}</span>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground">
              <p>Inspector: <span className="font-semibold text-foreground">{report.qaResults.inspector}</span></p>
              {report.qaResults.notes && <p className="italic mt-0.5">"{report.qaResults.notes}"</p>}
            </div>
          </div>

          {/* Section 4: Packaging Breakdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package size={13} className="text-foreground" /> Packaging Output Breakdown
            </h4>
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Good Output</span>
                <span className="text-lg font-bold text-foreground">{report.packaging.goodQty} PCS</span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Damaged</span>
                <span className="text-lg font-bold text-foreground">{report.packaging.damagedQty} PCS</span>
              </div>
              <div className="p-3 rounded-xl border border-border bg-card">
                <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Waste</span>
                <span className="text-lg font-bold text-foreground">{report.packaging.wasteQty} PCS</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Packaged by: <span className="font-semibold text-foreground">{report.packaging.packagerName}</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-border bg-muted/20">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold border-border hover:bg-muted"
          >
            Close Report
          </Button>
        </div>
      </div>
    </div>
  );
}
