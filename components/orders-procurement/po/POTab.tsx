"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Search,
  RefreshCw,
  Inbox,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { PurchaseOrderPO, POStatus } from "../types";
import { POTable } from "./POTable";
import { PODetailsModal } from "./PODetailsModal";
import { POActionModal, POActionType } from "./POActionModal";
import { CreatePOModal } from "./CreatePOModal";
import { CreateDeliveryModal } from "../delivery/CreateDeliveryModal";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";

const STATUS_TABS: (POStatus | "All")[] = [
  "All",
  "Draft",
  "Pending Approval",
  "Returned",
  "Approved",
  "Ordered",
  "Rejected",
  "Cancelled",
];

function mapPO(o: any): PurchaseOrderPO {
  return {
    poId: o.poId,
    poNumber: o.poNumber,
    prId: o.prId ?? undefined,
    prNumber: o.prNumber ?? undefined,
    supplierId: o.supplierId,
    supplierName: o.supplierName || "—",
    requestedBy: o.requestedBy || "—",
    orderDate: o.orderDate,
    expectedArrivalDate: o.expectedArrivalDate,
    status: o.status as POStatus,
    paymentType: o.paymentType,
    adminNotes: o.adminNotes ?? undefined,
    totalAmount: o.totalAmount || 0,
    items: (o.items || []).map((i: any) => ({
      poItemId: i.poItemId,
      itemId: i.itemId,
      itemName: i.itemName,
      poItemQuantity: i.poItemQuantity,
      receivedQuantity: i.receivedQuantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice ?? i.lineTotal ?? (i.poItemQuantity * (i.unitPrice || 0)),
      purchaseUomId: i.purchaseUomId,
      purchaseUomName: i.purchaseUomName || "Unit",
      lineTotal: i.lineTotal ?? i.totalPrice ?? (i.poItemQuantity * (i.unitPrice || 0)),
    })),
  };
}

