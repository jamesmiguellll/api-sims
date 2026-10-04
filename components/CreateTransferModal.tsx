"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import api from "@/lib/api";

type LocationItem = {
  id: string;
  name: string;
  type: string;
  address: string;
  status: string;
};

interface CreateTransferModalProps {
  onClose: () => void;
  onSave: (transfer: any) => void;
  locations: LocationItem[];
  mode?: "create" | "edit" | "view";
  initialData?: any;
}

type InventoryEntry = {
  inventoryId: number;
  itemId: number;
  itemName: string;
  locationId: number;
  locationName: string;
  currentStock: number;
};

type FinishedProductEntry = {
  productId: number;
  itemId: number;
  itemName: string;
  sku: string;
  variant?: string;
};

export default function CreateTransferModal({
  onClose,
  onSave,
  locations,
  mode = "create",
  initialData,
}: CreateTransferModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [product, setProduct] = useState("");
  const [productError, setProductError] = useState("");
  const [to, setTo] = useState("");
  const [toError, setToError] = useState("");
  const [quantity, setQuantity] = useState("");
  const [quantityError, setQuantityError] = useState("");
  const [date, setDate] = useState("");
  const [dateError, setDateError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const [products, setProducts] = useState<FinishedProductEntry[]>([]);
  const [inventories, setInventories] = useState<InventoryEntry[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Derived: the inventory entry for the selected product (determines source location & available stock)
  const selectedInventory = (() => {
    if (!product || products.length === 0 || inventories.length === 0) return null;
    const fp = products.find((p) => p.productId.toString() === product);
    if (!fp) return null;
    // Strictly find the inventory at the Commissary
    return inventories.find((inv) => inv.itemId === fp.itemId && inv.locationName.toLowerCase().includes("commissary"))
           ?? inventories.find((inv) => inv.itemId === fp.itemId) // fallback
           ?? null;
  })();

  const availableStock = selectedInventory?.currentStock ?? null;
  const sourceLocationId = selectedInventory?.locationId ?? null;
  const sourceLocationName = selectedInventory?.locationName ?? "N/A";

  const isReadOnly = mode === "view";

  // Populate form when editing/viewing
  useEffect(() => {
    if (initialData) {
      setProduct(initialData.productId?.toString() || "");
      setTo(initialData.destLocationId?.toString() || "");
      setQuantity(initialData.quantity?.toString() || "");

      let dateVal = initialData.rawDate || initialData.date || "";
      if (dateVal.includes("/")) {
        const parts = dateVal.split("/");
        // Handle DD/MM/YYYY or M/D/YYYY
        if (parts.length === 3) {
          const [d, m, y] = parts;
          dateVal = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      } else if (dateVal.includes("-") && dateVal.length > 10) {
        dateVal = dateVal.substring(0, 10);
      }
      setDate(dateVal);
    }
  }, [initialData]);

  // Fetch finished products + inventory on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingProducts(true);
      try {
        const [prodRes, invRes] = await Promise.all([
          api.get("/api/finished-products"),
          api.get("/api/inventory?pageSize=100"),
        ]);
        if (prodRes.data.success) {
          setProducts(prodRes.data.data?.items || prodRes.data.data || []);
        }
        if (invRes.data.success) {
          setInventories(invRes.data.data?.items || invRes.data.data || []);
        }
      } catch (err) {
        console.error("Error fetching transfer modal data", err);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    fetchData();
  }, []);

  // Reset quantity error when available stock changes
  useEffect(() => {
    if (quantity && availableStock !== null && Number(quantity) > availableStock) {
      setQuantityError(`Cannot exceed available stock of ${availableStock}.`);
    } else if (quantity && Number(quantity) > 0) {
      setQuantityError("");
    }
  }, [availableStock, quantity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;

    if (!product) {
      setProductError("Product is required.");
      hasError = true;
    }
    if (!to) {
      setToError("Destination is required.");
      hasError = true;
    }
    if (!quantity || Number(quantity) <= 0) {
      setQuantityError("Quantity must be greater than 0.");
      hasError = true;
    } else if (availableStock !== null && Number(quantity) > availableStock) {
      setQuantityError(`Cannot exceed available stock of ${availableStock}.`);
      hasError = true;
    }
    if (!date) {
      setDateError("Transfer date is required.");
      hasError = true;
    }

    if (hasError || dateError === "Past date is not allowed.") return;

    setSubmitError("");

    try {
      if (mode === "edit" && initialData?.id) {
        await api.put(`/api/stock-transfers/${initialData.id}`, {
          productId: Number(product),
          sourceLocationId: sourceLocationId ?? initialData.sourceLocationId ?? 1,
          destLocationId: Number(to),
          transferQuantity: Number(quantity),
          transferDate: date,
        });
      } else {
        if (!sourceLocationId) {
          setSubmitError("Could not determine source location. Ensure the product has inventory.");
          return;
        }
        await api.post("/api/stock-transfers", {
          productId: Number(product),
          sourceLocationId: sourceLocationId,
          destLocationId: Number(to),
          transferQuantity: Number(quantity),
          transferDate: date,
        });
      }
      onSave({} as any);
    } catch (err: any) {
      const msg =
        err.response?.data?.message || "Failed to save transfer. Please try again.";
      setSubmitError(msg);
    }
  };

  // Destination locations: exclude the source location for the selected product
  const destinationLocations = locations.filter(
    (loc) => !sourceLocationId || loc.id !== sourceLocationId.toString()
  );

  if (!mounted) return null;

  if (mode === "view" && initialData) {
    return createPortal(
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
        onClick={onClose}
      >
        <div
          className="w-[90vw] max-w-[90vw] sm:max-w-[80vw] md:max-w-[700px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto p-md sm:p-lg rounded-lg sm:rounded-xl border border-border bg-card flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border pb-3 mb-4 flex-shrink-0">
            <h2 className="text-xl font-bold text-foreground">
              Transfer Details - {initialData.id}
            </h2>
            <button
              onClick={onClose}
              className="text-foreground/60 hover:text-foreground transition-colors"
            >
              <X size={22} />
            </button>
          </div>

          <div className="mb-6">
            <span className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full border ${
              initialData.status === 'Completed' ? 'bg-foreground text-background border-foreground font-bold' :
              initialData.status === 'In Transit' ? 'bg-foreground text-background border-foreground font-bold' :
              initialData.status === 'Cancelled' ? 'bg-muted/30 text-muted-foreground border-border opacity-75' :
              'bg-muted/70 text-foreground border-muted-foreground/30'
            }`}>
              {initialData.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-y-5 gap-x-4 mb-6">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Product</p>
              <p className="text-base font-bold text-foreground">{initialData.product}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Quantity</p>
              <p className="text-base font-bold text-foreground">{initialData.quantity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">From Location</p>
              <p className="text-base font-bold text-foreground">{initialData.from}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">To Location</p>
              <p className="text-base font-bold text-foreground">{initialData.to}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Transfer Date</p>
              <p className="text-base font-bold text-foreground">{initialData.date}</p>
            </div>
          </div>

          {initialData.status === 'Completed' && (
            <div className="bg-green-50/50 border border-green-200 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <h3 className="text-sm font-bold text-green-700">Transfer Completed - Received</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Delivery Status</p>
                  <p className="text-sm font-bold text-foreground">Arrived & Verified</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Destination</p>
                  <p className="text-sm font-bold text-foreground">{initialData.to}</p>
                </div>
              </div>
            </div>
          )}

          <div className="border border-border rounded-2xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Quantity Verification</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Dispatched</p>
                <p className="text-xl font-bold text-foreground">{initialData.quantity}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Received</p>
                <p className="text-xl font-bold text-foreground">
                  {initialData.status === 'Completed' ? initialData.quantity : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-[90vw] sm:max-w-[80vw] md:max-w-[700px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto p-md sm:p-lg rounded-lg sm:rounded-xl border border-border bg-card flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4 flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {mode === "create"
                ? "Create Stock Transfer"
                : mode === "edit"
                ? "Edit Stock Transfer"
                : "View Stock Transfer"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {mode === "view"
                ? "Details of stock transfer"
                : "Transfer finished stock goods across enterprise branches"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Finished Product */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Finished Product <span className="text-muted-foreground">*</span>
            </label>
            <select
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                productError
                  ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                  : "border-border"
              } bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                isReadOnly ? "opacity-60 cursor-not-allowed" : ""
              }`}
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setProductError("");
                setQuantity("");
                setQuantityError("");
                setTo("");
                setToError("");
                setSubmitError("");
              }}
              disabled={isReadOnly || isLoadingProducts}
            >
              <option value="">
                {isLoadingProducts ? "Loading products…" : "Select product..."}
              </option>
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.itemName}{p.variant ? `, ${p.variant}` : ""}
                </option>
              ))}
            </select>
            {productError && <p className="mt-1 text-xs text-destructive">{productError}</p>}
          </div>

          {/* Source info (read-only) */}
          {product && (
            <div className="p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">From Location:</span>
                <span className="font-medium text-foreground">
                  {selectedInventory ? sourceLocationName : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="font-semibold text-foreground">Available Stock:</span>
                <span
                  className={`font-bold ${
                    availableStock !== null && availableStock > 0
                      ? "text-green-600"
                      : "text-destructive"
                  }`}
                >
                  {availableStock !== null ? `${availableStock} units` : "No inventory found"}
                </span>
              </div>
            </div>
          )}

          {/* Destination */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              To Location <span className="text-muted-foreground">*</span>
            </label>
            <select
              className={`w-full px-3 py-2 text-sm rounded-lg border ${
                toError
                  ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                  : "border-border"
              } bg-card text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${
                isReadOnly ? "opacity-60 cursor-not-allowed" : ""
              }`}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setToError("");
              }}
              disabled={isReadOnly}
            >
              <option value="">
                Select destination...
              </option>
              {destinationLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            {toError && <p className="mt-1 text-xs text-destructive">{toError}</p>}
          </div>

          {/* Quantity & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Quantity <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="number"
                min="0.001"
                step="0.001"
                max={availableStock ?? undefined}
                placeholder="e.g., 50"
                className={`w-full px-3 py-2 text-sm rounded-lg border ${
                  quantityError
                    ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                    : "border-border"
                } bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70`}
                value={quantity}
                disabled={isReadOnly}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e") e.preventDefault();
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuantity(val);
                  const num = Number(val);
                  if (!val || num <= 0) {
                    setQuantityError("Quantity must be greater than 0.");
                  } else if (availableStock !== null && num > availableStock) {
                    setQuantityError(`Cannot exceed available stock of ${availableStock}.`);
                  } else {
                    setQuantityError("");
                  }
                }}
              />
              {quantityError && <p className="mt-1 text-xs text-destructive">{quantityError}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Transfer Date <span className="text-muted-foreground">*</span>
              </label>
              <input
                type="date"
                min={new Date().toISOString().split("T")[0]}
                className={`w-full px-3 py-2 text-sm rounded-lg border ${
                  dateError
                    ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                    : "border-border"
                } bg-card text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-70`}
                value={date}
                disabled={isReadOnly}
                onChange={(e) => {
                  const val = e.target.value;
                  setDate(val);
                  const today = new Date().toISOString().split("T")[0];
                  if (val && val < today) {
                    setDateError("Past date is not allowed.");
                  } else {
                    setDateError("");
                  }
                }}
              />
              {dateError && <p className="mt-1 text-xs text-destructive">{dateError}</p>}
            </div>
          </div>

          {/* Backend error */}
          {submitError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs font-semibold text-red-600">⚠ {submitError}</p>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-6 border-t border-border">
            {isReadOnly ? (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-foreground border border-border bg-card hover:bg-foreground hover:text-background rounded-lg transition-colors"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-foreground border border-border bg-card hover:bg-foreground hover:text-background rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !product ||
                    !to ||
                    !quantity ||
                    Number(quantity) <= 0 ||
                    !!quantityError ||
                    !!dateError ||
                    (availableStock !== null && availableStock <= 0)
                  }
                  className="px-4 py-2 text-xs font-semibold text-background bg-foreground rounded-lg hover:bg-foreground/85 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mode === "edit" ? "Save Changes" : "Create Transfer"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
