"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import ModalWrapper from "./ModalWrapper";
import { Supplier } from "./types";
import api from "@/lib/api";
import { Package, Clock, ShoppingCart } from "lucide-react";

interface CatalogItem {
  itemId: number;
  itemName: string;
  supplierSku: string | null;
  unitPrice: number;
  currency: string;
  purchaseUomName: string;
  packSize: number;
  leadTimeDays: number;
  isPreferred: boolean;
}

interface RecentOrder {
  poId: number;
  poNumber: string;
  orderDate: string;
  status: string;
  totalAmount: number;
  itemCount: number;
}

interface SupplierDetailsModalProps {
  supplier: Supplier | null;
  onClose: () => void;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function SupplierDetailsModal({
  supplier,
  onClose,
}: SupplierDetailsModalProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supplier) {
      setCatalog([]);
      setRecentOrders([]);
      return;
    }

    const loadDetails = async () => {
      setLoading(true);
      try {
        const [catRes, poRes] = await Promise.allSettled([
          api.get(`/api/supplier-items/by-supplier/${supplier.supplierId}`).catch(() =>
            api.get(`/api/SupplierItems/by-supplier/${supplier.supplierId}`)
          ),
          api.get(`/api/purchase-orders?pageSize=50`),
        ]);

        if (catRes.status === "fulfilled" && catRes.value?.data?.success) {
          setCatalog(catRes.value.data.data || []);
        }
        if (poRes.status === "fulfilled" && poRes.value?.data?.success) {
          const allPOs = poRes.value.data.data?.items || poRes.value.data.data || [];
          const filtered = allPOs
            .filter((po: any) => po.supplierId === supplier.supplierId)
            .slice(0, 5)
            .map((po: any) => ({
              poId: po.poId,
              poNumber: po.poNumber,
              orderDate: po.orderDate,
              status: po.status,
              totalAmount: po.totalAmount,
              itemCount: (po.items || []).length,
            }));
          setRecentOrders(filtered);
        }
      } catch (err) {
        console.error("Failed to load supplier details", err);
      } finally {
        setLoading(false);
      }
    };

    loadDetails();
  }, [supplier]);

  if (!supplier) return null;

  const statusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s === "delivered" || s === "completed" || s === "received") return "text-foreground bg-muted border-border";
    if (s === "pending" || s === "draft") return "text-muted-foreground bg-muted/50 border-border";
    if (s === "cancelled" || s === "rejected") return "text-muted-foreground bg-muted/30 border-border line-through";
    return "text-muted-foreground bg-muted border-border";
  };

  return (
    <ModalWrapper
      open={!!supplier}
      title={`Supplier Profile - ${supplier.companyName}`}
      onClose={onClose}
      size="max-w-3xl"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {/* Header */}
        {supplier.supplierCode && (
          <div className="flex items-center justify-end pb-3 border-b border-border">
            <span className="text-xs font-mono text-muted-foreground bg-muted/40 border border-border px-3 py-1 rounded-full">
              Supplier No: {supplier.supplierCode}
            </span>
          </div>
        )}

        {/* Contact Information */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-border bg-card p-4 text-xs">
          <div>
            <p className="font-semibold text-muted-foreground">Contact Person</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{supplier.contactPerson}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Email Address</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{supplier.email}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Phone Number</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{supplier.phone}</p>
          </div>
          <div>
            <p className="font-semibold text-muted-foreground">Physical Address</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{supplier.address}</p>
          </div>
        </div>

        {/* Supplied Items (no prices) */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <Package size={16} className="text-foreground" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Linked Supplies
            </h3>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading catalog...</div>
          ) : catalog.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No items linked to this supplier.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-[11px]">
                    <th className="px-2.5 py-2 text-left">ITEM NAME</th>
                    <th className="px-2.5 py-2 text-left">VENDOR SKU</th>
                    <th className="px-2.5 py-2 text-left">PACK SIZE</th>
                    <th className="px-2.5 py-2 text-left">LEAD TIME</th>
                    <th className="px-2.5 py-2 text-left">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {catalog.map((ci) => (
                    <tr key={ci.itemId} className="hover:bg-muted/20">
                      <td className="px-2.5 py-2.5 font-semibold text-foreground">{ci.itemName}</td>
                      <td className="px-2.5 py-2.5 font-mono text-muted-foreground">{ci.supplierSku || "-"}</td>
                      <td className="px-2.5 py-2.5 text-muted-foreground">
                        {ci.packSize > 1 ? `${ci.packSize} units/pack` : "Standard"}
                      </td>
                      <td className="px-2.5 py-2.5 text-muted-foreground flex items-center gap-1 mt-2">
                        <Clock size={11} /> {ci.leadTimeDays} days
                      </td>
                      <td className="px-2.5 py-2.5">
                        {ci.isPreferred && (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-foreground border border-border">
                            ★ Preferred
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <ShoppingCart size={16} className="text-foreground" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Recent Orders
            </h3>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Loading orders...</div>
          ) : recentOrders.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No purchase orders found for this supplier.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-[11px]">
                    <th className="px-2.5 py-2 text-left">PURCHASE ORDER NUMBER</th>
                    <th className="px-2.5 py-2 text-left">DATE</th>
                    <th className="px-2.5 py-2 text-left">STATUS</th>
                    <th className="px-2.5 py-2 text-right">QUANTITY</th>
                    <th className="px-2.5 py-2 text-right">TOTAL AMOUNT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {recentOrders.map((order) => (
                    <tr key={order.poId} className="hover:bg-muted/20">
                      <td className="px-2.5 py-2.5 font-mono font-semibold text-foreground">{order.poNumber}</td>
                      <td className="px-2.5 py-2.5 text-muted-foreground">{formatDate(order.orderDate)}</td>
                      <td className="px-2.5 py-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold border ${statusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5 text-right text-muted-foreground">
                        {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                      </td>
                      <td className="px-2.5 py-2.5 text-right font-bold text-foreground">
                        ₱{Number(order.totalAmount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-border">
          <Button
            variant="outline"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-foreground hover:text-background transition-colors"
          >
            Close
          </Button>
        </div>
      </div>
    </ModalWrapper>
  );
}
