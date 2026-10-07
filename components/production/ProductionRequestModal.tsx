"use client";

import React, { useState, useEffect, useMemo } from "react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  Package,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
} from "lucide-react";
import { ProductionRequestEntity, LotSuggestionsResponse } from "./types";
import { ProductionActionModal, ProductionActionType } from "./ProductionActionModal";

interface ProductionRequestModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newPrData?: any) => void;
  initialRequest?: ProductionRequestEntity | null;
  isAdmin?: boolean;
  isInventoryManager?: boolean;
  onProceedToIssuance?: (prodReqId: number) => void;
  onViewPrSummary?: (prData: any) => void;
}

interface ProductOption {
  productId: number;
  productName: string;
  sku: string;
  variant: string;
}

interface RecipeOption {
  recipeId: number;
  recipeName: string;
  productId: number;
  outputQuantity: number;
  yieldUom: string;
}

const REASON_OPTIONS = [
  "Regular Stock Replenishment",
  "Customer Order Fulfillment",
  "Buffer Stock Build-up",
  "Safety Stock Rebalance",
  "Event / Seasonal Demand",
  "Special Order",
  "Other",
];

export const HOURS_12 = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
export const MINUTES_OPTIONS = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

export function parse24HTo12H(time24: string): { hour: string; minute: string; period: "AM" | "PM" } {
  if (!time24 || !time24.includes(":")) {
    return { hour: "08", minute: "00", period: "AM" };
  }
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h)) h = 8;
  const minute = isNaN(m) ? "00" : String(m).padStart(2, "0");

  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  const hour = String(h12).padStart(2, "0");

  return { hour, minute, period };
}

export function convert12HTo24H(hour: string, minute: string, period: "AM" | "PM"): string {
  let h = parseInt(hour, 10);
  if (isNaN(h) || h < 1 || h > 12) h = 8;
  const m = parseInt(minute, 10);
  const mStr = isNaN(m) || m < 0 || m > 59 ? "00" : String(m).padStart(2, "0");

  if (period === "AM") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return `${String(h).padStart(2, "0")}:${mStr}`;
}

export function formatTimeTo12Hour(timeStr?: string | null): string {
  if (!timeStr) return "—";
  if (/am|pm/i.test(timeStr)) return timeStr;
  const { hour, minute, period } = parse24HTo12H(timeStr);
  return `${hour}:${minute} ${period}`;
}

