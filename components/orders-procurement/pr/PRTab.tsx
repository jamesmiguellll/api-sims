"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  RefreshCw,
  Inbox,
  FileText
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
import { PurchaseRequisition, PRStatus } from "../types";
import { PRTable } from "./PRTable";
import { PRDetailsModal } from "./PRDetailsModal";
import { PRActionModal, PRActionType } from "./PRActionModal";
import { CreatePRModal } from "./CreatePRForm";
import Pagination from "@/components/Pagination";
import { useAuth } from "@/context/AuthContext";

const STATUS_TABS: (PRStatus | "All")[] = [
  "All",
  "Draft",
  "Pending Approval",
  "Returned",
  "Approved",
  "Rejected",
  "Converted to PO",
  "Cancelled",
  "Closed",
];

export function PRTab({ onCreatePo }: { onCreatePo?: (prId: number) => void }) {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [requisitions, setRequisitions] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Selected PR for details view
  const [selectedPR, setSelectedPR] = useState<PurchaseRequisition | null>(null);

  // Active action modal
  const [actionModal, setActionModal] = useState<{
    pr: PurchaseRequisition;
    type: PRActionType;
  } | null>(null);

  // Create and Edit PR Modals
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [editingPR, setEditingPR] = useState<PurchaseRequisition | null>(null);
  const [prefillPR, setPrefillPR] = useState<any | null>(null);

  // Check for prefilled PR data from Production Request Shortfall
  useEffect(() => {
    const rawPrefill = sessionStorage.getItem("prefill_pr");
    if (rawPrefill) {
      try {
        const parsed = JSON.parse(rawPrefill);
        sessionStorage.removeItem("prefill_pr");
        setPrefillPR(parsed);
        setOpenCreateModal(true);
      } catch (e) {
        console.error("Failed to parse prefill_pr:", e);
      }
    }
  }, []);

  // Fetch Requisitions
  const fetchRequisitions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/purchase-requisitions");
      if (res.data?.success) {
        const raw = res.data.data || [];
        setRequisitions(raw);
      }
    } catch (e) {
      console.error("Failed to fetch purchase requisitions:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequisitions();
  }, [fetchRequisitions]);


  // Counts for each tab
  const counts = useMemo(() => {
    const map: Record<string, number> = { All: requisitions.length, Requests: 0 };
    STATUS_TABS.forEach((t) => { map[t] = 0; });
    requisitions.forEach((pr) => {
      const st = pr.status;
      if (map[st] !== undefined) map[st]++;
      if (st === "Pending Approval") map.Requests++;
    });
    map.All = requisitions.length;
    return map;
  }, [requisitions]);

  // Filtered List
  const filteredList = useMemo(() => {
    return requisitions.filter((pr) => {
      // Tab filter
      if (activeTab === "Requests") {
        if (pr.status !== "Pending Approval") return false;
      } else if (activeTab !== "All") {
        if (pr.status !== activeTab) return false;
      }

      // Department filter
      if (deptFilter && pr.department !== deptFilter) return false;

      // Search filter
      if (search.trim()) {
        const s = search.toLowerCase();
        const matchNumber = pr.prNumber?.toLowerCase().includes(s);
        const matchRequester = pr.requestedBy?.toLowerCase().includes(s);
        const matchDept = pr.department?.toLowerCase().includes(s);
        const matchPurpose = pr.purpose?.toLowerCase().includes(s);
        const matchItem = pr.items?.some((i) => i.itemName?.toLowerCase().includes(s) || i.itemCode?.toLowerCase().includes(s));
        return matchNumber || matchRequester || matchDept || matchPurpose || matchItem;
      }

      return true;
    });
  }, [requisitions, activeTab, search, deptFilter]);

  // Paginated List
  const totalCount = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, page, pageSize]);

  // Action handlers
  const handleStatusUpdate = async (prId: number, status: string, notes?: string) => {
    try {
      await api.put(`/api/purchase-requisitions/${prId}/status`, {
        status,
        adminNotes: notes || null,
      });
      await fetchRequisitions();
    } catch (e: any) {
      console.error("Status update failed:", e);
      alert(e?.response?.data?.message || "Failed to update requisition status.");
    }
  };


  return (
    <div className="space-y-6 animate-page-in">
      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Purchase Requisitions</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage raw material and ingredient purchase requisitions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRequisitions}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors h-10"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            asChild
            className="flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted transition-colors h-10"
          >
            <Link href="/reports?tab=procurement">
              <FileText className="w-4 h-4" /> Reports
            </Link>
          </Button>

          {!isAdmin && (
            <Button
              type="button"
              onClick={() => setOpenCreateModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:bg-foreground/85 transition-colors shadow-sm h-10"
            >
              <Plus className="w-4 h-4" /> Create Purchase Requisition
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
              placeholder="Search by Purchase Requisition No., Requester, or Department..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-sm flex-1 text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex items-center gap-3 pl-4 border-l border-border/50">
            <div className="flex items-center">
              <Select
                value={deptFilter === "" ? "all" : deptFilter}
                onValueChange={(val) => {
                  setDeptFilter(val === "all" ? "" : val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 min-w-[210px] w-auto rounded-xl border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm focus:ring-1 focus:ring-ring">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent className="min-w-[210px]">
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="Inventory">Inventory</SelectItem>
                  <SelectItem value="Production">Production</SelectItem>
                  <SelectItem value="Warehouse">Warehouse</SelectItem>
                  <SelectItem value="Quality Assurance">Quality Assurance</SelectItem>
                  <SelectItem value="Administration">Administration</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-max pb-2">
          {/* Requests Tab (Visible to Admin or with pending requests) */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setActiveTab("Requests");
                setPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "Requests"
                  ? "bg-foreground text-background shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <span>Requests</span>
              {counts.Requests > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
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
                onClick={() => {
                  setActiveTab(tab);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  isSelected
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <span>{tab}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium ${
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

      {/* Active Tab Subtitle for Requests tab */}
      {activeTab === "Requests" && (
        <div className="p-3 rounded-xl border border-border bg-muted/20 text-xs text-foreground flex items-center gap-2">
          <Inbox className="w-4 h-4 text-foreground shrink-0" />
          <span>Showing all product requisitions pending your review. Approve, Reject, or Return for Revision with mandatory notes.</span>
        </div>
      )}

      {/* PR Table */}
      <PRTable
        requisitions={paginatedList}
        isAdmin={isAdmin}
        isRequestsTab={activeTab === "Requests"}
        onView={(pr) => setSelectedPR(pr)}
        onEdit={(pr) => setEditingPR(pr)}
        onCancel={(pr) => setActionModal({ pr, type: "cancel" })}
        onCreatePo={(pr) => onCreatePo?.(pr.prId)}
      />

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={setPage}
      />

      {/* PR Details / Review Modal */}
      <PRDetailsModal
        pr={selectedPR}
        isAdmin={isAdmin}
        onClose={() => setSelectedPR(null)}
        onApprove={(pr) => setActionModal({ pr, type: "approve" })}
        onReject={(pr) => setActionModal({ pr, type: "reject" })}
        onReturn={(pr) => setActionModal({ pr, type: "return" })}
        onCreatePo={onCreatePo ? (pr) => { setSelectedPR(null); onCreatePo(pr.prId); } : undefined}
      />

      {/* Action Confirmation Modal */}
      {actionModal && (
        <PRActionModal
          actionType={actionModal.type}
          prNumber={actionModal.pr.prNumber}
          onClose={() => setActionModal(null)}
          onConfirm={async (notes) => {
            const { pr, type } = actionModal;
            if (type === "approve") {
              await handleStatusUpdate(pr.prId, "Approved", notes);
            } else if (type === "reject") {
              await handleStatusUpdate(pr.prId, "Rejected", notes);
            } else if (type === "return") {
              await handleStatusUpdate(pr.prId, "Returned", notes);
            } else if (type === "cancel") {
              await handleStatusUpdate(pr.prId, "Cancelled", notes);
            }
            setSelectedPR(null);
          }}
        />
      )}

      {/* Create PR Modal */}
      {openCreateModal && (
        <CreatePRModal
          open={openCreateModal}
          initialData={prefillPR || undefined}
          isEdit={false}
          onClose={() => {
            setOpenCreateModal(false);
            setPrefillPR(null);
          }}
          onSuccess={() => {
            setOpenCreateModal(false);
            setPrefillPR(null);
            fetchRequisitions();
          }}
        />
      )}

      {/* Edit PR Modal */}
      {editingPR && (
        <CreatePRModal
          open={!!editingPR}
          initialData={editingPR}
          isEdit={true}
          onClose={() => setEditingPR(null)}
          onSuccess={() => {
            setEditingPR(null);
            fetchRequisitions();
          }}
        />
      )}
    </div>
  );
}
