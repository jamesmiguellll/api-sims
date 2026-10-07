"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Search, Plus, MoreHorizontal, FileText, Play } from "lucide-react";
import Pagination from "@/components/Pagination";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ProductionRequestEntity } from "./types";
import ProductionRequestModal, { formatTimeTo12Hour } from "./ProductionRequestModal";
import PrSummaryModal from "./PrSummaryModal";

interface ProductionRequestsTabProps {
  isAdmin: boolean;
  isInventoryManager: boolean;
  isHeadCook: boolean;
  onNavigateToIssuance?: (prodReqId?: number) => void;
  onStartBatchAndTrack?: (batchId: number) => void;
  currentUser?: string;
}

export default function ProductionRequestsTab({
  isAdmin,
  isInventoryManager,
  isHeadCook,
  onNavigateToIssuance,
  onStartBatchAndTrack,
  currentUser,
}: ProductionRequestsTabProps) {
  const [requests, setRequests] = useState<ProductionRequestEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [startingId, setStartingId] = useState<number | null>(null);

  // Status Tabs: Head Cook sees only Ready for Production, In Progress, Completed
  // Inventory Manager & Admin see: All, Pending Approval, Approved, Ready for Production, In Progress, Completed, Rejected
  // NO DRAFT, NO CANCELLED!
  const statusTabs = useMemo(() => {
    if (isHeadCook && !isAdmin) {
      return ["Ready for Production", "In Progress", "Completed"];
    }
    return [
      "All",
      "Pending Approval",
      "Approved",
      "Ready for Production",
      "In Progress",
      "Completed",
      "Rejected",
    ];
  }, [isHeadCook, isAdmin]);

  const defaultStatusTab = isHeadCook && !isAdmin ? "Ready for Production" : "All";
  const [activeTab, setActiveTab] = useState<string>(defaultStatusTab);

  // Keep active tab in sync if user changes account or role
  useEffect(() => {
    if (!statusTabs.includes(activeTab)) {
      setActiveTab(isHeadCook && !isAdmin ? "Ready for Production" : "All");
      setCurrentPage(1);
    }
  }, [statusTabs, activeTab, isHeadCook, isAdmin]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<ProductionRequestEntity | null>(null);
  const [prSummaryData, setPrSummaryData] = useState<any | null>(null);

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

  // Fetch Requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (priorityFilter !== "All") params.priority = priorityFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (isHeadCook && !isAdmin) params.role = "head_cook";

      const res = await api.get("/api/production-requests", { params });
      if (res.data?.success && Array.isArray(res.data.data)) {
        setRequests(res.data.data);
      }
    } catch (err: any) {
      console.error("Error fetching production requests:", err);
      toast.error("Failed to load production requests.");
    } finally {
      setLoading(false);
    }
  }, [priorityFilter, searchQuery, isHeadCook, isAdmin]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Status helper mapping
  const matchesTab = (reqStatus: string, tabName: string) => {
    if (tabName === "All") return true;
    if (tabName === "Ready for Production") {
      return reqStatus === "Materials Issued" || reqStatus === "Ready for Production";
    }
    if (tabName === "In Progress") {
      return reqStatus === "In Production" || reqStatus === "In Progress";
    }
    return reqStatus === tabName;
  };

  // Status counts for status tabs
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    statusTabs.forEach((st) => {
      counts[st] = requests.filter((r) => matchesTab(r.status, st)).length;
    });
    return counts;
  }, [requests, statusTabs]);

  // Filter by active status tab
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => matchesTab(r.status, activeTab));
  }, [requests, activeTab]);

  const handleOpenNewModal = () => {
    setSelectedRequest(null);
    setIsModalOpen(true);
  };

  const handleViewRequest = (req: ProductionRequestEntity) => {
    setSelectedRequest(req);
    setIsModalOpen(true);
  };

  // Head Cook or Admin Start Production
  const handleStartProduction = async (req: ProductionRequestEntity, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isHeadCook && !isAdmin) {
      toast.error("Only the Head Cook can start production.");
      return;
    }

    setStartingId(req.prodReqId);
    try {
      const res = await api.post("/api/ProductionBatches", {
        prodReqId: req.prodReqId,
        assignedCook: currentUser || "Head Cook",
        notes: `Started from Request ${req.reqNumber}`,
      });

      if (res.data?.success && res.data.data) {
        toast.success(`Production batch ${res.data.data.batchNumber} started!`);
        fetchRequests();
        if (onStartBatchAndTrack) {
          onStartBatchAndTrack(res.data.data.batchId);
        }
      } else {
        toast.error(res.data?.message || "Failed to start production batch.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred starting the batch.");
    } finally {
      setStartingId(null);
    }
  };

  // Pagination
  const pageSize = 10;
  const totalCount = filteredRequests.length;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginatedRequests = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header & New Request Button */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Production Requests</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isHeadCook && !isAdmin
              ? "View ready for production requests, start kitchen batches, and track progress."
              : isInventoryManager
              ? "Plan production volumes, verify automated BOM lot reservations, and request supplies."
              : "Review, approve, and track production requests."}
          </p>
        </div>
        {/* Only Inventory Manager or Admin can create production requests */}
        {(isInventoryManager || isAdmin) && !isHeadCook && (
          <Button
            onClick={handleOpenNewModal}
            className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Production Request</span>
          </Button>
        )}
      </div>

      {/* Filters Bar (Search & Priority Filter - Top orientation matching PR) */}
      <div className="mb-6 border border-border rounded-xl overflow-hidden bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-muted/20">
          <div className="flex items-center gap-3 flex-1">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              type="text"
              placeholder="Search by Request No., Product, Variant, or Recipe..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-sm flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-border/50">
            <div className="flex items-center">
              <Select
                value={priorityFilter}
                onValueChange={(val) => {
                  setPriorityFilter(val);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10 min-w-[180px] w-auto rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm focus:ring-1 focus:ring-ring">
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent className="min-w-[180px] bg-popover border-border">
                  <SelectItem value="All">All Priorities</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Top Status Tabs (Strictly no Draft, no Cancelled) */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max pb-2">
          {statusTabs.map((tab) => {
            const isSelected = activeTab === tab;
            const count = statusCounts[tab] || 0;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => {
                  setActiveTab(tab);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span>{tab}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isSelected ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Requests Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card shadow-sm">
        <div className="overflow-x-auto min-h-[280px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap">Request Number</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Product</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Variant</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground">Recipe</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-right whitespace-nowrap">Target Output</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-center">Priority</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground whitespace-nowrap">Required Date</th>
                <th className="py-3 px-4 font-semibold text-muted-foreground text-right w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                    Loading production requests...
                  </td>
                </tr>
              ) : paginatedRequests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-xs text-muted-foreground">
                    No production requests found in this view.
                  </td>
                </tr>
              ) : (
                paginatedRequests.map((req) => {
                  const isHigh = req.priority === "High" || req.priority === "Priority";
                  const isLow = req.priority === "Low";
                  const displayPriority = isHigh ? "High" : isLow ? "Low" : "Medium";
                  const hasPr = Boolean(req.linkedPrId);
                  const isMenuOpen = openDropdownId === req.prodReqId;

                  const isReadyForProd = req.status === "Materials Issued" || req.status === "Ready for Production";
                  const isInProd = req.status === "In Production" || req.status === "In Progress";
                  const displayStatus = isReadyForProd
                    ? "Ready for Production"
                    : isInProd
                    ? "In Progress"
                    : req.status;

                  return (
                    <tr
                      key={req.prodReqId}
                      onClick={() => handleViewRequest(req)}
                      className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                        isHigh ? "bg-muted/15 border-l-2 border-l-foreground" : ""
                      }`}
                    >
                      {/* Request Number (No #, No red dot) */}
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground whitespace-nowrap">
                        {req.reqNumber}
                      </td>

                      {/* Product (Product name only) */}
                      <td className="py-3.5 px-4 font-semibold text-foreground">
                        {req.productName}
                      </td>

                      {/* Variant (Dedicated column) */}
                      <td className="py-3.5 px-4 text-muted-foreground whitespace-nowrap">
                        {req.variant || "Standard"}
                      </td>

                      {/* Recipe */}
                      <td className="py-3.5 px-4 text-muted-foreground">
                        {req.recipeName}
                      </td>

                      {/* Target Output */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                        {req.quantity} {req.yieldUom}
                      </td>

                      {/* Priority (Monochromatic badge - No red) */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                            isHigh
                              ? "bg-foreground text-background border-foreground"
                              : isLow
                              ? "bg-muted/40 text-muted-foreground border-border/60"
                              : "bg-muted text-foreground border-border"
                          }`}
                        >
                          {displayPriority}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <StatusBadge status={displayStatus} />
                      </td>

                      {/* Required Schedule (Date & 12H Time) */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-medium text-foreground">
                        <div>{req.requiredDate ? new Date(req.requiredDate).toLocaleDateString() : "—"}</div>
                        {req.requiredTime && (
                          <div className="text-[11px] text-muted-foreground font-normal">
                            {formatTimeTo12Hour(req.requiredTime)}
                          </div>
                        )}
                      </td>

                      {/* Actions (Three Dots Menu + Quick Start for Head Cook) */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Head Cook / Admin Quick Start Production on Ready for Production items */}
                          {isReadyForProd && (isHeadCook || isAdmin) && (
                            <Button
                              size="sm"
                              onClick={(e) => handleStartProduction(req, e)}
                              disabled={startingId === req.prodReqId}
                              className="h-7 text-xs font-semibold px-2.5 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-sm"
                            >
                              <Play className="w-3 h-3 mr-1 fill-current" />
                              <span>{startingId === req.prodReqId ? "Starting..." : "Start"}</span>
                            </Button>
                          )}

                          {/* Three Dots Menu Container */}
                          <div className="relative inline-block text-left action-menu-container">
                            <button
                              type="button"
                              onClick={() => setOpenDropdownId(isMenuOpen ? null : req.prodReqId)}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer"
                              title="Actions"
                            >
                              <MoreHorizontal className="w-4 h-4 text-foreground" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 mt-1 w-40 rounded-xl border border-border bg-card shadow-lg py-1 z-30 animate-in fade-in zoom-in-95">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDropdownId(null);
                                    handleViewRequest(req);
                                  }}
                                  className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                  View Details
                                </button>

                                {/* Issue Materials shortcut for Inventory Manager & Admin on Approved */}
                                {req.status === "Approved" && (isInventoryManager || isAdmin) && onNavigateToIssuance && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      onNavigateToIssuance(req.prodReqId);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer border-t border-border"
                                  >
                                    Issue Materials
                                  </button>
                                )}

                                {/* Start Production for Head Cook / Admin on Ready for Production */}
                                {isReadyForProd && (isHeadCook || isAdmin) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleStartProduction(req);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer border-t border-border font-semibold"
                                  >
                                    Start Production
                                  </button>
                                )}

                                {/* Admin Approval Action on Pending Approval */}
                                {isAdmin && req.status === "Pending Approval" && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleViewRequest(req);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer border-t border-border"
                                  >
                                    Approve / Reject
                                  </button>
                                )}

                                {/* In Progress items shortcut to track (Head Cook & Admin only) */}
                                {isInProd && (isHeadCook || isAdmin) && onStartBatchAndTrack && req.batches?.[0]?.batchId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      onStartBatchAndTrack(req.batches[0].batchId);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer border-t border-border"
                                  >
                                    Track Batch
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
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
        {totalPages > 1 && (
          <div className="p-3 border-t border-border bg-card flex justify-end">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalCount={totalCount}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Production Request Modal (Create / View) */}
      <ProductionRequestModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(created) => {
          fetchRequests();
          if (created && onNavigateToIssuance && created.status === "Approved") {
            onNavigateToIssuance(created.prodReqId);
          }
        }}
        initialRequest={selectedRequest}
        isAdmin={isAdmin}
        isInventoryManager={isInventoryManager}
        onProceedToIssuance={(id) => onNavigateToIssuance && onNavigateToIssuance(id)}
        onViewPrSummary={(data) => setPrSummaryData(data)}
      />

      {/* PR Summary Modal */}
      <PrSummaryModal
        open={Boolean(prSummaryData)}
        onClose={() => setPrSummaryData(null)}
        prData={prSummaryData}
      />
    </div>
  );
}
