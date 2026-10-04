"use client";

import React, { useEffect, useState } from "react";
import { Package, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";
import { LotItem } from "@/components/lots/types";
import LotsTable from "@/components/lots/LotsTable";

export default function ViewLots() {
  const auth = useAuth();
  const user = auth?.user;
  const isAuth =
    user?.username === "scmsuser" || user?.username === "ERP-ADMIN" ||
    user?.email === "scmsuser@r3b2p.com" || user?.email === "admin@r3b2p.com" || user?.roles?.includes("Admin");

  const [lots, setLots] = useState<LotItem[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchLots = async () => {
    try {
      const statusFilter = activeTab === "all" ? "" : activeTab;
      const url = statusFilter
        ? `/api/inventory/lots?status=${statusFilter}&page=${page}&pageSize=10`
        : `/api/inventory/lots?page=${page}&pageSize=10`;
      const res = await api.get(url);
      if (res.data.success) {
        setLots(res.data.data.items || res.data.data || []);
        setTotalPages(res.data.data.totalPages || 1);
        const count = res.data.data.totalCount || res.data.data.length || 0;
        setTotalCount(count);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { fetchLots(); }, [activeTab, page]);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const statuses = ["Available", "Quarantine", "OnHold"];
        const counts: Record<string, number> = { all: 0 };
        await Promise.all(
          statuses.map(async (status) => {
            const res = await api.get(`/api/inventory/lots?status=${status}&page=1&pageSize=1`);
            if (res.data?.success) {
              counts[status] = res.data.data.totalCount || res.data.data.items?.length || 0;
            }
          })
        );
        counts.all = (counts.Available || 0) + (counts.Quarantine || 0) + (counts.OnHold || 0);
      } catch (e) { console.error(e); }
    };
    fetchCounts();
  }, []);

  return (
    <div className="w-full min-h-full py-xl px-lg md:px-xl space-y-2xl animate-page-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Lot Tracking</h1>
          <p className="mt-1 text-sm text-muted-foreground">Traceable batches, expiry monitoring, and lot-level inventory</p>
        </div>
        <div className="flex items-center gap-3">
          {isAuth && (
            <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-5 py-2.5 text-sm font-semibold text-foreground">
              <Package size={16} /> Batch Traceability
            </div>
          )}
        </div>
      </div>

      {/* Summary cards would go here - simplified for now */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">Total Lots</div>
          <div className="text-2xl font-bold text-foreground mt-1">{totalCount}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">Available</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {lots.filter(l => l.status === "Available").length}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground">In Quarantine</div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {lots.filter(l => l.status === "Quarantine").length}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <AlertTriangle size={14} /> Expired
          </div>
          <div className="text-2xl font-bold text-foreground mt-1">
            {lots.filter(l => l.isExpired).length}
          </div>
        </div>
      </div>

      {/* Lot Status Tabs */}
      <div className="border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: "all", label: "ALL LOTS" },
            { id: "Available", label: "AVAILABLE" },
            { id: "Quarantine", label: "QUARANTINE" },
            { id: "OnHold", label: "ON HOLD" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id); setPage(1); }}
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

      <LotsTable items={lots} currentPage={page} pageSize={10} />
      <Pagination currentPage={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}