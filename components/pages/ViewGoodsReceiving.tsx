"use client";

import React, { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import api from "@/lib/api";
import GrnTab from "@/components/receiving/GrnTab";
import DiscrepancyTab from "@/components/receiving/DiscrepancyTab";
import StockInTab from "@/components/receiving/StockInTab";
import RtvTab from "@/components/receiving/RtvTab";
import LossReportTab from "@/components/receiving/LossReportTab";

type MainTabId = "grn" | "discrepancies" | "stockin" | "rtv" | "loss";

export default function ViewGoodsReceiving() {
  const [activeTab, setActiveTab] = useState<MainTabId>("grn");
  const [counts, setCounts] = useState({
    grn: 0,
    discrepancies: 0,
    stockin: 0,
    rtv: 0,
    loss: 0,
  });

  // Fetch count indicators for navigation badges
  const loadTabCounts = async () => {
    try {
      const [grnRes, delRes, discRes, stockInRes, rtvRes, lrRes] = await Promise.allSettled([
        api.get("/api/goods-receipts"),
        api.get("/api/deliveries"),
        api.get("/api/Discrepancies"),
        api.get("/api/StockIns"),
        api.get("/api/ReturnToVendors"),
        api.get("/api/LossReports"),
      ]);

      let pendingDeliveriesCount = 0;
      const deliveryPayload = delRes.status === "fulfilled" ? delRes.value.data?.data : null;
      const deliveries = Array.isArray(deliveryPayload?.items)
        ? (deliveryPayload.items as any[])
        : Array.isArray(deliveryPayload)
        ? (deliveryPayload as any[])
        : [];
      if (deliveries.length > 0) {
        const postedDeliveryIds = new Set(
          grnRes.status === "fulfilled" && Array.isArray(grnRes.value.data?.data)
            ? (grnRes.value.data.data as any[])
                .filter((g) => g.status !== "Draft" && g.deliveryId)
                .map((g) => g.deliveryId)
            : []
        );
        pendingDeliveriesCount = deliveries.filter(
          (d: any) =>
            d.status === "Arrived" &&
            (!d.deliveryId || !postedDeliveryIds.has(d.deliveryId))
        ).length;
      }

      let openDiscCount = 0;
      if (discRes.status === "fulfilled" && Array.isArray(discRes.value.data?.data)) {
        openDiscCount = (discRes.value.data.data as any[]).filter((d) => d.status === "Open").length;
      }

      let pendingStockInCount = 0;
      if (stockInRes.status === "fulfilled" && Array.isArray(stockInRes.value.data?.data)) {
        pendingStockInCount = (stockInRes.value.data.data as any[]).filter(
          (s) => s.status === "PendingApproval" || s.status === "Pending"
        ).length;
      }

      let rtvCount = 0;
      if (rtvRes.status === "fulfilled" && Array.isArray(rtvRes.value.data?.data)) {
        rtvCount = (rtvRes.value.data.data as any[]).filter(
          (r) => r.status === "PendingApproval" || r.status === "Pending Approval"
        ).length;
      }

      let lossCount = 0;
      if (lrRes.status === "fulfilled" && Array.isArray(lrRes.value.data?.data)) {
        lossCount = (lrRes.value.data.data as any[]).filter((l) => !l.isAcknowledged).length;
      }

      setCounts({
        grn: pendingDeliveriesCount,
        discrepancies: openDiscCount,
        stockin: pendingStockInCount,
        rtv: rtvCount,
        loss: lossCount,
      });
    } catch (e) {
      console.error("Failed to load header counts:", e);
    }
  };

  useEffect(() => {
    loadTabCounts();
  }, []);

  const tabs: { id: MainTabId; label: string; badgeCount?: number }[] = [
    { id: "grn", label: "GOODS RECEIPT NOTE / RECEIVE", badgeCount: counts.grn },
    { id: "discrepancies", label: "DISCREPANCIES", badgeCount: counts.discrepancies },
    { id: "stockin", label: "STOCK IN", badgeCount: counts.stockin },
    { id: "rtv", label: "SUPPLIER RETURNS", badgeCount: counts.rtv },
    { id: "loss", label: "LOSS / DISPOSAL", badgeCount: counts.loss },
  ];

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Goods Receiving & Inbound Logistics"
        description="End-to-end receipt verification: Purchase Order physical counts & Quality Assurance inspection, automated discrepancy logging, and stock-in approval into inventory."
      />

      {/* Process Tabs */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label}</span>
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <span
                    className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                      isActive ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Content */}
      <div>
        {activeTab === "grn" && (
          <GrnTab
            onPosted={() => {
              setActiveTab("stockin");
              loadTabCounts();
            }}
          />
        )}
        {activeTab === "discrepancies" && <DiscrepancyTab />}
        {activeTab === "stockin" && <StockInTab />}
        {activeTab === "rtv" && <RtvTab />}
        {activeTab === "loss" && <LossReportTab />}
      </div>
    </div>
  );
}
