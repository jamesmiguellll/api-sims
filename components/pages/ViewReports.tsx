"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import ReportFilterBar from "@/components/pages/ReportFilterBar";
import InventoryReportView from "@/components/pages/InventoryReportView";
import ProcurementReportView from "@/components/pages/ProcurementReportView";
import ProductionReportView from "@/components/pages/ProductionReportView";
import SupplierReportView from "@/components/pages/SupplierReportView";
import SupplierOrdersModal from "@/components/pages/SupplierOrdersModal";
import DistributionReportView from "@/components/pages/DistributionReportView";
import { exportReportCSV } from "@/components/reports/exportReportCSV";
import api from "@/lib/api";

export default function ViewReports({ initialTab }: { initialTab: string }) {
  const router = useRouter();
  const { user, isLoading } = useAuth() || {};

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const [filterMode, setFilterMode] = useState<"all" | "specific" | "range">("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [specificDate, setSpecificDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedSupplierModal, setSelectedSupplierModal] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterMode === "specific" && specificDate) {
        params.append("startDate", specificDate);
        params.append("endDate", specificDate);
      } else if (filterMode === "range") {
        if (startDate) params.append("startDate", startDate);
        if (endDate) params.append("endDate", endDate);
      }
      const qs = params.toString();
      const endpoint = `/api/reports/${initialTab}${qs ? `?${qs}` : ""}`;
      const response = await api.get(endpoint);
      const json = response.data;
      if (json.success) setData(json.data);
      else setError(json.message || "Failed to fetch data from server");
    } catch {
      setError("Network error occurred while fetching reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [initialTab, filterMode]);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterMode, specificDate, startDate, endDate, selectedSupplierFilter, initialTab]);

  const handleResetFilters = () => {
    setFilterMode("all"); setStartDate(""); setEndDate(""); setSpecificDate("");
    setSearchQuery(""); setSelectedSupplierFilter("all"); setCurrentPage(1); fetchData();
  };

  const getBackPath = () => {
    switch (initialTab) {
      case "inventory": return "/inventory";
      case "procurement": return "/orders-procurement";
      case "production": return "/production-quality";
      case "supplier": return "/resources-suppliers";
      case "distribution": return "/distribution";
      default: return "/";
    }
  };

  return (
    <div className="w-full max-w-full overflow-x-hidden min-h-screen bg-background p-2 sm:p-4 transition-colors font-sans text-foreground">
      <div className="w-full max-w-full space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="outline" onClick={() => router.push(getBackPath())} className="mb-2 h-9 px-3 text-xs font-semibold rounded-lg border-border bg-card hover:bg-muted text-foreground transition-colors shadow-sm">
              Back to System
            </Button>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground capitalize">
              {initialTab} Performance Report
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Comprehensive analytics, fulfillment rates, and historical logs
            </p>
          </div>
        </div>

        <ReportFilterBar
          initialTab={initialTab} filterMode={filterMode} setFilterMode={setFilterMode}
          startDate={startDate} setStartDate={setStartDate} endDate={endDate} setEndDate={setEndDate}
          specificDate={specificDate} setSpecificDate={setSpecificDate} searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          selectedSupplierFilter={selectedSupplierFilter} setSelectedSupplierFilter={setSelectedSupplierFilter}
          allSuppliers={data?.vendorScorecard || []} onApplyFilters={fetchData} onResetFilters={handleResetFilters}
          onExportCSV={() => exportReportCSV(initialTab, data)}
        />

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 bg-card rounded-2xl border border-border">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Loading report metrics...</p>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-500/10 border !border-destructive/20 rounded-xl text-center">
            <p className="text-sm font-semibold text-red-600">{error}</p>
            <Button onClick={fetchData} className="mt-3 text-xs bg-foreground text-background">Retry</Button>
          </div>
        ) : (
          <div className="space-y-6">
            {initialTab === "inventory" && <InventoryReportView data={data} searchQuery={searchQuery} currentPage={currentPage} setCurrentPage={setCurrentPage} />}
            {initialTab === "procurement" && <ProcurementReportView data={data} searchQuery={searchQuery} currentPage={currentPage} setCurrentPage={setCurrentPage} />}
            {initialTab === "production" && <ProductionReportView data={data} searchQuery={searchQuery} currentPage={currentPage} setCurrentPage={setCurrentPage} />}
            {initialTab === "supplier" && <SupplierReportView data={data} searchQuery={searchQuery} selectedSupplierFilter={selectedSupplierFilter} currentPage={currentPage} setCurrentPage={setCurrentPage} onOpenOrdersModal={(s: any) => setSelectedSupplierModal(s)} />}
            {initialTab === "distribution" && <DistributionReportView data={data} searchQuery={searchQuery} currentPage={currentPage} setCurrentPage={setCurrentPage} />}
          </div>
        )}

        {selectedSupplierModal && (
          <SupplierOrdersModal selectedSupplierModal={selectedSupplierModal} onClose={() => setSelectedSupplierModal(null)} />
        )}
      </div>
    </div>
  );
}
