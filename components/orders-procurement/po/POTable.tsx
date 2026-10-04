"use client";

import React, { useState, useEffect, useRef } from "react";
import { Eye, Pencil, MoreHorizontal, Ban } from "lucide-react";
import { PurchaseOrderPO } from "../types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

interface POTableProps {
  orders: PurchaseOrderPO[];
  isAdmin: boolean;
  onView: (po: PurchaseOrderPO) => void;
  onEdit?: (po: PurchaseOrderPO) => void;
  onCancel?: (po: PurchaseOrderPO) => void;
}

export function POTable({ orders, isAdmin, onView, onEdit, onCancel }: POTableProps) {
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    }
    if (openDropdownId !== null) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdownId]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">PURCHASE ORDER NUMBER</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">SUPPLIER</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">ORDER DATE</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">REQUESTED BY</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">TOTAL AMOUNT</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">STATUS</th>
            <th className="px-4 py-3 text-center font-bold text-muted-foreground tracking-wider whitespace-nowrap w-24">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-5 py-8 text-center text-xs font-medium text-muted-foreground">
                No purchase orders found.
              </td>
            </tr>
          ) : (
            orders.map((po) => {
              const isDraft = po.status === "Draft";
              const isReturned = po.status === "Returned";
              const isCancellable = po.status === "Draft" || po.status === "Pending Approval" || po.status === "Approved" || po.status === "Returned";

              const actions: ActionItem[] = [
                {
                  label: "View Details",
                  icon: <Eye className="w-4 h-4 text-foreground" />,
                  onClick: () => { setOpenDropdownId(null); onView(po); },
                },
              ];

              // Inventory Manager actions only
              if (!isAdmin) {
                if ((isDraft || isReturned) && onEdit) {
                  actions.push({
                    label: isReturned ? "Edit & Re-Submit" : "Edit Draft",
                    icon: <Pencil className="w-4 h-4 text-foreground" />,
                    onClick: () => { setOpenDropdownId(null); onEdit(po); },
                  });
                }
                if (isCancellable && onCancel) {
                  actions.push({
                    label: "Cancel Purchase Order",
                    icon: <Ban className="w-4 h-4 text-foreground" />,
                    onClick: () => { setOpenDropdownId(null); onCancel(po); },
                  });
                }
              }

              const isOpen = openDropdownId === po.poId;

              const fmtDate = (d: string) =>
                d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

              const fmtCurrency = (n: number) =>
                new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(n);

              return (
                <tr key={po.poId} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onView(po)}>
                  <td className="px-4 py-3.5 font-mono text-foreground whitespace-nowrap font-medium">
                    {po.poNumber}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-foreground whitespace-nowrap">
                    {po.supplierName || "—"}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                    {fmtDate(po.orderDate)}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                    {po.requestedBy || "—"}
                  </td>
                  <td className="px-4 py-3.5 font-mono font-semibold text-foreground whitespace-nowrap">
                    {fmtCurrency(po.totalAmount || 0)}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <StatusBadge status={po.status} />
                  </td>
                  <td className="px-4 py-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg border border-transparent text-foreground hover:bg-muted/80 transition-all data-[state=open]:bg-muted data-[state=open]:border-border data-[state=open]:shadow-sm"
                          aria-label="Actions menu"
                        >
                          <MoreHorizontal className="w-4 h-4 text-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 z-[200]">
                        {actions.map((action, idx) => (
                          <DropdownMenuItem
                            key={action.label + idx}
                            onClick={action.onClick}
                            className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                          >
                            <span className="shrink-0 text-foreground">{action.icon}</span>
                            <span className="truncate text-foreground">{action.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
