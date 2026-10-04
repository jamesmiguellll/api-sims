"use client";

import React, { useState } from "react";
import { MoreHorizontal, Truck, Check, XCircle } from "lucide-react";
import { TransferItem } from "./types";

interface StockTransferTableProps {
  transfers: TransferItem[];
  onDispatch: (item: TransferItem) => void;
  onReceive: (item: TransferItem) => void;
  onCancel: (item: TransferItem) => void;
}

import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function StockTransferTable({
  transfers,
  onDispatch,
  onReceive,
  onCancel,
}: StockTransferTableProps) {
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">TRANSFER ID</th>
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">PRODUCT</th>
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">SOURCE</th>
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">DESTINATION</th>
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">QTY</th>
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">DATE</th>
            <th className="px-3 py-3 text-left font-bold text-muted-foreground tracking-wider whitespace-nowrap">STATUS</th>
            <th className="px-3 py-3 text-center font-bold text-muted-foreground tracking-wider whitespace-nowrap">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transfers.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
                No Results Found
              </td>
            </tr>
          ) : (
            transfers.map((item) => (
              <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-3 py-3 font-bold text-foreground whitespace-nowrap">{item.id}</td>
                <td className="px-3 py-3 font-medium text-foreground whitespace-nowrap">{item.product}</td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{item.from}</td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{item.to}</td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{item.quantity}</td>
                <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{item.date}</td>
                <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg border border-transparent text-foreground hover:bg-muted/80 transition-all data-[state=open]:bg-muted data-[state=open]:border-border data-[state=open]:shadow-sm cursor-pointer"
                      >
                        <MoreHorizontal size={18} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36 z-[100]">
                      {item.status === "Pending" && (
                        <>
                          <DropdownMenuItem onClick={() => onDispatch(item)} className="flex items-center gap-2 cursor-pointer">
                            <Truck size={14} className="shrink-0" /> Dispatch
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onCancel(item)} className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                            <XCircle size={14} className="shrink-0" /> Cancel
                          </DropdownMenuItem>
                        </>
                      )}
                      {item.status === "In Transit" && (
                        <DropdownMenuItem onClick={() => onReceive(item)} className="flex items-center gap-2 cursor-pointer">
                          <Check size={14} className="shrink-0" /> Mark Received
                        </DropdownMenuItem>
                      )}
                      {item.status === "Completed" && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Transfer completed</div>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
