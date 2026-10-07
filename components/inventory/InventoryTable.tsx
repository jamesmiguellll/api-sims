"use client";

import React, { useState } from "react";
import { InventoryItem } from "./types";
import { LotItem } from "../lots/types";
import api from "@/lib/api";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";

interface InventoryTableProps {
  items: InventoryItem[];
  currentPage: number;
  pageSize: number;
  onOrderNow?: (item: InventoryItem) => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getExpiryDisplay(lot: LotItem) {
  if (!lot.expiryDate) {
    return <span className="text-muted-foreground">—</span>;
  }
  const exp = new Date(lot.expiryDate);
  const now = new Date();
  const diffDays = Math.ceil(
    (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  const formattedDate = formatDate(lot.expiryDate);

  if (diffDays < 0) {
    return (
      <span className="font-semibold text-foreground">
        {formattedDate} <span className="text-[10px] text-muted-foreground">(Expired)</span>
      </span>
    );
  }
  if (diffDays <= 30) {
    return (
      <span className="font-medium text-foreground">
        {formattedDate} <span className="text-[10px] text-muted-foreground">({diffDays}d left)</span>
      </span>
    );
  }
  return <span className="text-foreground">{formattedDate}</span>;
}

export default function InventoryTable({
  items,
  currentPage,
  pageSize,
  onOrderNow,
}: InventoryTableProps) {
  const [expandedItemIds, setExpandedItemIds] = useState<Record<number, boolean>>({});
  const [itemLots, setItemLots] = useState<Record<number, LotItem[]>>({});
  const [loadingLots, setLoadingLots] = useState<Record<number, boolean>>({});

  const toggleRow = async (itemId: number) => {
    const isExpanded = !!expandedItemIds[itemId];
    const nextState = !isExpanded;
    setExpandedItemIds((prev) => ({ ...prev, [itemId]: nextState }));

    if (nextState && !itemLots[itemId]) {
      setLoadingLots((prev) => ({ ...prev, [itemId]: true }));
      try {
        let lots: LotItem[] = [];
        try {
          const res = await api.get(`/api/inventory/lots/byitem/${itemId}`);
          if (res.data?.success && Array.isArray(res.data.data)) {
            lots = res.data.data;
          }
        } catch {
          // Robust fallback to query param endpoint if route compilation lags
          const fallbackRes = await api.get(`/api/inventory/lots?itemId=${itemId}&pageSize=200`);
          if (fallbackRes.data?.success) {
            const raw = fallbackRes.data.data;
            lots = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
          }
        }

        setItemLots((prev) => ({ ...prev, [itemId]: lots }));
      } catch (err) {
        console.error("Failed to load lots for item", itemId, err);
        setItemLots((prev) => ({ ...prev, [itemId]: [] }));
      } finally {
        setLoadingLots((prev) => ({ ...prev, [itemId]: false }));
      }
    }
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold">
            <th className="w-8 px-2 py-3 text-center"></th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap">
              No.
            </th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap">
              Item Name
            </th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap">
              UOM
            </th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap">
              Current Stock
            </th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap">
              Reserved
            </th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap min-w-[180px]">
              Stock Level
            </th>
            <th className="px-3 py-3 text-left font-bold tracking-wider whitespace-nowrap">
              Status
            </th>
            <th className="px-3 py-3 text-center font-bold tracking-wider whitespace-nowrap">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="px-5 py-12 text-center text-sm font-semibold text-muted-foreground"
              >
                No Inventory Records Found
              </td>
            </tr>
          ) : (
            items.map((item, idx) => {
              const isExpanded = !!expandedItemIds[item.itemId];
              const rawLots = itemLots[item.itemId] || [];
              const availableLots = rawLots.filter(
                (lot) => lot.status === "Available" || (lot.reservedQuantity && lot.reservedQuantity > 0)
              );
              const isLoading = !!loadingLots[item.itemId];

              const isLow =
                item.isLowStock || item.currentStock <= item.minStockLevel;
              const maxStock =
                item.maxStockLevel > 0
                  ? item.maxStockLevel
                  : Math.max(item.minStockLevel * 2, item.currentStock, 10);
              const percentage = Math.min(
                100,
                Math.max(0, Math.round((item.currentStock / maxStock) * 100))
              );

              const statusText =
                item.currentStock <= 0
                  ? "Out of Stock"
                  : isLow
                  ? "Low Stock"
                  : "In Stock";

              return (
                <React.Fragment key={item.inventoryId}>
                  <tr
                    onClick={() => toggleRow(item.itemId)}
                    className="hover:bg-muted/30 transition-colors cursor-pointer select-none group"
                  >
                    <td className="px-2 py-3.5 text-center text-muted-foreground group-hover:text-foreground">
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-foreground" />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </td>
                    <td className="px-3 py-3.5 font-bold text-foreground whitespace-nowrap">
                      {(currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-3 py-3.5 font-medium text-foreground">
                      <span className="font-semibold text-foreground">
                        {item.itemName}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-muted-foreground">
                      {item.uomName || "—"}
                    </td>
                    <td className="px-3 py-3.5 font-semibold text-foreground">
                      {item.currentStock.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-3.5 font-semibold font-mono text-foreground">
                      {Number(item.reservedStock || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="w-40 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-foreground">
                            {percentage}%
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Max: {item.maxStockLevel}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-foreground rounded-full transition-all duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <StatusBadge status={statusText} />
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {isLow ? (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOrderNow?.(item);
                          }}
                          className="h-7 px-3 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors cursor-pointer shadow-xs"
                        >
                          Order Now
                        </Button>
                      ) : (
                        <span className="text-muted-foreground font-mono">—</span>
                      )}
                    </td>
                  </tr>

                  {/* Expandable Lot Detail Row */}
                  {isExpanded && (
                    <tr className="bg-muted/10 border-b border-border">
                      <td colSpan={9} className="p-4 sm:p-5">
                        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-border pb-2">
                            <span className="font-semibold text-xs text-foreground">
                              Available Lots Breakdown ({item.itemName})
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              Showing active lots and reserved quantities
                            </span>
                          </div>

                          {isLoading ? (
                            <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">
                              Loading lots...
                            </div>
                          ) : availableLots.length === 0 ? (
                            <div className="py-5 text-center text-xs text-muted-foreground">
                              No active lots found for this item.
                            </div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border text-muted-foreground bg-muted/20">
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Lot Code
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Delivered Date
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      Expiry Date
                                    </th>
                                    <th className="px-3 py-2 text-right font-semibold">
                                      Qty Remaining
                                    </th>
                                    <th className="px-3 py-2 text-right font-semibold">
                                      Reserved
                                    </th>
                                    <th className="px-3 py-2 text-left font-semibold">
                                      % Share
                                    </th>
                                    <th className="px-3 py-2 text-center font-semibold">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                  {availableLots.map((lot) => {
                                    const resQty = Number(lot.reservedQuantity || 0);
                                    const sharePercent =
                                      lot.sharePercent !== null && lot.sharePercent !== undefined
                                        ? Number(lot.sharePercent)
                                        : item.currentStock > 0
                                        ? Math.round((lot.quantityRemaining / item.currentStock) * 100)
                                        : 0;

                                    return (
                                      <tr
                                        key={lot.lotId}
                                        className="hover:bg-muted/30 transition-colors"
                                      >
                                        <td className="px-3 py-2.5 font-mono font-medium text-foreground">
                                          {lot.lotCode}
                                        </td>
                                        <td className="px-3 py-2.5 text-muted-foreground">
                                          {formatDate(lot.receivedDate)}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          {getExpiryDisplay(lot)}
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                                          {lot.quantityRemaining.toLocaleString(
                                            undefined,
                                            {
                                              minimumFractionDigits: 0,
                                              maximumFractionDigits: 2,
                                            }
                                          )}{" "}
                                          <span className="text-[10px] font-normal text-muted-foreground">
                                            {lot.uomName}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-mono font-semibold text-foreground">
                                          {resQty.toLocaleString(undefined, {
                                            minimumFractionDigits: 0,
                                            maximumFractionDigits: 2,
                                          })}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <div className="space-y-1 w-24">
                                            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                              <span>{sharePercent}%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                              <div
                                                className="h-full bg-foreground rounded-full transition-all duration-300"
                                                style={{
                                                  width: `${Math.min(
                                                    sharePercent,
                                                    100
                                                  )}%`,
                                                }}
                                              />
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                          <StatusBadge status={lot.status} />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
