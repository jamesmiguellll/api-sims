"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";
import { TransferItem, LocationItem, DistributionStats } from "@/components/distribution/types";
import DistributionSummaryCards from "@/components/distribution/DistributionSummaryCards";
import StockTransferTable from "@/components/distribution/StockTransferTable";
import LocationTable from "@/components/distribution/LocationTable";
import CreateTransferModal from "@/components/distribution/CreateTransferModal";
import LocationModal from "@/components/distribution/LocationModal";
import LocationDetailsModal from "@/components/distribution/LocationDetailsModal";
import { PageHeader } from "@/components/shared/PageHeader";

export default function DistributionPage() {
  const auth = useAuth();
  const user = auth?.user;
  const isAuth = user?.username === "scmsuser" || user?.username === "ERP-ADMIN" || user?.email === "scmsuser@r3b2p.com" || user?.email === "admin@r3b2p.com" || user?.roles?.includes("Admin");

  const [activeTab, setActiveTab] = useState<"Stock Transfer" | "Locations">("Stock Transfer");
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [stats, setStats] = useState<DistributionStats>({ total: 0, pending: 0, inTransit: 0, completed: 0 });

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showCreateTransfer, setShowCreateTransfer] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationItem | null>(null);
  const [viewLocation, setViewLocation] = useState<LocationItem | null>(null);

  const fetchData = async () => {
    try {
      const statusParam = statusFilter === "All" ? "" : statusFilter;
      const [trRes, locRes, stRes] = await Promise.allSettled([
        api.get(`/api/stock-transfers?page=${page}&pageSize=10&status=${statusParam}&search=${search}`),
        api.get("/api/locations?pageSize=100"),
        api.get("/api/stock-transfers/dashboard"),
      ]);

      if (trRes.status === "fulfilled" && trRes.value.data?.success) {
        const raw = trRes.value.data.data.items || trRes.value.data.data || [];
        setTransfers(raw.map((t: any) => ({
          id: `TR-${String(t.transferId || t.id).padStart(4, "0")}`,
          transferId: t.transferId || t.id,
          product: t.productName || t.product || "",
          from: t.sourceLocationName || t.from || "",
          to: t.destLocationName || t.to || "",
          quantity: t.quantity || 0,
          date: t.transferDate ? new Date(t.transferDate).toLocaleDateString() : "",
          status: t.status || "Pending",
        })));
        setTotalPages(trRes.value.data.data.totalPages || 1);
      }
      if (locRes.status === "fulfilled" && locRes.value.data?.success) {
        const raw = locRes.value.data.data.items || locRes.value.data.data || [];
        setLocations(raw.map((l: any) => ({
          id: String(l.locationId || l.id),
          locationId: l.locationId || l.id,
          name: l.locationName || l.name || "",
          type: l.locationType || l.type || "Warehouse",
          address: l.address || "",
          status: l.isActive !== false ? "Active" : "Inactive",
        })));
      }
      if (stRes.status === "fulfilled" && stRes.value.data?.success) {
        const d = stRes.value.data.data;
        setStats({ total: d.totalTransfers || 0, pending: d.pendingTransfers || 0, inTransit: d.inTransitTransfers || 0, completed: d.completedTransfers || 0 });
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, [page, search, statusFilter]);

  const updateStatus = async (t: TransferItem, status: string) => {
    try {
      await api.put(`/api/stock-transfers/${t.transferId}/status`, { status });
      fetchData();
    } catch { alert(`Failed to update transfer status.`); }
  };

  const handleSaveLocation = async (data: any) => {
    try {
      if (editingLocation) await api.put(`/api/locations/${editingLocation.locationId}`, data);
      else await api.post("/api/locations", data);
      setShowLocationModal(false); setEditingLocation(null); fetchData();
    } catch { alert("Failed to save location."); }
  };

  return (
    <div className="w-full min-h-full py-8 px-6 md:px-8 space-y-6 animate-page-in">
      <PageHeader
        title="Stock Transfer"
        description="Manage internal stock transfers, warehouse movements, and facility locations."
        actions={
          <>
            {isAuth && (
              <Button size="sm" variant="outline" asChild className="gap-1.5">
                <Link href="/reports?tab=distribution">
                  <FileText className="w-4 h-4" /> Reports
                </Link>
              </Button>
            )}
            {activeTab === "Stock Transfer" ? (
              <Button size="sm" onClick={() => setShowCreateTransfer(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> New Transfer
              </Button>
            ) : (
              <Button size="sm" onClick={() => { setEditingLocation(null); setShowLocationModal(true); }} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add Location
              </Button>
            )}
          </>
        }
      />

      <DistributionSummaryCards stats={stats} />

      {/* Process Tabs */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: "Stock Transfer", label: "STOCK TRANSFERS" },
            { id: "Locations", label: "LOCATIONS" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id as any); setPage(1); }}
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

      {activeTab === "Stock Transfer" && (
        <>
          <div className="mb-6 border border-border rounded-md overflow-hidden bg-card">
            <div className="flex items-center justify-between gap-sm px-md py-sm bg-muted/20">
              <div className="flex items-center gap-sm flex-1">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input
                  type="text"
                  placeholder="Search by Transfer ID (e.g. TR-...), Item, or Location..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-body-sm flex-1 text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <div className="flex items-center gap-sm shrink-0">
                <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                  <SelectTrigger className="h-10 w-[180px] rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground shadow-sm focus:ring-1 focus:ring-ring">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {["All", "Pending", "In Transit", "Completed"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <StockTransferTable transfers={transfers} onDispatch={(t) => updateStatus(t, "In Transit")} onReceive={(t) => updateStatus(t, "Completed")} onCancel={(t) => updateStatus(t, "Cancelled")} />
          <Pagination currentPage={page} totalPages={totalPages} totalCount={transfers.length} onPageChange={setPage} />
        </>
      )}

      {activeTab === "Locations" && (
        <LocationTable locations={locations} onEdit={(l) => { setEditingLocation(l); setShowLocationModal(true); }} onView={(l) => setViewLocation(l)} />
      )}

      <CreateTransferModal open={showCreateTransfer} locations={locations} onClose={() => setShowCreateTransfer(false)} onCreated={fetchData} />
      <LocationModal open={showLocationModal} editingLocation={editingLocation} onClose={() => { setShowLocationModal(false); setEditingLocation(null); }} onSave={handleSaveLocation} />
      <LocationDetailsModal location={viewLocation} onClose={() => setViewLocation(null)} />
    </div>
  );
}
