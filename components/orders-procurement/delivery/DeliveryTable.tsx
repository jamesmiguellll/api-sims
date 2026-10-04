"use client";

import React, { useState, useEffect, useRef } from "react";
import { Eye, Truck, CheckCircle, Receipt, Ban, MoreHorizontal } from "lucide-react";
import { Delivery } from "../types";
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

interface DeliveryTableProps {
  deliveries: Delivery[];
  isAdmin: boolean;
  onView: (delivery: Delivery) => void;
  onDispatch?: (delivery: Delivery) => void;
  onArrive?: (delivery: Delivery) => void;
  onCancel?: (delivery: Delivery) => void;
  onCreateGrn?: (delivery: Delivery) => void;
}

export function DeliveryTable({
  deliveries,
  isAdmin,
  onView,
  onDispatch,
  onArrive,
  onCancel,
  onCreateGrn,
}: DeliveryTableProps) {
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

  const fmtDate = (d?: string) =>
    d
      ? new Date(d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      : "—";

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">DELIVERY NO.</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">PURCHASE ORDER REF.</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">SUPPLIER</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">CARRIER</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">EXPECTED DATE</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">ITEMS</th>
            <th className="px-4 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">STATUS</th>
            <th className="px-4 py-3 text-center font-bold text-muted-foreground tracking-wider whitespace-nowrap w-24">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {deliveries.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-5 py-8 text-center text-xs font-medium text-muted-foreground">
                No delivery shipments found.
              </td>
            </tr>
          ) : (
            deliveries.map((delivery) => {
              const isScheduled = delivery.status === "Scheduled";
              const isInTransit = delivery.status === "In Transit";
              const isArrived = delivery.status === "Arrived";
              const isCancellable = isScheduled || isInTransit;

              const itemCount = delivery.items?.length || 0;

              const actions: ActionItem[] = [
                {
                  label: "View Details",
                  icon: <Eye className="w-4 h-4 text-foreground" />,
                  onClick: () => {
                    setOpenDropdownId(null);
                    onView(delivery);
                  },
                },
              ];

              // Only inventory manager has actions; admin side just checks/views
              if (!isAdmin) {
                if ((isScheduled || isInTransit) && onArrive) {
                  actions.push({
                    label: "Mark Arrived",
                    icon: <CheckCircle className="w-4 h-4 text-foreground" />,
                    onClick: () => {
                      setOpenDropdownId(null);
                      onArrive(delivery);
                    },
                  });
                }
                if (isArrived && !delivery.grnNumber && onCreateGrn) {
                  actions.push({
                    label: "Create Goods Receipt Note",
                    icon: <Receipt className="w-4 h-4 text-foreground" />,
                    onClick: () => {
                      setOpenDropdownId(null);
                      onCreateGrn(delivery);
                    },
                  });
                }
                if (isCancellable && onCancel) {
                  actions.push({
                    label: "Cancel Delivery",
                    icon: <Ban className="w-4 h-4 text-foreground" />,
                    onClick: () => {
                      setOpenDropdownId(null);
                      onCancel(delivery);
                    },
                  });
                }
              }

              const isOpen = openDropdownId === delivery.deliveryId;

              return (
                <tr
                  key={delivery.deliveryId}
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onView(delivery)}
                >
                  <td className="px-4 py-3.5 font-mono text-foreground whitespace-nowrap font-medium">
                    {delivery.deliveryNumber}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-muted-foreground whitespace-nowrap text-xs">
                    {delivery.poNumber || "—"}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-foreground whitespace-nowrap max-w-[200px] truncate" title={delivery.supplierName}>
                    {delivery.supplierName || "—"}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                    {delivery.carrier || "In-House"}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                    {fmtDate(delivery.expectedArrivalDate || delivery.scheduledDate)}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-foreground whitespace-nowrap">
                    {itemCount} {itemCount === 1 ? "item" : "items"}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <StatusBadge status={delivery.status} />
                  </td>
                  <td
                    className="px-4 py-3.5 text-center whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
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
