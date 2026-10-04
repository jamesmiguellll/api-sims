"use client";

import React, { useState } from "react";
import {
  GitBranch, Search, ChevronRight, PackageCheck, Factory, Truck, AlertCircle,
  Box, Layers, ArrowRight, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface TraceNode {
  type: "lot" | "grn" | "batch" | "fgLot" | "shipment" | "supplier";
  id: string;
  label: string;
  subLabel?: string;
  status?: string;
  date?: string;
  children?: TraceNode[];
}

interface RecallSummary {
  batchId: string;
  affectedLots: string[];
  affectedBranches: string[];
  estimatedLoss: number;
  affectedQty: number;
}

function TraceTree({ nodes, depth = 0 }: { nodes: TraceNode[]; depth?: number }) {
  const ICONS: Record<string, React.ElementType> = {
    lot: Box, grn: PackageCheck, batch: Factory, fgLot: Layers, shipment: Truck, supplier: GitBranch,
  };
  return (
    <div className={depth > 0 ? "ml-5 border-l border-dashed border-border pl-4 space-y-2" : "space-y-2"}>
      {nodes.map((node, i) => {
        const Icon = ICONS[node.type] || Box;
        return (
          <div key={i}>
            <div className="flex items-start gap-2 p-2.5 bg-muted/40 rounded-lg border border-border/60">
              <div className="w-6 h-6 rounded-md bg-background border border-border flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{node.label}</p>
                {node.subLabel && <p className="text-xs text-muted-foreground">{node.subLabel}</p>}
                {node.date && <p className="text-xs text-muted-foreground">{node.date}</p>}
              </div>
              {node.status && <StatusBadge status={node.status} />}
            </div>
            {node.children && node.children.length > 0 && (
              <TraceTree nodes={node.children} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ViewTraceability() {
  const [query, setQuery] = useState("");
  const [traceType, setTraceType] = useState<"forward" | "backward">("forward");
  const [traceResult, setTraceResult] = useState<TraceNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRecall, setShowRecall] = useState(false);
  const [recallData, setRecallData] = useState<RecallSummary | null>(null);
  const [recallLoading, setRecallLoading] = useState(false);
  const [applyHold, setApplyHold] = useState(false);

  const handleTrace = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setTraceResult(null);
    try {
      const endpoint = traceType === "forward"
        ? `/api/traceability/forward?lotCode=${encodeURIComponent(query)}`
        : `/api/traceability/backward?batchId=${encodeURIComponent(query)}`;
      const res = await api.get(endpoint);
      if (res.data?.success && res.data.data) {
        // Map flat API data to tree structure
        const d = res.data.data;
        if (traceType === "forward") {
          const tree: TraceNode[] = [{
            type: "lot",
            id: d.lotCode,
            label: d.lotCode,
            subLabel: `${d.itemName || "—"} — ${d.supplierName || "—"}`,
            date: d.receivedDate ? `Received: ${new Date(d.receivedDate).toLocaleDateString()}` : undefined,
            status: d.status,
            children: (d.usedInBatches || []).map((b: any) => ({
              type: "batch",
              id: b.batchId,
              label: b.batchNumber,
              subLabel: b.recipeName || "—",
              date: b.productionDate ? `Produced: ${new Date(b.productionDate).toLocaleDateString()}` : undefined,
              status: b.status,
              children: (b.fgLots || []).map((fg: any) => ({
                type: "fgLot",
                id: fg.fgLotCode,
                label: fg.fgLotCode,
                subLabel: fg.productName,
                date: fg.expiryDate ? `Expires: ${new Date(fg.expiryDate).toLocaleDateString()}` : undefined,
                status: fg.status,
                children: (fg.shipments || []).map((s: any) => ({
                  type: "shipment",
                  id: s.transferId,
                  label: s.transferNumber || `SH-${s.transferId}`,
                  subLabel: `→ ${s.destLocation}`,
                  date: s.shipDate ? new Date(s.shipDate).toLocaleDateString() : undefined,
                  status: s.status,
                })),
              })),
            })),
          }];
          setTraceResult(tree);
        } else {
          const tree: TraceNode[] = [{
            type: "fgLot",
            id: d.fgLotCode || query,
            label: d.fgLotCode || query,
            subLabel: d.productName,
            status: d.status,
            children: (d.producedInBatches || []).map((b: any) => ({
              type: "batch",
              id: b.batchId,
              label: b.batchNumber,
              subLabel: b.recipeName,
              date: b.productionDate ? `Produced: ${new Date(b.productionDate).toLocaleDateString()}` : undefined,
              status: b.status,
              children: (b.ingredientLots || []).map((lot: any) => ({
                type: "lot",
                id: lot.lotCode,
                label: lot.lotCode,
                subLabel: `${lot.itemName} from ${lot.supplierName}`,
                date: lot.receivedDate ? `Received: ${new Date(lot.receivedDate).toLocaleDateString()}` : undefined,
              })),
            })),
          }];
          setTraceResult(tree);
        }
      }
    } catch (e) {
      console.error(e);
      setTraceResult([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRecallSim = async () => {
    if (!query.trim()) return;
    setRecallLoading(true);
    try {
      const res = await api.get(`/api/traceability/recall-simulation?lotCode=${encodeURIComponent(query)}`);
      if (res.data?.success && res.data.data) {
        const d = res.data.data;
        setRecallData({
          batchId: d.batchId || query,
          affectedLots: d.affectedLots || [],
          affectedBranches: d.affectedBranches || [],
          estimatedLoss: d.estimatedLoss || 0,
          affectedQty: d.affectedQty || 0,
        });
      }
      setShowRecall(true);
    } catch (e) {
      console.error(e);
      setRecallData({ batchId: query, affectedLots: [], affectedBranches: [], estimatedLoss: 0, affectedQty: 0 });
      setShowRecall(true);
    } finally {
      setRecallLoading(false);
    }
  };

  const handleApplyRecallHold = async () => {
    if (!query.trim()) return;
    try {
      await api.post("/api/traceability/recall", { lotCode: query, applyHold });
      setShowRecall(false);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Traceability & Recall"
        description="Trace lot genealogy forward through production or backward to raw material suppliers"
      />

      {/* Search Bar */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 text-sm font-mono"
                placeholder="Enter lot code or batch number (e.g. LOT-2026-0042, BAT-2026-0001)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrace()}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setTraceType("forward")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${traceType === "forward" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Forward
                </button>
                <button
                  onClick={() => setTraceType("backward")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${traceType === "backward" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Backward
                </button>
              </div>
              <Button size="sm" onClick={handleTrace} disabled={loading || !query.trim()} className="gap-1.5">
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Trace
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleRecallSim}
                disabled={recallLoading || !query.trim()}
                className="gap-1.5"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Recall Sim
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <span className="font-medium">Forward trace:</span> Start from a raw material lot code. &nbsp;|&nbsp;
            <span className="font-medium">Backward trace:</span> Start from an FG lot or batch number.
          </p>
        </CardContent>
      </Card>

      {/* Trace Result */}
      {loading && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
      )}

      {!loading && traceResult === null && (
        <EmptyState
          icon={GitBranch}
          title="Enter a lot code to trace"
          description="Search by raw material lot (e.g. LOT-2026-0001) for forward trace, or by FG lot / batch number for backward trace."
        />
      )}

      {!loading && traceResult !== null && traceResult.length === 0 && (
        <EmptyState
          icon={GitBranch}
          title="No trace data found"
          description={`No traceability records found for "${query}". Ensure the lot or batch exists in the system.`}
        />
      )}

      {!loading && traceResult && traceResult.length > 0 && (
        <Card className="border-border">
          <CardHeader className="pb-3 border-b border-border/60">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              {traceType === "forward" ? "Forward Trace" : "Backward Trace"} — {query}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <TraceTree nodes={traceResult} />
          </CardContent>
        </Card>
      )}

      {/* Recall Simulation Modal */}
      <Dialog open={showRecall} onOpenChange={setShowRecall}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Recall Simulation — {recallData?.batchId}
            </DialogTitle>
          </DialogHeader>
          {recallData && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Affected Lots</p>
                  <p className="text-2xl font-bold">{recallData.affectedLots.length}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Affected Branches</p>
                  <p className="text-2xl font-bold">{recallData.affectedBranches.length}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Affected Quantity</p>
                  <p className="text-2xl font-bold">{recallData.affectedQty.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Est. ₱ Loss</p>
                  <p className="text-2xl font-bold">
                    ₱{recallData.estimatedLoss.toLocaleString("en-PH", { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>

              {recallData.affectedLots.length > 0 && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Affected Lot Codes</p>
                  <div className="flex flex-wrap gap-1">
                    {recallData.affectedLots.slice(0, 10).map((l) => (
                      <Badge key={l} variant="outline" className="font-mono text-xs">{l}</Badge>
                    ))}
                    {recallData.affectedLots.length > 10 && (
                      <Badge variant="outline" className="text-xs">+{recallData.affectedLots.length - 10} more</Badge>
                    )}
                  </div>
                </div>
              )}

              <Separator />
              <div className="flex items-center justify-between">
                <Label htmlFor="apply-hold" className="text-sm font-medium">
                  Apply Quarantine Hold on all affected lots
                </Label>
                <Switch id="apply-hold" checked={applyHold} onCheckedChange={setApplyHold} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowRecall(false)}>Cancel</Button>
            <Button size="sm" onClick={handleApplyRecallHold}>
              {applyHold ? "Apply Hold & Confirm" : "Confirm Simulation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
