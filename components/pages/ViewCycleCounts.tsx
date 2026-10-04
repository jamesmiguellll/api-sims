"use client";

import React, { useState, useEffect } from "react";
import {
  ClipboardList, Plus, Search, CheckCircle, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import api from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface CycleCount {
  cycleCountId: number;
  countNumber: string;
  locationName: string;
  countedBy: string;
  status: string;
  startedDate: string;
  completedDate?: string;
  totalItems: number;
  varianceItems: number;
}

interface CycleCountItem {
  cycleCountItemId: number;
  itemName: string;
  categoryName: string;
  systemQty: number;
  countedQty: number;
  variance: number;
  uomName: string;
  status: string;
}

interface Location {
  locationId: number;
  locationName: string;
}

function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export default function ViewCycleCounts() {
  const [counts, setCounts] = useState<CycleCount[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCount, setSelectedCount] = useState<CycleCount | null>(null);
  const [countItems, setCountItems] = useState<CycleCountItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [newCount, setNewCount] = useState({ locationId: "", countedBy: "" });
  const [saving, setSaving] = useState(false);

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const [ccRes, locRes] = await Promise.allSettled([
        api.get("/api/cycle-counts?page=1&pageSize=100"),
        api.get("/api/locations?pageSize=100"),
      ]);
      if (ccRes.status === "fulfilled" && ccRes.value.data?.success) {
        const raw = ccRes.value.data.data?.items || ccRes.value.data.data || [];
        setCounts(raw.map((c: any) => ({
          cycleCountId: c.cycleCountId,
          countNumber: c.countNumber || `CC-${String(c.cycleCountId).padStart(4, "0")}`,
          locationName: c.locationName || "—",
          countedBy: c.countedBy || "—",
          status: c.status || "Draft",
          startedDate: c.startedDate ? new Date(c.startedDate).toLocaleDateString() : "—",
          completedDate: c.completedDate ? new Date(c.completedDate).toLocaleDateString() : undefined,
          totalItems: c.totalItems || 0,
          varianceItems: c.varianceItems || 0,
        })));
      }
      if (locRes.status === "fulfilled" && locRes.value.data?.success) {
        const raw = locRes.value.data.data?.items || locRes.value.data.data || [];
        setLocations(raw.map((l: any) => ({ locationId: l.locationId, locationName: l.locationName || l.name })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCounts(); }, []);

  const openDetail = async (cc: CycleCount) => {
    setSelectedCount(cc);
    setShowDetailModal(true);
    setLoadingItems(true);
    try {
      const res = await api.get(`/api/cycle-counts/${cc.cycleCountId}/items`);
      if (res.data?.success) {
        const raw = res.data.data || [];
        setCountItems(raw.map((i: any) => ({
          cycleCountItemId: i.cycleCountItemId,
          itemName: i.itemName || "—",
          categoryName: i.categoryName || "—",
          systemQty: i.systemQty || 0,
          countedQty: i.countedQty ?? i.systemQty ?? 0,
          variance: (i.countedQty ?? i.systemQty ?? 0) - (i.systemQty || 0),
          uomName: i.uomName || "Unit",
          status: i.variance !== 0 ? "Variance" : "Matched",
        })));
      }
    } catch (e) {
      console.error(e);
      setCountItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleCreateCount = async () => {
    if (!newCount.locationId) return;
    setSaving(true);
    try {
      await api.post("/api/cycle-counts", {
        locationId: parseInt(newCount.locationId),
        countedBy: newCount.countedBy || "System",
      });
      setShowCreateModal(false);
      setNewCount({ locationId: "", countedBy: "" });
      fetchCounts();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleReconcile = async () => {
    if (!selectedCount) return;
    try {
      await api.post(`/api/cycle-counts/${selectedCount.cycleCountId}/reconcile`);
      setShowReconcileDialog(false);
      setShowDetailModal(false);
      fetchCounts();
    } catch (e) {
      console.error(e);
    }
  };

  const q = search.toLowerCase().trim();
  const filtered = counts.filter(c =>
    !q ||
    c.countNumber.toLowerCase().includes(q) ||
    c.cycleCountId.toString().includes(q) ||
    c.locationName.toLowerCase().includes(q) ||
    (c.countedBy && c.countedBy.toLowerCase().includes(q))
  );

  const totalCounts = counts.length;
  const inProgressCounts = counts.filter(c => c.status === "InProgress" || c.status === "In Progress").length;
  const reconciledCounts = counts.filter(c => c.status === "Reconciled").length;
  const varianceCounts = counts.reduce((sum, c) => sum + (c.varianceItems || 0), 0);

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Cycle Counts"
        description="Physical inventory audits with variance reconciliation"
        actions={
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> New Count
          </Button>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Counts",     value: totalCounts,     icon: ClipboardList },
          { label: "In Progress",      value: inProgressCounts, icon: RefreshCw },
          { label: "Reconciled",       value: reconciledCounts, icon: CheckCircle },
          { label: "Variance Items",   value: varianceCounts,  icon: AlertCircle },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm w-56" placeholder="Search by Count ID or Location..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card className="border-border">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="text-xs font-semibold text-muted-foreground">Count #</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Location</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Counted By</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Started</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Items</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Variances</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <SkeletonRows cols={7} />
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={ClipboardList}
                    title="No cycle counts yet"
                    description="Create a cycle count to begin a physical inventory audit for a location."
                    actionLabel="New Count"
                    onAction={() => setShowCreateModal(true)}
                  />
                </TableCell>
              </TableRow>
            ) : filtered.map((cc) => (
              <TableRow
                key={cc.cycleCountId}
                className="border-border cursor-pointer hover:bg-muted/40 text-sm"
                onClick={() => openDetail(cc)}
              >
                <TableCell className="font-mono text-xs font-semibold">{cc.countNumber}</TableCell>
                <TableCell className="font-medium">{cc.locationName}</TableCell>
                <TableCell className="text-muted-foreground">{cc.countedBy}</TableCell>
                <TableCell className="text-muted-foreground">{cc.startedDate}</TableCell>
                <TableCell>{cc.totalItems}</TableCell>
                <TableCell>
                  {cc.varianceItems > 0
                    ? <span className="font-semibold">{cc.varianceItems}</span>
                    : <span className="text-muted-foreground">—</span>
                  }
                </TableCell>
                <TableCell><StatusBadge status={cc.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">New Cycle Count</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Location</Label>
              <Select value={newCount.locationId} onValueChange={(v) => setNewCount((p) => ({ ...p, locationId: v }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.locationId} value={String(l.locationId)}>{l.locationName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Counted By</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Your name..."
                value={newCount.countedBy}
                onChange={(e) => setNewCount((p) => ({ ...p, countedBy: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateCount} disabled={saving || !newCount.locationId}>
              {saving ? "Creating..." : "Create Count"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center justify-between">
              <span>{selectedCount?.countNumber}</span>
              {selectedCount && <StatusBadge status={selectedCount.status} />}
            </DialogTitle>
          </DialogHeader>
          {selectedCount && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{selectedCount.locationName}</p></div>
                <div><p className="text-xs text-muted-foreground">Counted By</p><p>{selectedCount.countedBy}</p></div>
                <div><p className="text-xs text-muted-foreground">Started</p><p>{selectedCount.startedDate}</p></div>
              </div>
              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Variance Summary</p>
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs font-semibold">Item</TableHead>
                    <TableHead className="text-xs font-semibold text-right">System Qty</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Counted Qty</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Variance</TableHead>
                    <TableHead className="text-xs font-semibold">UOM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingItems ? (
                    <SkeletonRows cols={5} rows={4} />
                  ) : countItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8 text-sm">
                        No items in this count
                      </TableCell>
                    </TableRow>
                  ) : countItems.map((item) => (
                    <TableRow key={item.cycleCountItemId} className="border-border text-sm">
                      <TableCell className="font-medium">{item.itemName}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.systemQty.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{item.countedQty.toLocaleString()}</TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${item.variance !== 0 ? "text-foreground" : "text-muted-foreground"}`}>
                        {item.variance > 0 ? "+" : ""}{item.variance.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.uomName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowDetailModal(false)}>Close</Button>
            {selectedCount?.status !== "Reconciled" && (
              <Button size="sm" onClick={() => setShowReconcileDialog(true)}>
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Reconcile
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reconcile Confirm */}
      <Dialog open={showReconcileDialog} onOpenChange={setShowReconcileDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Reconcile Count</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will post ledger adjustments for all variance items in {selectedCount?.countNumber}. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowReconcileDialog(false)}>Cancel</Button>
            <Button size="sm" onClick={handleReconcile}>Confirm & Post Adjustments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