export function POTab() {
  const { isAdmin } = useAuth();

  const [orders, setOrders] = useState<PurchaseOrderPO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Extract unique suppliers from orders for the filter
  const uniqueSuppliers = useMemo(() => {
    const suppliers = new Set(orders.map((po) => po.supplierName).filter(Boolean));
    return Array.from(suppliers).sort();
  }, [orders]);

  const [selectedPO, setSelectedPO] = useState<PurchaseOrderPO | null>(null);
  const [actionModal, setActionModal] = useState<{ po: PurchaseOrderPO; type: POActionType } | null>(null);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrderPO | null>(null);
  const [deliveryPO, setDeliveryPO] = useState<PurchaseOrderPO | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/purchase-orders?page=1&pageSize=1000");
      if (res.data?.success) {
        const raw = res.data.data?.items || res.data.data || [];
        setOrders(raw.map(mapPO));
      }
    } catch (e) {
      console.error("Failed to fetch purchase orders:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Counts per tab
  const counts = useMemo(() => {
    const map: Record<string, number> = { All: orders.length, Requests: 0 };
    STATUS_TABS.forEach((t) => { map[t] = 0; });
    orders.forEach((po) => {
      const st = po.status;
      if (map[st] !== undefined) map[st]++;
      if (st === "Pending Approval") map.Requests++;
    });
    map.All = orders.length;
    return map;
  }, [orders]);

  // Filtered list
  const filteredList = useMemo(() => {
    return orders.filter((po) => {
      if (activeTab === "Requests") {
        if (po.status !== "Pending Approval") return false;
      } else if (activeTab !== "All") {
        if (po.status !== activeTab) return false;
      }

      // Supplier filter
      if (supplierFilter && po.supplierName !== supplierFilter) return false;

      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          po.poNumber?.toLowerCase().includes(s) ||
          po.prNumber?.toLowerCase().includes(s) ||
          po.supplierName?.toLowerCase().includes(s) ||
          po.requestedBy?.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [orders, activeTab, search, supplierFilter]);

  const totalCount = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, page, pageSize]);

  // Status update handler
  const handleStatusUpdate = async (poId: number, status: string, adminNotes?: string) => {
    try {
      await api.put(`/api/purchase-orders/${poId}/status`, {
        status,
        adminNotes: adminNotes || null,
      });
      await fetchOrders();
    } catch (e: any) {
      console.error("Status update failed:", e);
      alert(e?.response?.data?.message || "Failed to update purchase order status.");
    }
  };

  return (
    <div className="space-y-6 animate-page-in">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Purchase Orders</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage supplier purchase orders based on approved requisitions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchOrders}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors h-10"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>

          {!isAdmin && (
            <Button
              type="button"
              onClick={() => setOpenCreateModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 transition-colors shadow-sm h-10"
            >
              <Plus className="w-4 h-4" /> Create Purchase Order
            </Button>
          )}
        </div>
      </div>

      {/* Filters Bar */}
      <div className="mb-6 border border-border rounded-xl overflow-hidden bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-muted/20">
          <div className="flex items-center gap-3 flex-1">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search by Purchase Order No., Purchase Requisition Ref., Supplier, or Requested By..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-sm flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-border/50">
            <div className="flex items-center">
              <Select
                value={supplierFilter === "" ? "all" : supplierFilter}
                onValueChange={(val) => {
                  setSupplierFilter(val === "all" ? "" : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 min-w-[210px] w-auto rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm focus:ring-1 focus:ring-ring">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent className="min-w-[210px]">
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {uniqueSuppliers.map((sup) => (
                    <SelectItem key={sup} value={sup}>
                      {sup}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max pb-2">
          {/* Requests Tab — Admin only */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => { setActiveTab("Requests"); setPage(1); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "Requests"
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span>Requests</span>
              {counts.Requests > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTab === "Requests" ? "bg-background text-foreground" : "bg-foreground/20 text-foreground"
                }`}>
                  {counts.Requests}
                </span>
              )}
            </button>
          )}

          {/* Standard Status Tabs */}
          {STATUS_TABS.map((tab) => {
            const count = counts[tab] || 0;
            const isSelected = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => { setActiveTab(tab); setPage(1); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span>{tab}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                  isSelected ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Requests info banner */}
      {activeTab === "Requests" && (
        <div className="p-3 rounded-xl border border-border bg-muted/20 text-xs text-foreground flex items-center gap-2">
          <Inbox className="w-4 h-4 text-foreground shrink-0" />
          <span>Showing all purchase orders pending your review. Approve, Reject, or Return for Revision.</span>
        </div>
      )}

      {/* PO Table */}
      <POTable
        orders={paginatedList}
        isAdmin={isAdmin}
        onView={(po) => setSelectedPO(po)}
        onEdit={(po) => setSelectedPO(po)} // For now opens details; edit form is a future iteration
        onCancel={(po) => setActionModal({ po, type: "cancel" })}
      />

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
      />

      {/* PO Details / Review Modal */}
      <PODetailsModal
        po={selectedPO}
        isAdmin={isAdmin}
        onClose={() => setSelectedPO(null)}
        onEdit={(po) => { setSelectedPO(null); setEditingPO(po); }}
        onApprove={(po) => { setSelectedPO(null); setActionModal({ po, type: "approve" }); }}
        onReject={(po) => { setSelectedPO(null); setActionModal({ po, type: "reject" }); }}
        onReturn={(po) => { setSelectedPO(null); setActionModal({ po, type: "return" }); }}
        onCancel={(po) => { setSelectedPO(null); setActionModal({ po, type: "cancel" }); }}
        onCreateDelivery={(po) => { setSelectedPO(null); setDeliveryPO(po); }}
      />

      {/* Action Confirmation Modal */}
      {actionModal && (
        <POActionModal
          actionType={actionModal.type}
          poNumber={actionModal.po.poNumber}
          onClose={() => setActionModal(null)}
          onConfirm={async (notes) => {
            const { po, type } = actionModal;
            if (type === "approve") {
              await handleStatusUpdate(po.poId, "Approved");
            } else if (type === "reject") {
              await handleStatusUpdate(po.poId, "Rejected", notes);
            } else if (type === "return") {
              await handleStatusUpdate(po.poId, "Returned", notes);
            } else if (type === "cancel") {
              await handleStatusUpdate(po.poId, "Cancelled", notes);
            }
            setActionModal(null);
          }}
        />
      )}

      {/* Create PO Modal */}
      {openCreateModal && (
        <CreatePOModal
          open={openCreateModal}
          onClose={() => setOpenCreateModal(false)}
          onSuccess={() => {
            setOpenCreateModal(false);
            fetchOrders();
          }}
        />
      )}

      {/* Edit PO Modal */}
      {editingPO && (
        <CreatePOModal
          open={!!editingPO}
          initialPo={editingPO}
          isEdit={true}
          onClose={() => setEditingPO(null)}
          onSuccess={() => {
            setEditingPO(null);
            fetchOrders();
          }}
        />
      )}

      {/* Schedule Delivery Modal */}
      {deliveryPO && (
        <CreateDeliveryModal
          open={!!deliveryPO}
          initialPo={deliveryPO}
          onClose={() => setDeliveryPO(null)}
          onSuccess={() => {
            setDeliveryPO(null);
            fetchOrders();
          }}
        />
      )}
    </div>
  );
}
