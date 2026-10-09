"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Search, Eye, QrCode, CheckCircle2, ArrowRight, MoreHorizontal } from "lucide-react";
import Pagination from "@/components/Pagination";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { MaterialIssuanceDTO } from "./types";
import MaterialIssuanceModal from "./MaterialIssuanceModal";

interface MaterialIssuanceTabProps {
  initialIssuanceId?: number | null;
}

export default function MaterialIssuanceTab({ initialIssuanceId }: MaterialIssuanceTabProps) {
  const [issuances, setIssuances] = useState<MaterialIssuanceDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".action-menu-container")) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Modal state
  const [selectedIssuanceId, setSelectedIssuanceId] = useState<number | null>(initialIssuanceId ?? null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(Boolean(initialIssuanceId));

  const fetchIssuances = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== "All") params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api.get("/api/material-issuances", { params });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setIssuances(res.data.data);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load material issuances.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchIssuances();
  }, [fetchIssuances]);

  useEffect(() => {
    if (initialIssuanceId) {
      setSelectedIssuanceId(initialIssuanceId);
      setIsModalOpen(true);
    }
  }, [initialIssuanceId]);

  const handleOpenScanner = (issuanceId: number) => {
    setSelectedIssuanceId(issuanceId);
    setIsModalOpen(true);
  };

  // Pagination
  const pageSize = 10;
  const totalCount = issuances.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginatedIssuances = issuances.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">Material Issuances</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify allocated lot codes via physical barcode/QR code scan and release raw materials to the production floor.
        </p>
      </div>

      {/* Search and Status Filter Bar */}
      <div className="border border-border rounded-md overflow-hidden bg-card">
        <div className="flex items-center justify-between gap-sm px-md py-sm bg-muted/20">
          <div className="flex items-center gap-sm flex-1">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search by issuance #, request #, or product..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-body-sm flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-sm shrink-0">
            <Select
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val);
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-10 min-w-[210px] w-auto rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm focus:ring-1 focus:ring-ring">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="min-w-[210px]">
                <SelectItem value="All">All Statuses</SelectItem>
                <SelectItem value="Pending">Pending Scan</SelectItem>
                <SelectItem value="Scanning">Scanning</SelectItem>
                <SelectItem value="Issued">Issued</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap">Issuance Number</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap">Request Number</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Product</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Recipe</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-right whitespace-nowrap">Target Output</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap">Issued Date</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                    Loading material issuances...
                  </td>
                </tr>
              ) : paginatedIssuances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-muted-foreground">
                    No material issuances found. Once a production request is approved, initialize issuance to scan supplies.
                  </td>
                </tr>
              ) : (
                paginatedIssuances.map((iss) => {
                  const isDone = iss.status === "Issued";
                  const isMenuOpen = openDropdownId === iss.issuanceId;

                  return (
                    <tr
                      key={iss.issuanceId}
                      onClick={() => handleOpenScanner(iss.issuanceId)}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground whitespace-nowrap">
                        {iss.issuanceNumber}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-muted-foreground font-semibold whitespace-nowrap">
                        {iss.reqNumber}
                      </td>

                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {iss.productName}
                      </td>

                      <td className="py-3.5 px-4 text-muted-foreground">
                        {iss.recipeName}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                        {iss.requestQuantity}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <StatusBadge status={iss.status} />
                      </td>

                      <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        {iss.issuedAt ? new Date(iss.issuedAt).toLocaleDateString() : "—"}
                      </td>

                      {/* Actions (Three Dots Menu) */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left action-menu-container">
                          <button
                            type="button"
                            onClick={() => setOpenDropdownId(isMenuOpen ? null : iss.issuanceId)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer"
                            title="Actions"
                          >
                            <MoreHorizontal className="w-4 h-4 text-foreground" />
                          </button>

                          {isMenuOpen && (
                            <div className="absolute right-0 mt-1 w-36 rounded-xl border border-border bg-card shadow-lg py-1 z-30 animate-in fade-in zoom-in-95">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  handleOpenScanner(iss.issuanceId);
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                              >
                                {!isDone ? "Scan" : "Open"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  handleOpenScanner(iss.issuanceId);
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer border-t border-border"
                              >
                                View Details
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
        />

      {/* Material Issuance Modal */}
      <MaterialIssuanceModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedIssuanceId(null);
        }}
        issuanceId={selectedIssuanceId}
        onSuccess={fetchIssuances}
      />
    </div>
  );
}
