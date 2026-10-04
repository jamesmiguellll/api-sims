"use client";

import React, { useState, useEffect } from "react";
import { BarChart3, DollarSign, Package, TrendingUp, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

interface ValuationItem {
  itemId: number;
  itemName: string;
  categoryName: string;
  uomName: string;
  onHandQty: number;
  movingAverageCost: number;
  totalValue: number;
  lastReceiptCost: number;
  lastReceiptDate?: string;
}

interface CategoryGroup {
  category: string;
  items: ValuationItem[];
  totalValue: number;
  itemCount: number;
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

function CategoryAccordion({ group }: { group: CategoryGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{group.category}</span>
          <Badge variant="outline" className="text-xs font-mono">{group.itemCount} items</Badge>
        </div>
        <span className="text-sm font-bold tabular-nums">
          ₱{group.totalValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </button>
      {open && (
        <Table>
          <TableHeader>
            <TableRow className="border-border bg-background">
              <TableHead className="text-xs font-semibold text-muted-foreground">Item</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">On-Hand Qty</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">UOM</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">MAC (₱)</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Last Receipt (₱)</TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground text-right">Total Value (₱)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map((item) => (
              <TableRow key={item.itemId} className="border-border text-sm hover:bg-muted/20">
                <TableCell className="font-medium">{item.itemName}</TableCell>
                <TableCell className="text-right tabular-nums">{item.onHandQty.toLocaleString()}</TableCell>
                <TableCell className="text-right text-muted-foreground">{item.uomName}</TableCell>
                <TableCell className="text-right tabular-nums font-mono">
                  {item.movingAverageCost.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground font-mono">
                  {item.lastReceiptCost > 0
                    ? item.lastReceiptCost.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 })
                    : "—"
                  }
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold font-mono">
                  {item.totalValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function ViewValuation() {
  const [items, setItems] = useState<ValuationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchValuation = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/valuation?page=1&pageSize=1000");
      if (res.data?.success) {
        const raw = res.data.data?.items || res.data.data || [];
        setItems(raw.map((i: any) => ({
          itemId: i.itemId,
          itemName: i.itemName || "—",
          categoryName: i.categoryName || "Uncategorized",
          uomName: i.uomName || "Unit",
          onHandQty: i.onHandQty || 0,
          movingAverageCost: i.movingAverageCost || i.averageCost || 0,
          totalValue: i.totalValue || (i.onHandQty || 0) * (i.movingAverageCost || 0),
          lastReceiptCost: i.lastReceiptCost || 0,
          lastReceiptDate: i.lastReceiptDate,
        })));
        setLastRefreshed(new Date());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchValuation(); }, []);

  // Group by category
  const categoryGroups: CategoryGroup[] = React.useMemo(() => {
    const map = new Map<string, ValuationItem[]>();
    items.forEach((item) => {
      const cat = item.categoryName;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    });
    return Array.from(map.entries()).map(([category, catItems]) => ({
      category,
      items: catItems,
      totalValue: catItems.reduce((s, i) => s + i.totalValue, 0),
      itemCount: catItems.length,
    })).sort((a, b) => b.totalValue - a.totalValue);
  }, [items]);

  const totalPortfolioValue = items.reduce((s, i) => s + i.totalValue, 0);
  const totalItems = items.length;
  const avgMAC = totalItems > 0
    ? items.reduce((s, i) => s + i.movingAverageCost, 0) / totalItems
    : 0;

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Inventory Valuation"
        description="Moving average cost (MAC) report — real-time portfolio value by category"
        actions={
          <Button size="sm" variant="outline" onClick={fetchValuation} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-background" />
            </div>
            <div>
              {loading ? <Skeleton className="h-7 w-28 mb-1" /> : (
                <p className="text-2xl font-bold tabular-nums">
                  ₱{totalPortfolioValue.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Total Portfolio Value</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              {loading ? <Skeleton className="h-7 w-16 mb-1" /> : (
                <p className="text-2xl font-bold">{totalItems}</p>
              )}
              <p className="text-xs text-muted-foreground">Valued Items</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              {loading ? <Skeleton className="h-7 w-24 mb-1" /> : (
                <p className="text-2xl font-bold tabular-nums">
                  ₱{avgMAC.toLocaleString("en-PH", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Avg Moving Avg Cost</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category breakdown */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          By Category — as of {lastRefreshed.toLocaleTimeString()}
        </p>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
          </div>
        ) : categoryGroups.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No valuation data"
            description="Add items and create purchase orders to generate inventory valuation data."
          />
        ) : (
          <div className="space-y-2">
            {categoryGroups.map((group) => (
              <CategoryAccordion key={group.category} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
