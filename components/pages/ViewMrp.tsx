"use client";

import React, { useState } from "react";
import {
  Calculator, Play, Plus, Trash2, Package, AlertCircle, ShoppingCart, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface PlannedRun {
  recipeId: string;
  recipeName: string;
  batchCount: number;
}

interface MrpRequirement {
  itemId: number;
  itemName: string;
  categoryName: string;
  uomName: string;
  grossRequirement: number;
  onHandQty: number;
  onOrderQty: number;
  netRequirement: number;
  urgency: "Critical" | "High" | "Normal" | "None";
  preferredSupplier: string;
  estimatedCost: number;
  reorderPoint: number;
}

interface Recipe {
  recipeId: number;
  recipeName: string;
}

const URGENCY_TIER: Record<string, string> = {
  Critical: "active",
  High:     "subtle",
  Normal:   "muted",
  None:     "outline",
};

function UrgencyBadge({ urgency }: { urgency: string }) {
  const tier = URGENCY_TIER[urgency] || "muted";
  const cls: Record<string, string> = {
    active:  "bg-foreground text-background border-transparent",
    subtle:  "bg-badge-subtle text-badge-subtle-foreground border-transparent",
    muted:   "bg-badge-muted text-badge-muted-foreground border-transparent",
    outline: "bg-transparent text-muted-foreground border-border",
  };
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-md border ${cls[tier]}`}>
      {urgency}
    </span>
  );
}

export default function ViewMrp() {
  const [horizon, setHorizon] = useState("30");
  const [plannedRuns, setPlannedRuns] = useState<PlannedRun[]>([]);
  const [results, setResults] = useState<MrpRequirement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoaded, setRecipesLoaded] = useState(false);
  const [showPrModal, setShowPrModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MrpRequirement | null>(null);
  const [prSaving, setPrSaving] = useState(false);
  const [newRun, setNewRun] = useState({ recipeId: "", batchCount: "1" });

  // Load recipes on first use
  const loadRecipes = async () => {
    if (recipesLoaded) return;
    try {
      const res = await api.get("/api/recipes?pageSize=100");
      if (res.data?.success) {
        const raw = res.data.data?.items || res.data.data || [];
        setRecipes(raw.map((r: any) => ({ recipeId: r.recipeId, recipeName: r.recipeName || r.name })));
      }
    } catch (e) { console.error(e); }
    setRecipesLoaded(true);
  };

  const addPlannedRun = () => {
    if (!newRun.recipeId) return;
    const recipe = recipes.find((r) => String(r.recipeId) === newRun.recipeId);
    if (!recipe) return;
    setPlannedRuns((prev) => [
      ...prev,
      { recipeId: newRun.recipeId, recipeName: recipe.recipeName, batchCount: parseInt(newRun.batchCount) || 1 },
    ]);
    setNewRun({ recipeId: "", batchCount: "1" });
  };

  const removeRun = (idx: number) => setPlannedRuns((p) => p.filter((_, i) => i !== idx));

  const runMrp = async () => {
    setLoading(true);
    setResults(null);
    try {
      const body = {
        planningHorizonDays: parseInt(horizon) || 30,
        plannedBatches: plannedRuns.map((r) => ({
          recipeId: parseInt(r.recipeId),
          batchCount: r.batchCount,
        })),
      };
      const res = await api.post("/api/mrp/plan", body);
      if (res.data?.success && res.data.data) {
        const raw = res.data.data?.requirements || res.data.data || [];
        setResults(raw.map((r: any) => ({
          itemId: r.itemId,
          itemName: r.itemName || "—",
          categoryName: r.categoryName || "—",
          uomName: r.uomName || "Unit",
          grossRequirement: r.grossRequirement || 0,
          onHandQty: r.onHandQty || 0,
          onOrderQty: r.onOrderQty || 0,
          netRequirement: r.netRequirement || 0,
          urgency: r.urgency || (r.netRequirement > 0 ? "Normal" : "None"),
          preferredSupplier: r.preferredSupplier || "—",
          estimatedCost: r.estimatedCost || 0,
          reorderPoint: r.reorderPoint || 0,
        })));
      }
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePR = async () => {
    if (!selectedItem) return;
    setPrSaving(true);
    try {
      await api.post("/api/purchase-requisitions", {
        itemId: selectedItem.itemId,
        quantity: selectedItem.netRequirement,
        notes: `Auto-generated from MRP run (${horizon}d horizon)`,
      });
      setShowPrModal(false);
    } catch (e) {
      console.error(e);
    } finally {
      setPrSaving(false);
    }
  };

  const needsReorder = results ? results.filter((r) => r.netRequirement > 0) : [];
  const critical = results ? results.filter((r) => r.urgency === "Critical").length : 0;

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="MRP Planning"
        description="Material requirements planning — calculate gross/net requirements and generate reorder suggestions"
      />

      {/* Planning Inputs */}
      <Card className="border-border">
        <CardHeader className="pb-3 border-b border-border/60">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            Planning Parameters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Planning Horizon (days)</Label>
              <Input
                type="number"
                className="h-9 text-sm"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
                min="1"
                max="365"
              />
            </div>
          </div>

          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Planned Production Runs (optional)</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs font-medium">Recipe</Label>
                <Select
                  value={newRun.recipeId}
                  onValueChange={(v) => setNewRun((p) => ({ ...p, recipeId: v }))}
                  onOpenChange={(open) => { if (open) loadRecipes(); }}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select recipe..." />
                  </SelectTrigger>
                  <SelectContent>
                    {recipes.length === 0
                      ? <SelectItem value="none" disabled>No recipes loaded yet</SelectItem>
                      : recipes.map((r) => (
                          <SelectItem key={r.recipeId} value={String(r.recipeId)}>{r.recipeName}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1.5">
                <Label className="text-xs font-medium">Batches</Label>
                <Input
                  type="number"
                  className="h-9 text-sm"
                  value={newRun.batchCount}
                  onChange={(e) => setNewRun((p) => ({ ...p, batchCount: e.target.value }))}
                  min="1"
                />
              </div>
              <Button size="sm" variant="outline" onClick={addPlannedRun} className="gap-1.5 h-9">
                <Plus className="w-3.5 h-3.5" /> Add
              </Button>
            </div>

            {plannedRuns.length > 0 && (
              <div className="space-y-1 mt-2">
                {plannedRuns.map((run, i) => (
                  <div key={i} className="flex items-center justify-between bg-muted/40 rounded-md px-3 py-2 text-sm">
                    <span className="font-medium">{run.recipeName}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{run.batchCount} batch{run.batchCount > 1 ? "es" : ""}</span>
                      <button onClick={() => removeRun(i)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={runMrp} disabled={loading} className="gap-1.5">
              {loading ? <><Clock className="w-4 h-4 animate-pulse" />Running...</>
                : <><Play className="w-4 h-4" />Run MRP Plan</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
          </CardContent>
        </Card>
      )}

      {!loading && results === null && (
        <EmptyState
          icon={Calculator}
          title="Run MRP to see requirements"
          description="Configure a planning horizon, optionally add planned production runs, then click Run MRP Plan."
        />
      )}

      {!loading && results !== null && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Total Items",   value: results.length,        icon: Package },
              { label: "Need Reorder",  value: needsReorder.length,   icon: ShoppingCart },
              { label: "Critical",      value: critical,              icon: AlertCircle },
              { label: "Est. Cost",     value: `₱${needsReorder.reduce((s, r) => s + r.estimatedCost, 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`, icon: Calculator },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {results.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No material requirements"
              description="All items have sufficient stock for the planning horizon and planned batches."
            />
          ) : (
            <Card className="border-border">
              <CardHeader className="pb-3 border-b border-border/60">
                <CardTitle className="text-sm font-semibold">Material Requirements</CardTitle>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs font-semibold text-muted-foreground">Item</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">Gross Req.</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">On-Hand</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">On-Order</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">Net Req.</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Urgency</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground">Preferred Supplier</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground text-right">Est. Cost</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((req) => (
                    <TableRow key={req.itemId} className="border-border text-sm hover:bg-muted/20">
                      <TableCell>
                        <div>
                          <p className="font-medium">{req.itemName}</p>
                          <p className="text-xs text-muted-foreground">{req.uomName}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{req.grossRequirement.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{req.onHandQty.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{req.onOrderQty.toLocaleString()}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${req.netRequirement > 0 ? "" : "text-muted-foreground"}`}>
                        {req.netRequirement.toLocaleString()}
                      </TableCell>
                      <TableCell><UrgencyBadge urgency={req.urgency} /></TableCell>
                      <TableCell className="text-muted-foreground">{req.preferredSupplier}</TableCell>
                      <TableCell className="text-right tabular-nums font-mono text-sm">
                        {req.estimatedCost > 0
                          ? `₱${req.estimatedCost.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"
                        }
                      </TableCell>
                      <TableCell>
                        {req.netRequirement > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 gap-1"
                            onClick={() => { setSelectedItem(req); setShowPrModal(true); }}
                          >
                            <ShoppingCart className="w-3 h-3" />
                            Create PR
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Create PR Dialog */}
      <Dialog open={showPrModal} onOpenChange={setShowPrModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Create Purchase Requisition</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-3 text-sm">
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Item</span>
                  <span className="font-medium">{selectedItem.itemName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Requirement</span>
                  <span className="font-semibold">{selectedItem.netRequirement.toLocaleString()} {selectedItem.uomName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Preferred Supplier</span>
                  <span>{selectedItem.preferredSupplier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated Cost</span>
                  <span className="font-mono">
                    ₱{selectedItem.estimatedCost.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                A Purchase Requisition will be created for {selectedItem.netRequirement.toLocaleString()} {selectedItem.uomName} of {selectedItem.itemName}.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowPrModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreatePR} disabled={prSaving}>
              {prSaving ? "Creating..." : "Create PR"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