export default function ProductionRequestModal({
  open,
  onClose,
  onSuccess,
  initialRequest,
  isAdmin,
  isInventoryManager,
  onProceedToIssuance,
  onViewPrSummary,
}: ProductionRequestModalProps) {
  const isViewMode = Boolean(initialRequest);

  // Form State
  const [selectedProductName, setSelectedProductName] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [recipeId, setRecipeId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(100);
  const [priority, setPriority] = useState<"Low" | "Medium" | "High">("Medium");
  const [requiredDate, setRequiredDate] = useState<string>("");
  const [requiredTime, setRequiredTime] = useState<string>("08:00");
  const [timeHour, setTimeHour] = useState<string>("08");
  const [timeMinute, setTimeMinute] = useState<string>("00");
  const [timePeriod, setTimePeriod] = useState<"AM" | "PM">("AM");
  const [selectedReasonOption, setSelectedReasonOption] = useState<string>("Regular Stock Replenishment");
  const [customReason, setCustomReason] = useState<string>("");

  // Action modal state (PR/PO confirmation style)
  const [actionModal, setActionModal] = useState<{ open: boolean; type: ProductionActionType } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>("");

  // Data fetching
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<RecipeOption[]>([]);
  const [lotSuggestions, setLotSuggestions] = useState<LotSuggestionsResponse | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Today string for date input min validation (YYYY-MM-DD)
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  // Unique product names for Product select
  const uniqueProductNames = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.productName) set.add(p.productName);
    });
    return Array.from(set);
  }, [products]);

  // Available variants for the selected product
  const availableVariants = useMemo(() => {
    if (!selectedProductName) return [];
    const set = new Set<string>();
    products
      .filter((p) => p.productName === selectedProductName)
      .forEach((p) => {
        set.add(p.variant?.trim() || "Standard");
      });
    return Array.from(set);
  }, [products, selectedProductName]);

  // Initialize defaults
  useEffect(() => {
    if (open) {
      if (initialRequest) {
        setSelectedProductName(initialRequest.productName || "");
        setSelectedVariant(initialRequest.variant || "Standard");
        setProductId(String(initialRequest.productId));
        setRecipeId(String(initialRequest.recipeId));
        setQuantity(initialRequest.quantity);

        const rawP = initialRequest.priority;
        if (rawP === "High" || rawP === "Priority") {
          setPriority("High");
        } else if (rawP === "Low") {
          setPriority("Low");
        } else {
          setPriority("Medium");
        }

        setRequiredDate(initialRequest.requiredDate ? initialRequest.requiredDate.slice(0, 10) : "");
        const rawTime = initialRequest.requiredTime || "08:00";
        setRequiredTime(rawTime);
        const parsedTime = parse24HTo12H(rawTime);
        setTimeHour(parsedTime.hour);
        setTimeMinute(parsedTime.minute);
        setTimePeriod(parsedTime.period);

        const rawReason = initialRequest.reason || "Regular Stock Replenishment";
        if (REASON_OPTIONS.includes(rawReason)) {
          setSelectedReasonOption(rawReason);
          setCustomReason("");
        } else {
          setSelectedReasonOption("Other");
          setCustomReason(rawReason);
        }
      } else {
        // Reset form for new creation
        setSelectedProductName("");
        setSelectedVariant("");
        setProductId("");
        setRecipeId("");
        setQuantity(100);
        setPriority("Medium");
        const tomorrowDate = new Date(Date.now() + 86400000);
        const tomorrowStr = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, "0")}-${String(tomorrowDate.getDate()).padStart(2, "0")}`;
        setRequiredDate(tomorrowStr);
        setRequiredTime("08:00");
        setTimeHour("08");
        setTimeMinute("00");
        setTimePeriod("AM");
        setSelectedReasonOption("Regular Stock Replenishment");
        setCustomReason("");
        setLotSuggestions(null);
      }
      setActionModal(null);
    }
  }, [open, initialRequest]);

  // Load products and recipes
  useEffect(() => {
    if (open) {
      api.get("/api/finished-products").then((res: any) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          setProducts(
            res.data.data.map((p: any) => ({
              productId: p.productId,
              productName: p.itemName || p.productName || "Product",
              sku: p.sku || "",
              variant: p.variant || "",
            }))
          );
        }
      }).catch(console.error);

      api.get("/api/recipes").then((res: any) => {
        const rawRecipes = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (Array.isArray(rawRecipes)) {
          setRecipes(
            rawRecipes.map((r: any) => ({
              recipeId: r.recipeId,
              recipeName: r.recipeName,
              productId: r.productId,
              outputQuantity: Number(r.outputQuantity) > 0 ? Number(r.outputQuantity) : 100,
              yieldUom: r.yieldUom || "pcs",
            }))
          );
        }
      }).catch(console.error);
    }
  }, [open]);

  // Handle Product Name selection
  const handleProductSelect = (name: string) => {
    setSelectedProductName(name);
    const matching = products.filter((p) => p.productName === name);
    const defaultVariant = matching[0]?.variant?.trim() || "Standard";
    setSelectedVariant(defaultVariant);
    const matchedProd = matching.find((p) => (p.variant?.trim() || "Standard") === defaultVariant) || matching[0];
    if (matchedProd) {
      setProductId(String(matchedProd.productId));
    } else {
      setProductId("");
    }
  };

  // Handle Variant selection
  const handleVariantSelect = (variant: string) => {
    setSelectedVariant(variant);
    const matchedProd = products.find(
      (p) => p.productName === selectedProductName && (p.variant?.trim() || "Standard") === variant
    );
    if (matchedProd) {
      setProductId(String(matchedProd.productId));
    }
  };

  // Filter recipes when product changes
  useEffect(() => {
    if (productId) {
      const pId = Number(productId);
      const matched = recipes.filter((r) => {
        if (r.productId === pId) return true;
        const rProd = products.find((p) => p.productId === r.productId);
        return rProd && selectedProductName && rProd.productName.toLowerCase() === selectedProductName.toLowerCase();
      });
      setFilteredRecipes(matched);
      if (matched.length > 0 && !matched.some((r) => String(r.recipeId) === recipeId)) {
        setRecipeId(String(matched[0].recipeId));
        setQuantity(Number(matched[0].outputQuantity) || 100);
      }
    } else {
      setFilteredRecipes([]);
    }
  }, [productId, recipes, recipeId, selectedProductName, products]);

  // Fetch live lot suggestions whenever recipeId or quantity changes
  useEffect(() => {
    if (!open) return;
    if (isViewMode && initialRequest) {
      // In view mode, fetch suggestions for the existing request
      setLoadingSuggestions(true);
      api.get(`/api/production-requests/${initialRequest.prodReqId}/lot-suggestions`)
        .then((res: any) => {
          if (res.data?.success) {
            setLotSuggestions(res.data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingSuggestions(false));
    } else if (recipeId && quantity > 0) {
      // In create mode, fetch preview
      setLoadingSuggestions(true);
      api.get(`/api/production-requests/preview/lot-suggestions?recipeId=${recipeId}&quantity=${quantity}`)
        .then((res: any) => {
          if (res.data?.success) {
            setLotSuggestions(res.data.data);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingSuggestions(false));
    } else {
      setLotSuggestions(null);
    }
  }, [open, isViewMode, initialRequest, recipeId, quantity]);

  // Validation handlers for Date and Time
  const handleDateChange = (val: string) => {
    if (val && val < today) {
      toast.error("Required date cannot be in the past.");
      return;
    }
    setRequiredDate(val);
    if (val === today) {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, "0");
      const currentMins = String(now.getMinutes()).padStart(2, "0");
      const currentTimeStr = `${currentHours}:${currentMins}`;
      if (requiredTime < currentTimeStr) {
        setRequiredTime(currentTimeStr);
        const parsed = parse24HTo12H(currentTimeStr);
        setTimeHour(parsed.hour);
        setTimeMinute(parsed.minute);
        setTimePeriod(parsed.period);
      }
    }
  };

  const updateTime = (newHour: string, newMinute: string, newPeriod: "AM" | "PM") => {
    setTimeHour(newHour);
    setTimeMinute(newMinute);
    setTimePeriod(newPeriod);
    const time24 = convert12HTo24H(newHour, newMinute, newPeriod);
    setRequiredTime(time24);
  };

  // Handle Save (Draft or Submit)
  const handleSubmit = async (submitForApproval: boolean) => {
    if (!productId || !recipeId || !quantity || quantity <= 0) {
      toast.error("Please select a product, variant, recipe, and valid target quantity.");
      return;
    }

    if (!requiredDate) {
      toast.error("Please specify the required date.");
      return;
    }

    if (requiredDate < today) {
      toast.error("Required date cannot be in the past.");
      return;
    }

    if (requiredDate === today) {
      const now = new Date();
      const currentHours = String(now.getHours()).padStart(2, "0");
      const currentMins = String(now.getMinutes()).padStart(2, "0");
      const currentTimeStr = `${currentHours}:${currentMins}`;
      if (requiredTime < currentTimeStr) {
        toast.error(`Required time cannot be in the past for today (current time: ${formatTimeTo12Hour(currentTimeStr)}).`);
        return;
      }
    }

    const finalReason = selectedReasonOption === "Other"
      ? (customReason.trim() || "Other")
      : selectedReasonOption;

    setSubmitting(true);
    try {
      const payload = {
        productId: Number(productId),
        recipeId: Number(recipeId),
        quantity: Number(quantity),
        priority,
        requiredDate,
        requiredTime,
        reason: finalReason,
        submitForApproval,
      };

      const res = await api.post("/api/production-requests", payload);

      if (res.data?.success) {
        const createdReq = res.data.data;

        // If shortfall detected, redirect to Purchase Requisition page with Create PR modal prefilled
        if (lotSuggestions?.hasAnyShortfall) {
          const shortfallItems = lotSuggestions.ingredients
            .filter((ing) => ing.hasShortfall || ing.shortfallQuantity > 0)
            .map((ing) => ({
              itemId: ing.itemId,
              itemCode: ing.itemCode,
              itemName: ing.itemName,
              uomName: ing.uomAbbr,
              currentStock: ing.totalAvailable,
              requestedQuantity: Math.ceil(ing.shortfallQuantity * 100) / 100,
            }));

          const prefillPR = {
            department: "Production",
            requestType: "Production Shortfall",
            priority: priority === "High" ? "Urgent" : "Normal",
            purpose: `Material shortfall replenishment for ${createdReq.reqNumber}`,
            notes: `Auto-generated for Production Request ${createdReq.reqNumber}. Required shortfall items: ${shortfallItems.map((s) => s.itemName).join(", ")}.`,
            items: shortfallItems,
            sourceProdReqId: createdReq.prodReqId,
          };

          sessionStorage.setItem("prefill_pr", JSON.stringify(prefillPR));
          toast.success(`Production Request ${createdReq.reqNumber} created. Opening Purchase Requisition form...`);
          onSuccess(createdReq);
          onClose();
          window.location.href = "/orders-procurement?tab=pr&create=true";
          return;
        }

        toast.success(`Production Request ${createdReq.reqNumber} submitted for approval!`);
        onSuccess(createdReq);
        onClose();
      } else {
        toast.error(res.data?.message || "Failed to create production request.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Status Actions (Submit Draft, Admin Approve, Admin Reject, Cancel)
  const handleStatusAction = async (action: "submit_approval" | "approve" | "reject" | "cancel", notes?: string) => {
    if (!initialRequest) return;

    setSubmitting(true);
    try {
      const payload: any = { action };
      if (action === "reject") {
        payload.rejectionReason = notes || rejectionReason;
      }

      const res = await api.patch(`/api/production-requests/${initialRequest.prodReqId}`, payload);
      if (res.data?.success) {
        toast.success(
          action === "approve"
            ? "Production request approved!"
            : action === "reject"
            ? "Production request rejected."
            : action === "cancel"
            ? "Production request cancelled."
            : "Production request submitted for approval!"
        );
        onSuccess();
        onClose();
      } else {
        toast.error(res.data?.message || "Action failed.");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "An error occurred.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Create PR directly from View mode
  const handleCreatePrDirect = async () => {
    if (!initialRequest) return;
    const shortfallItems = (lotSuggestions?.ingredients || [])
      .filter((ing) => ing.hasShortfall || ing.shortfallQuantity > 0)
      .map((ing) => ({
        itemId: ing.itemId,
        itemCode: ing.itemCode,
        itemName: ing.itemName,
        uomName: ing.uomAbbr,
        currentStock: ing.totalAvailable,
        requestedQuantity: Math.ceil(ing.shortfallQuantity * 100) / 100,
      }));

    const prefillPR = {
      department: "Production",
      requestType: "Production Shortfall",
      priority: priority === "High" ? "Urgent" : "Normal",
      purpose: `Material shortfall replenishment for ${initialRequest.reqNumber}`,
      notes: `Auto-generated for Production Request ${initialRequest.reqNumber}. Required shortfall items: ${shortfallItems.map((s) => s.itemName).join(", ")}.`,
      items: shortfallItems,
      sourceProdReqId: initialRequest.prodReqId,
    };

    sessionStorage.setItem("prefill_pr", JSON.stringify(prefillPR));
    toast.success(`Opening Purchase Requisition form for shortfalls...`);
    onClose();
    window.location.href = "/orders-procurement?tab=pr&create=true";
  };

  return (
    <ModalWrapper
      open={open}
      title={isViewMode ? `Production Request: ${initialRequest?.reqNumber}` : "New Production Request"}
      onClose={onClose}
      size="max-w-6xl"
    >
      <div className="space-y-6 overflow-y-auto max-h-[calc(85vh-120px)] pr-1">
        {/* Header Summary for View Mode */}
        {isViewMode && initialRequest && (
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center font-bold text-foreground">
                <Package className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground text-sm">{initialRequest.productName}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-muted border border-border font-medium text-muted-foreground">
                    {initialRequest.variant || "Standard"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>Request No: {initialRequest.reqNumber}</span>
                  <span>•</span>
                  <span>Recipe: {initialRequest.recipeName}</span>
                  <span>•</span>
                  <span>Target: {initialRequest.quantity} {initialRequest.yieldUom}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full border border-border bg-card text-foreground">
                Priority: {priority}
              </span>
              <StatusBadge status={initialRequest.status} />
            </div>
          </div>
        )}

        {/* Informative Status Notification Banners for View Mode */}
        {isViewMode && initialRequest?.status === "Rejected" && (
          <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-foreground">Production Request Rejected</h4>
              <p className="text-xs text-muted-foreground">
                This request was rejected by <strong className="text-foreground">{initialRequest.rejectedBy || "Admin"}</strong>
                {initialRequest.rejectedAt ? ` on ${new Date(initialRequest.rejectedAt).toLocaleDateString()}` : ""}.
                {initialRequest.rejectionReason && (
                  <span> Reason: &quot;{initialRequest.rejectionReason}&quot;.</span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground font-medium">
                ✓ All reserved ingredient lots for this request have been released back to available inventory and are available for new production requests.
              </p>
            </div>
          </div>
        )}

        {isViewMode && initialRequest?.status === "Approved" && (
          <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-foreground">Production Request Approved &amp; Lots Finalized</h4>
              <p className="text-xs text-muted-foreground">
                Approved by <strong className="text-foreground">{initialRequest.approvedBy || "Admin"}</strong>
                {initialRequest.approvedAt ? ` on ${new Date(initialRequest.approvedAt).toLocaleDateString()}` : ""}.
                The reserved ingredient lots shown below are locked for this request and cannot be recommended to other requests. They will be consumed upon Material Issuance.
              </p>
            </div>
          </div>
        )}

        {isViewMode && initialRequest?.status === "Pending Approval" && (
          <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-start gap-3">
            <Clock className="w-5 h-5 text-foreground shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="text-xs font-bold text-foreground">Pending Approval — Lots Reserved</h4>
              <p className="text-xs text-muted-foreground">
                The ingredient lots shown below are actively reserved for this request and cannot be recommended or assigned to other production requests. If rejected by an admin, the reservations will be released back to available inventory.
              </p>
            </div>
          </div>
        )}

        {/* Form Inputs (Organized Top Section) */}
        <div className="space-y-4">
          {/* Row 1: Finished Product, Variant, Recipe / BOM */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Finished Product */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Finished Product</label>
              {isViewMode ? (
                <div className="p-2.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground">
                  {initialRequest?.productName}
                </div>
              ) : (
                <Select value={selectedProductName} onValueChange={handleProductSelect}>
                  <SelectTrigger className="w-full h-10 text-xs rounded-xl border-border bg-card">
                    <SelectValue placeholder="Select product..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {uniqueProductNames.map((name) => (
                      <SelectItem key={name} value={name} className="text-xs">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Variant */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Variant</label>
              {isViewMode ? (
                <div className="p-2.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground">
                  {initialRequest?.variant || "Standard"}
                </div>
              ) : (
                <Select
                  value={selectedVariant}
                  onValueChange={handleVariantSelect}
                  disabled={!selectedProductName || availableVariants.length === 0}
                >
                  <SelectTrigger className="w-full h-10 text-xs rounded-xl border-border bg-card">
                    <SelectValue
                      placeholder={
                        !selectedProductName
                          ? "Select product first"
                          : availableVariants.length === 0
                          ? "No variant"
                          : "Select variant..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {availableVariants.map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Recipe / BOM */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Recipe / BOM</label>
              {isViewMode ? (
                <div className="p-2.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground">
                  {initialRequest?.recipeName}
                </div>
              ) : (
                <Select value={recipeId} onValueChange={setRecipeId} disabled={!productId || filteredRecipes.length === 0}>
                  <SelectTrigger className="w-full h-10 text-xs rounded-xl border-border bg-card">
                    <SelectValue
                      placeholder={
                        !productId
                          ? "Select product first"
                          : filteredRecipes.length === 0
                          ? "No recipe available"
                          : "Select recipe..."
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {filteredRecipes.length > 0 ? (
                      filteredRecipes.map((r) => (
                        <SelectItem key={r.recipeId} value={String(r.recipeId)} className="text-xs">
                          {r.recipeName}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="p-3 text-xs text-muted-foreground text-center">
                        No recipe configured for this product.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Row 2: Target Quantity, Priority Level, Required Date, Required Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Target Output Quantity */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Target Output Quantity</label>
              {isViewMode ? (
                <div className="p-2.5 rounded-xl border border-border bg-card text-xs font-mono font-bold text-foreground">
                  {initialRequest?.quantity} {initialRequest?.yieldUom}
                </div>
              ) : (
                <Input
                  type="number"
                  min="1"
                  value={quantity || ""}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="h-10 text-xs rounded-xl border-border bg-card font-mono font-medium"
                  placeholder="e.g. 100"
                />
              )}
            </div>

            {/* Priority Level: Low, Medium, High */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Priority Level</label>
              {isViewMode ? (
                <div className="p-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground">
                  {priority}
                </div>
              ) : (
                <Select value={priority} onValueChange={(val: any) => setPriority(val)}>
                  <SelectTrigger className="w-full h-10 text-xs rounded-xl border-border bg-card font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="Low" className="text-xs">
                      Low
                    </SelectItem>
                    <SelectItem value="Medium" className="text-xs">
                      Medium
                    </SelectItem>
                    <SelectItem value="High" className="text-xs">
                      High
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Required Date (No duplicate icons, min={today}) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Required Date</label>
              {isViewMode ? (
                <div className="p-2.5 rounded-xl border border-border bg-card text-xs font-mono text-foreground">
                  {initialRequest?.requiredDate ? new Date(initialRequest.requiredDate).toLocaleDateString() : "—"}
                </div>
              ) : (
                <Input
                  type="date"
                  min={today}
                  value={requiredDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="h-10 text-xs rounded-xl border-border bg-card"
                />
              )}
            </div>

            {/* Required Time (12-hour format with AM/PM) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Required Time</label>
              {isViewMode ? (
                <div className="h-10 px-3 rounded-xl border border-border bg-card text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{formatTimeTo12Hour(initialRequest?.requiredTime || requiredTime)}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-bold uppercase">
                    {parse24HTo12H(initialRequest?.requiredTime || requiredTime).period}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 h-10">
                  {/* Hour */}
                  <Select
                    value={timeHour}
                    onValueChange={(val) => updateTime(val, timeMinute, timePeriod)}
                  >
                    <SelectTrigger className="h-10 flex-1 text-xs font-mono font-medium rounded-xl border-border bg-card px-2 text-center shadow-xs">
                      <SelectValue placeholder="HH" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56 bg-popover border-border">
                      {HOURS_12.map((h) => (
                        <SelectItem key={h} value={h} className="text-xs font-mono">
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <span className="text-muted-foreground font-bold text-xs shrink-0">:</span>

                  {/* Minute */}
                  <Select
                    value={timeMinute}
                    onValueChange={(val) => updateTime(timeHour, val, timePeriod)}
                  >
                    <SelectTrigger className="h-10 flex-1 text-xs font-mono font-medium rounded-xl border-border bg-card px-2 text-center shadow-xs">
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56 bg-popover border-border">
                      {Array.from(new Set([...MINUTES_OPTIONS, timeMinute]))
                        .sort((a, b) => Number(a) - Number(b))
                        .map((m) => (
                          <SelectItem key={m} value={m} className="text-xs font-mono">
                            {m}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>

                  {/* AM / PM Segmented Control */}
                  <div className="flex rounded-xl border border-border p-0.5 bg-muted/40 shrink-0 h-10 items-center">
                    <button
                      type="button"
                      onClick={() => updateTime(timeHour, timeMinute, "AM")}
                      className={`h-full px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        timePeriod === "AM"
                          ? "bg-foreground text-background shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTime(timeHour, timeMinute, "PM")}
                      className={`h-full px-2.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                        timePeriod === "PM"
                          ? "bg-foreground text-background shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Reason / Batch Purpose Dropdown */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Reason / Batch Purpose</label>
            {isViewMode ? (
              <div className="p-2.5 rounded-xl border border-border bg-card text-xs text-foreground truncate">
                {initialRequest?.reason || "Regular Stock Replenishment"}
              </div>
            ) : (
              <div className="space-y-2">
                <Select value={selectedReasonOption} onValueChange={setSelectedReasonOption}>
                  <SelectTrigger className="w-full h-10 text-xs rounded-xl border-border bg-card">
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {REASON_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt} className="text-xs">
                        {opt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedReasonOption === "Other" && (
                  <Input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Specify other reason..."
                    className="h-9 text-xs rounded-xl border-border bg-card"
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Shortfall Warning Banner (Monochromatic) */}
        {lotSuggestions?.hasAnyShortfall && (
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border bg-muted/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Material Shortfall Detected
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Available lot stock in inventory is insufficient for all required recipe ingredients. Submitting will generate a Purchase Requisition for the required shortfall quantities.
                </p>
              </div>
            </div>

            {isViewMode && !initialRequest?.linkedPrId && (
              <Button
                type="button"
                onClick={handleCreatePrDirect}
                disabled={submitting}
                className="bg-foreground text-background hover:bg-foreground/90 font-semibold text-xs px-3.5 py-1.5 rounded-xl transition-colors shrink-0 shadow-sm"
              >
                Create PR Now
              </Button>
            )}

            {isViewMode && initialRequest?.linkedPrId && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-foreground">
                  PR: {initialRequest.linkedPrNumber}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onViewPrSummary && onViewPrSummary({ prNumber: initialRequest.linkedPrNumber })}
                  className="text-xs h-7 rounded-lg border-border hover:bg-muted"
                >
                  View PR
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Bill of Materials Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Bill of Materials
            </h4>
            {loadingSuggestions && (
              <span className="text-xs text-muted-foreground animate-pulse">Calculating available lots...</span>
            )}
          </div>

          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Supply No.</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Ingredient Name</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Unit of Measure</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Required Quantity</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Available in Stock</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground min-w-[160px]">
                      {isViewMode
                        ? initialRequest?.status === "Rejected"
                          ? "Released Lots"
                          : initialRequest?.status === "Approved"
                          ? "Confirmed Lots"
                          : "Reserved Lots"
                        : "Suggested Lots"}
                    </th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground min-w-[120px]">Expiry Date</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground text-center">Stock Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lotSuggestions?.ingredients?.map((item) => {
                    const isRejected = initialRequest?.status === "Rejected";
                    const isApproved = initialRequest?.status === "Approved";
                    const isPending = initialRequest?.status === "Pending Approval";

                    // Active lots have suggested/reserved quantity > 0
                    const activeLots = (item.lots || []).filter((l: any) => Number(l.suggestedQuantity) > 0);
                    const releasedLots = (item.lots || []).filter((l: any) => l.isReleased);
                    const hasShortfall = item.hasShortfall || item.totalAvailable < item.requiredQuantity;

                    return (
                      <tr key={item.ingredientId} className="hover:bg-muted/10 transition-colors">
                        {/* Supply No. */}
                        <td className="py-3 px-4 font-mono text-[11px] font-semibold text-foreground whitespace-nowrap">
                          {item.itemCode || "—"}
                        </td>

                        {/* Ingredient Name */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground">{item.itemName}</div>
                        </td>

                        {/* Unit of Measure */}
                        <td className="py-3 px-4 font-mono text-muted-foreground whitespace-nowrap">
                          {item.uomAbbr || "units"}
                        </td>

                        {/* Required Quantity */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                          {item.requiredQuantity.toFixed(2)}
                        </td>

                        {/* Available in Stock */}
                        <td className="py-3 px-4 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                          {item.totalAvailable.toFixed(2)}
                        </td>

                        {/* Suggested / Reserved / Released Lots */}
                        <td className="py-3 px-4 min-w-[180px]">
                          {isRejected ? (
                            releasedLots.length > 0 ? (
                              <div className="space-y-1.5">
                                {releasedLots.map((l: any) => (
                                  <div
                                    key={l.lotId}
                                    className="font-mono text-[11px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border inline-flex items-center gap-1.5 line-through opacity-80"
                                  >
                                    <span>{l.lotCode}</span>
                                    <span className="font-normal whitespace-nowrap">
                                      ({Number(l.releasedQuantity || 0).toFixed(2)} {item.uomAbbr} released)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">None (Released)</span>
                            )
                          ) : activeLots.length > 0 ? (
                            <div className="space-y-1.5">
                              {activeLots.map((l) => (
                                <div
                                  key={l.lotId}
                                  className="font-mono text-[11px] font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded border border-border inline-flex items-center gap-1.5"
                                >
                                  <span>{l.lotCode}</span>
                                  <span className="text-muted-foreground font-normal whitespace-nowrap">
                                    ({Number(l.suggestedQuantity).toFixed(2)} {item.uomAbbr})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">None</span>
                          )}
                        </td>

                        {/* Expiry Date Column */}
                        <td className="py-3 px-4 min-w-[120px] whitespace-nowrap">
                          {(isRejected && releasedLots.length > 0 ? releasedLots : activeLots).length > 0 ? (
                            <div className="space-y-1.5">
                              {(isRejected && releasedLots.length > 0 ? releasedLots : activeLots).map((l: any) => (
                                <div key={l.lotId} className="font-mono text-[11px] text-muted-foreground py-0.5">
                                  {l.expiryDate ? new Date(l.expiryDate).toLocaleDateString() : "—"}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </td>

                        {/* Stock Status (Strictly Monochromatic) */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isRejected ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full">
                              Released to Stock
                            </span>
                          ) : isApproved ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full">
                              Reserved &amp; Confirmed
                            </span>
                          ) : isPending ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full">
                              Reserved (Pending)
                            </span>
                          ) : hasShortfall ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-background bg-foreground border border-foreground px-2.5 py-0.5 rounded-full">
                              Shortfall: {item.shortfallQuantity.toFixed(2)} {item.uomAbbr}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground bg-muted border border-border px-2.5 py-0.5 rounded-full">
                              Available
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!lotSuggestions || lotSuggestions.ingredients.length === 0) && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">
                        Select a product and recipe to preview bill of materials and suggested lots.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons (Monochromatic - No Draft) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold rounded-xl border-border hover:bg-muted"
          >
            {isViewMode ? "Close" : "Cancel"}
          </Button>

          <div className="flex items-center gap-2">
            {!isViewMode ? (
              <Button
                type="button"
                onClick={() => handleSubmit(true)}
                disabled={submitting || !recipeId}
                className="bg-foreground text-background font-semibold text-xs px-5 py-2 rounded-xl hover:bg-foreground/90 transition-colors shadow-sm"
              >
                {submitting
                  ? "Processing..."
                  : lotSuggestions?.hasAnyShortfall
                  ? "Create Purchase Requisition"
                  : "Submit for Approval"}
              </Button>
            ) : (
              <>
                {/* Admin Approval Actions (PR/PO style confirmation modal) */}
                {isAdmin && initialRequest?.status === "Pending Approval" && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActionModal({ open: true, type: "reject" })}
                      disabled={submitting}
                      className="text-xs font-semibold text-foreground rounded-xl border-border hover:bg-muted cursor-pointer"
                    >
                      Reject Request
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setActionModal({ open: true, type: "approve" })}
                      disabled={submitting}
                      className="bg-foreground text-background font-semibold text-xs px-5 py-2 rounded-xl hover:bg-foreground/90 transition-colors shadow-sm cursor-pointer"
                    >
                      Approve Request
                    </Button>
                  </>
                )}

                {/* Shortfall resolution shortcut in View Mode */}
                {lotSuggestions?.hasAnyShortfall && (isInventoryManager || isAdmin) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreatePrDirect}
                    className="text-xs font-semibold text-foreground rounded-xl border-border hover:bg-muted cursor-pointer"
                  >
                    Create Purchase Requisition
                  </Button>
                )}

                {/* Approved status -> Proceed to Material Issuance */}
                {isInventoryManager && initialRequest?.status === "Approved" && onProceedToIssuance && (
                  <Button
                    type="button"
                    onClick={() => {
                      onProceedToIssuance(initialRequest.prodReqId);
                      onClose();
                    }}
                    className="bg-foreground text-background font-semibold text-xs px-5 py-2 rounded-xl hover:bg-foreground/90 transition-colors shadow-sm cursor-pointer"
                  >
                    Proceed to Material Issuance
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Admin Approve / Reject Confirmation Modal (PR/PO styled) */}
      {actionModal && initialRequest && (
        <ProductionActionModal
          open={actionModal.open}
          actionType={actionModal.type}
          reqNumber={initialRequest.reqNumber}
          onConfirm={async (notes) => {
            await handleStatusAction(actionModal.type, notes);
            setActionModal(null);
          }}
          onClose={() => setActionModal(null)}
        />
      )}
    </ModalWrapper>
  );
}
