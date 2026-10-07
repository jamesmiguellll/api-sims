"use client";

import React, { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/shared/PageHeader";
import ProductionRequestsTab from "@/components/production/ProductionRequestsTab";
import MaterialIssuanceTab from "@/components/production/MaterialIssuanceTab";
import ProductionTrackingTab from "@/components/production/ProductionTrackingTab";
import ProductionQaTab from "@/components/production/ProductionQaTab";
import ProductionStockInTab from "@/components/production/ProductionStockInTab";
import ConfigurationTab from "@/components/production/ConfigurationTab";
import LossTab from "@/components/production/LossTab";

export default function ProductionPage() {
  const { user, activeAccount, switchAccount } = useAuth();

  const isInventoryManager = Boolean(
    activeAccount === "inventory_manager" ||
    user?.email?.toLowerCase() === "inventorymanager@r3b2p.com" ||
    user?.email?.toLowerCase() === "scmsuser@r3b2p.com" ||
    user?.roles?.includes("Inventory Manager") ||
    user?.roles?.includes("InventoryManager")
  );

  const isHeadCook = Boolean(
    activeAccount === "head_cook" ||
    user?.email?.toLowerCase() === "headcook@r3b2p.com" ||
    user?.username === "headcook" ||
    user?.roles?.includes("Head Cook")
  );

  const isQaOfficer = Boolean(
    activeAccount === "qa_officer" ||
    user?.email?.toLowerCase() === "qaofficer@r3b2p.com" ||
    user?.username === "ramon" ||
    user?.roles?.includes("QA Officer") ||
    user?.roles?.includes("Quality Assurance")
  );

  const isAdmin = Boolean(
    activeAccount === "admin" ||
    user?.email?.toLowerCase() === "admin@r3b2p.com" ||
    user?.roles?.includes("Admin")
  );

  // Default active tab based on role
  const [activeTab, setActiveTab] = useState<string>(
    isQaOfficer ? "qa" : "requests"
  );

  // Cross-tab state
  const [targetIssuanceId, setTargetIssuanceId] = useState<number | null>(null);
  const [trackingBatchId, setTrackingBatchId] = useState<number | null>(null);

  // Switch to QA Officer account handler
  const handleSwitchToQaOfficer = () => {
    switchAccount("qa_officer");
    setActiveTab("qa");
  };

  // Navigate from Production Requests -> Material Issuance
  const handleNavigateToIssuance = async (prodReqId?: number) => {
    if (prodReqId) {
      try {
        const res = await fetch("/api/material-issuances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prodReqId, issuedBy: user?.username || "Inventory Manager" }),
        });
        const data = await res.json();
        if (data?.success && data?.data) {
          setTargetIssuanceId(data.data.issuanceId);
        }
      } catch (err) {
        console.error("Failed to auto-open issuance session:", err);
      }
    }
    setActiveTab("issuance");
  };

  // Navigate from Production Requests (Start Batch) -> Production Tracking
  const handleStartBatchAndTrack = (batchId: number) => {
    setTrackingBatchId(batchId);
    setActiveTab("tracking");
  };

  // Define tabs based on role
  let tabs: Array<{ key: string; label: string }> = [];

  if (isQaOfficer && !isAdmin) {
    tabs = [{ key: "qa", label: "Quality Assurance" }];
  } else if (isInventoryManager && !isAdmin) {
    tabs = [
      { key: "requests", label: "Production Requests" },
      { key: "issuance", label: "Material Issuance" },
      { key: "stockin", label: "Stock-In" },
      { key: "configuration", label: "Configuration" },
    ];
  } else if (isHeadCook && !isAdmin) {
    tabs = [
      { key: "requests", label: "Production Requests" },
      { key: "tracking", label: "Production Tracking" },
    ];
  } else {
    // Admin sees all
    tabs = [
      { key: "requests", label: "Production Requests" },
      { key: "issuance", label: "Material Issuance" },
      { key: "tracking", label: "Production Tracking" },
      { key: "qa", label: "Quality Assurance" },
      { key: "stockin", label: "Stock-In" },
      { key: "configuration", label: "Configuration" },
      { key: "loss", label: "Loss" },
    ];
  }

  // Ensure active tab is valid for current role
  const isCurrentTabValid = tabs.some((t) => t.key === activeTab);
  const currentTab = isCurrentTabValid ? activeTab : tabs[0]?.key || (isQaOfficer ? "qa" : "requests");

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Production & Quality"
        description={
          isQaOfficer && !isAdmin
            ? "Inspect finished production batches, verify sensory attributes and packaging, and approve stock-in."
            : isInventoryManager && !isAdmin
            ? "Create production requests with automated FIFO/FEFO lot reservations, scan raw materials, and issue supplies."
            : isHeadCook && !isAdmin
            ? "View ready for production requests, start authorized kitchen batches, track stage progression, and record finished goods."
            : "End-to-end production management, material lot reservations, sequential stage tracking, and quality assurance."
        }
      />

      {/* Main Tab Bar matching Resources & Suppliers styling */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = currentTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{tab.label.toUpperCase()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Production Requests (Base for Inventory Manager, Head Cook, and Admin) */}
      {currentTab === "requests" && (
        <ProductionRequestsTab
          isAdmin={isAdmin}
          isInventoryManager={isInventoryManager || isAdmin}
          isHeadCook={isHeadCook}
          onNavigateToIssuance={handleNavigateToIssuance}
          onStartBatchAndTrack={handleStartBatchAndTrack}
          currentUser={user?.username || (isHeadCook ? "Head Cook" : isInventoryManager ? "Inventory Manager" : "Admin")}
        />
      )}

      {/* Tab 2: Material Issuance (Inventory Manager & Admin) */}
      {currentTab === "issuance" && (
        <MaterialIssuanceTab initialIssuanceId={targetIssuanceId} />
      )}

      {/* Tab 3: Production Tracking (Head Cook & Admin) */}
      {currentTab === "tracking" && (
        <ProductionTrackingTab
          initialBatchId={trackingBatchId}
          onNavigateToBatches={() => setActiveTab("requests")}
          currentUser={user?.username || "Head Cook"}
          onSwitchToQaOfficer={handleSwitchToQaOfficer}
        />
      )}

      {/* Tab 4: Quality Assurance (QA Officer & Admin view-only) */}
      {currentTab === "qa" && (
        <ProductionQaTab
          isQaOfficer={isQaOfficer}
          isAdmin={isAdmin}
          currentUser={user?.firstName ? `${user.firstName} ${user.lastName}` : "Ramon Dela Cruz"}
          onSwitchToQaOfficer={handleSwitchToQaOfficer}
        />
      )}

      {/* Tab 5: Stock-In (Inventory Manager & Admin) */}
      {currentTab === "stockin" && (
        <ProductionStockInTab
          currentUser={user?.username || "Inventory Manager"}
        />
      )}

      {/* Tab 6: Configuration (Admin) */}
      {currentTab === "configuration" && <ConfigurationTab />}

      {/* Tab 7: Loss (Admin) */}
      {currentTab === "loss" && <LossTab />}
    </div>
  );
}