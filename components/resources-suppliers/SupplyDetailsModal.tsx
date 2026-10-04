"use client";

import React, { useEffect, useState } from "react";
import ModalWrapper from "./ModalWrapper";
import { SupplyItem } from "./types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Package, Truck, ShoppingCart, TrendingDown, TrendingUp, Minus } from "lucide-react";
import api from "@/lib/api";

interface SupplyDetailsModalProps {
  item: SupplyItem | null;
  onClose: () => void;
  onEdit?: (item: SupplyItem) => void;
}

interface LinkedSupplier {
  supplierId: number;
  supplierName: string;
  supplierCode?: string;
  leadTimeDays?: number;
}

interface RecentOrder {
  poId: number;
  poNumber: string;
  orderDate: string;
  status: string;
  quantity: number;
  uomName: string;
}

export default function SupplyDetailsModal({
  item,
  onClose,
  onEdit,
}: SupplyDetailsModalProps) {
  const [linkedSuppliers, setLinkedSuppliers] = useState<LinkedSupplier[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!item) {
      setLinkedSuppliers([]);
      setRecentOrders([]);
      return;
    }

    const fetchDetails = async () => {
      setLoading(true);
      try {
        const [suppRes, poRes] = await Promise.allSettled([
          api.get(`/api/supplier-items/by-item/${item.itemId}`).catch(() =>
            api.get(`/api/SupplierItems/by-item/${item.itemId}`)
          ),
          api.get(`/api/purchase-orders?pageSize=100`),
        ]);

        if (suppRes.status === "fulfilled" && suppRes.value?.data?.success) {
          const list = suppRes.value.data.data || [];
          setLinkedSuppliers(
            list.map((s: any) => ({
              supplierId: s.supplierId,
              supplierName: s.supplierCompanyName || s.companyName || s.supplierName || `Supplier #${s.supplierId}`,
              supplierCode: s.supplierCode,
              leadTimeDays: s.leadTimeDays,
            }))
          );
        }

        if (poRes.status === "fulfilled" && poRes.value?.data?.success) {
          const allPOs = poRes.value.data.data?.items || poRes.value.data.data || [];
          const itemOrders: RecentOrder[] = [];
          for (const po of allPOs) {
            const poItems = po.items || [];
            for (const poi of poItems) {
              if (poi.itemId === item.itemId) {
                itemOrders.push({
                  poId: po.poId,
                  poNumber: po.poNumber,
                  orderDate: po.orderDate,
                  status: po.status,
                  quantity: poi.poItemQuantity,
                  uomName: poi.purchaseUomName || item.uomName || "",
                });
              }
            }
          }
          setRecentOrders(itemOrders.slice(0, 5));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [item]);

  if (!item) return null;

  const currentStock = item.currentStock ?? 0;
  const isLowStock = currentStock <= item.minStockLevel;
  const isOverStock = item.maxStockLevel > 0 && currentStock > item.maxStockLevel;

  const stockIcon = isLowStock
    ? <TrendingDown size={12} className="text-foreground" />
    : isOverStock
    ? <TrendingUp size={12} className="text-foreground" />
    : <Minus size={12} className="text-foreground" />;

  const stockLabel = isLowStock ? "Low Stock" : isOverStock ? "Overstock" : "Normal";

  const statusBadge = (status: string) => {
    const s = status.toLowerCase();
    const base = "inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border";
    if (s === "delivered" || s === "completed" || s === "received")
      return `${base} bg-foreground/10 text-foreground border-foreground/20`;
    if (s === "pending" || s === "draft" || s === "approved")
      return `${base} bg-muted text-muted-foreground border-border`;
    if (s === "cancelled" || s === "rejected")
      return `${base} bg-muted/60 text-muted-foreground border-border line-through`;
    return `${base} bg-muted text-muted-foreground border-border`;
  };

  return (
    <ModalWrapper
      open={!!item}
      title="Supply Item Details"
      onClose={onClose}
      size="max-w-2xl"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {/* Header Summary Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-muted/40 border border-border">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-foreground/5 border border-border flex items-center justify-center shrink-0">
              <Package className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">{item.itemName}</h3>
                <StatusBadge status={item.isActive !== false ? "Active" : "Inactive"} />
              </div>
              <p className="text-xs font-mono font-medium text-muted-foreground mt-0.5">
                {item.itemCode || `ITEM-${item.itemId}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-muted text-foreground border border-border px-3 py-1 text-xs font-semibold">
              {item.categoryName || "Raw Materials"}
            </span>
          </div>
        </div>

        {/* Stock Status Cards — monochromatic */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-border bg-card space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Current Stock</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">{currentStock}</span>
              <span className="text-xs text-muted-foreground font-semibold">{item.uomName}</span>
            </div>
            <div className="flex items-center gap-1 pt-1 text-[11px] text-muted-foreground font-medium">
              {stockIcon}
              <span>{stockLabel}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Min Stock Threshold</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">{item.minStockLevel}</span>
              <span className="text-xs text-muted-foreground font-semibold">{item.uomName}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">Reorder trigger point</p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Max Stock Capacity</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground">{item.maxStockLevel}</span>
              <span className="text-xs text-muted-foreground font-semibold">{item.uomName}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">Maximum stock holding</p>
          </div>
        </div>

        {/* Specifications */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Item Specifications
          </h4>
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground font-medium">Supply No</span>
              <span className="font-mono font-semibold text-foreground">{item.itemCode || "-"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground font-medium">Category</span>
              <span className="font-semibold text-foreground">{item.categoryName}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground font-medium">Unit of Measure (UOM)</span>
              <span className="font-semibold text-foreground">{item.uomName}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground font-medium">Status</span>
              <span className="font-semibold text-foreground">
                {item.isActive !== false ? "Active (In Circulation)" : "Inactive (Archived)"}
              </span>
            </div>
          </div>
        </div>

        {/* Linked Suppliers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Truck size={14} /> Linked Suppliers
            </h4>
            <span className="text-[11px] font-medium text-muted-foreground">
              {linkedSuppliers.length} supplier{linkedSuppliers.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading...</div>
            ) : linkedSuppliers.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-xs font-semibold text-foreground">No suppliers linked yet</p>
                <p className="text-[11px] text-muted-foreground">
                  Suppliers mapped to this item will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {linkedSuppliers.map((s) => (
                  <div key={s.supplierId} className="flex items-center justify-between p-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-foreground">{s.supplierName}</p>
                      {s.supplierCode && (
                        <p className="font-mono text-[10px] text-muted-foreground">{s.supplierCode}</p>
                      )}
                    </div>
                    <div className="text-right space-y-0.5">
                      {s.leadTimeDays != null && (
                        <p className="text-[10px] text-muted-foreground">
                          {s.leadTimeDays} days lead time
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShoppingCart size={14} /> Recent Orders
            </h4>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            {loading ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Loading orders...</div>
            ) : recentOrders.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <p className="text-xs font-semibold text-foreground">No orders found</p>
                <p className="text-[11px] text-muted-foreground">
                  Purchase orders for this item will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-[11px]">
                      <th className="px-3 py-2 text-left">PURCHASE ORDER NUMBER</th>
                      <th className="px-3 py-2 text-left">DATE</th>
                      <th className="px-3 py-2 text-left">STATUS</th>
                      <th className="px-3 py-2 text-right">QTY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {recentOrders.map((order, i) => (
                      <tr key={`${order.poId}-${i}`} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-mono font-semibold text-foreground">{order.poNumber}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {new Date(order.orderDate).toLocaleDateString("en-PH", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={statusBadge(order.status)}>{order.status}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                          {order.quantity} {order.uomName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-5 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(item);
              }}
              className="rounded-xl bg-foreground text-background px-5 py-2 text-sm font-semibold hover:bg-foreground/85 transition-colors"
            >
              Edit Item
            </button>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
