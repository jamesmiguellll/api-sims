"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import api from "@/lib/api";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";
import { InventoryItem } from "@/components/inventory/types";
import { LotItem } from "@/components/lots/types";
import InventorySummaryCards from "@/components/inventory/InventorySummaryCards";
import InventoryTable from "@/components/inventory/InventoryTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { CreatePRModal } from "@/components/orders-procurement/pr/CreatePRForm";
import { PurchaseRequisition } from "@/components/orders-procurement/types";

export default function ViewInventory() {
  const auth = useAuth();
  const user = auth?.user;
  const isAuth =
    user?.username === "scmsuser" ||
    user?.username === "ERP-ADMIN" ||
    user?.email === "scmsuser@r3b2p.com" ||
    user?.email === "admin@r3b2p.com" ||
    user?.roles?.includes("Admin");

  const [inventories, setInventories] = useState<InventoryItem[]>([]);
  const [activeTab, setActiveTab] = useState("Raw Materials");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // KPI Metrics
  const [totalItemsCount, setTotalItemsCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiringSoonCount, setExpiringSoonCount] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({
    "Raw Materials": 0,
    "Ingredients": 0,
    "Tools": 0,
    "Finished Goods": 0,
  });

  // PR Modal State (for "Order Now" action)
  const [isCreatePROpen, setIsCreatePROpen] = useState(false);
  const [selectedPRData, setSelectedPRData] = useState<PurchaseRequisition | undefined>(undefined);

  const fetchInventories = useCallback(async () => {
    try {
      const categoryFilter =
        activeTab === "Raw Materials"
          ? "Raw Material"
          : activeTab === "Ingredients"
          ? "Ingredients"
          : activeTab === "Tools"
          ? "Tool"
          : activeTab === "Finished Goods"
          ? "Finished Good"
          : "";
      const path = categoryFilter
        ? `/api/inventory?categoryName=${categoryFilter}&page=${page}&pageSize=10`
        : `/api/inventory?page=${page}&pageSize=10`;

      let res;
      try {
        res = await api.get(path);
      } catch {
        res = await api.get(
          categoryFilter
            ? `/api/inventory?categoryName=${categoryFilter}&page=${page}&pageSize=10`
            : `/api/inventory?page=${page}&pageSize=10`
        );
      }

      if (res.data?.success) {
        setInventories(res.data.data.items || res.data.data || []);
        setTotalPages(res.data.data.totalPages || 1);
        setTotalCount(res.data.data.totalCount || res.data.data.length || 0);
      }
    } catch (e) {
      console.error("Failed to fetch inventories:", e);
    }
  }, [activeTab, page]);

  const fetchKpiData = useCallback(async () => {
    try {
      // 1. Fetch inventories for total count & low-stock count
      let invRes;
      try {
        invRes = await api.get("/api/inventory?pageSize=100");
      } catch {
        invRes = await api.get("/api/inventory?pageSize=100");
      }

      if (invRes.data?.success) {
        const items: InventoryItem[] = invRes.data.data.items || invRes.data.data || [];
        setTotalItemsCount(invRes.data.data.totalCount ?? items.length);
        const low = items.filter(
          (i) => i.isLowStock || i.currentStock <= i.minStockLevel
        ).length;
        setLowStockCount(low);

        const counts: Record<string, number> = {
          "Raw Materials": 0,
          "Ingredients": 0,
          "Tools": 0,
          "Finished Goods": 0,
        };
        items.forEach((item) => {
          const cat = (item.categoryName || "").toLowerCase();
          if (cat.includes("raw")) {
            counts["Raw Materials"] = (counts["Raw Materials"] || 0) + 1;
          } else if (cat.includes("ingredient")) {
            counts["Ingredients"] = (counts["Ingredients"] || 0) + 1;
          } else if (cat.includes("tool") || cat.includes("equip") || cat.includes("suppl")) {
            counts["Tools"] = (counts["Tools"] || 0) + 1;
          } else if (cat.includes("finish") || cat.includes("prod")) {
            counts["Finished Goods"] = (counts["Finished Goods"] || 0) + 1;
          }
        });
        setCategoryCounts(counts);
      }

      // 2. Fetch available lots for expiring soon count (<= 30 days)
      let lotsRes;
      try {
        lotsRes = await api.get("/api/inventory/lots?status=Available&pageSize=100");
      } catch {
        lotsRes = await api.get("/api/inventory/lots?status=Available&pageSize=100");
      }

      if (lotsRes.data?.success) {
        const lots: LotItem[] = lotsRes.data.data.items || lotsRes.data.data || [];
        const now = new Date();
        const expiring = lots.filter((lot) => {
          if (!lot.expiryDate) return false;
          const exp = new Date(lot.expiryDate);
          const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 30;
        }).length;
        setExpiringSoonCount(expiring);
      }
    } catch (e) {
      console.error("Failed to fetch inventory KPI stats:", e);
    }
  }, []);

  useEffect(() => {
    fetchInventories();
  }, [fetchInventories]);

  useEffect(() => {
    fetchKpiData();
  }, [fetchKpiData]);

  // Order Now handler
  const handleOrderNow = (item: InventoryItem) => {
    const neededQty = Math.max(
      0.001,
      Number(((item.maxStockLevel > 0 ? item.maxStockLevel : 10) - item.currentStock).toFixed(3))
    );

    const initialPR: Partial<PurchaseRequisition> = {
      department: "Inventory",
      requestType: "Restock",
      priority: "High",
      purpose: `Restock request for low stock item: ${item.itemName}`,
      notes: `Current Stock: ${item.currentStock} ${item.uomName} | Reorder Point: ${item.minStockLevel} | Max: ${item.maxStockLevel}`,
      items: [
        {
          prItemId: 0,
          itemId: item.itemId,
          itemCode: `SPL-${String(item.itemId).padStart(4, "0")}`,
          itemName: item.itemName,
          uomName: item.uomName || "Unit",
          actualInventory: item.currentStock,
          requestedQuantity: neededQty,
        },
      ],
    };

    setSelectedPRData(initialPR as PurchaseRequisition);
    setIsCreatePROpen(true);
  };

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Inventory Management"
        description="Monitor real-time warehouse stocks, ingredients, raw materials, and finished goods"
        actions={
          isAuth && (
            <Button size="sm" variant="outline" asChild className="gap-1.5 cursor-pointer">
              <Link href="/reports?tab=inventory">
                <FileText className="w-4 h-4" /> Reports
              </Link>
            </Button>
          )
        }
      />

      {/* 3 KPI Cards */}
      <InventorySummaryCards
        totalItems={totalItemsCount}
        lowStockCount={lowStockCount}
        expiringSoonCount={expiringSoonCount}
        categoryCounts={categoryCounts}
      />

      {/* Category Tabs */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: "Raw Materials", label: "RAW MATERIALS" },
            { id: "Ingredients", label: "INGREDIENTS" },
            { id: "Tools", label: "TOOLS & SUPPLIES" },
            { id: "Finished Goods", label: "FINISHED GOODS" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table with progress bar & order now */}
      <InventoryTable
        items={inventories}
        currentPage={page}
        pageSize={10}
        onOrderNow={handleOrderNow}
      />

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
      />

      {/* Create PR Modal triggered by Order Now */}
      {isCreatePROpen && (
        <CreatePRModal
          open={isCreatePROpen}
          onClose={() => {
            setIsCreatePROpen(false);
            setSelectedPRData(undefined);
          }}
          onSuccess={() => {
            setIsCreatePROpen(false);
            setSelectedPRData(undefined);
            fetchInventories();
            fetchKpiData();
          }}
          initialData={selectedPRData}
        />
      )}
    </div>
  );
}
