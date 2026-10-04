"use client";

import React, { useEffect, useState, useMemo } from "react";
import { X, Loader2, Check, AlertTriangle, Package } from "lucide-react";
import api from "../lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type IngredientAllocation = {
  ingredientId: number;
  ingredientName: string;
  requiredQty: number;
  uom: string;
  availableStock: number;
};

type Variant = {
  variantId: string;
  variantName: string;
  targetYield: number;
  yieldUnit: string;
  ingredients: IngredientAllocation[];
};

// Type definitions for backend responses
type FinishedProductResponse = {
  productId: number;
  itemId: number;
  itemName: string;
  sku: string;
  variant: string;
};

type RecipeIngredientResponse = {
  ingredientId: number;
  itemId: number;
  uomId: number;
  standardQuantity: number;
};

type RecipeResponse = {
  recipeId: number;
  productId: number;
  recipeName: string;
  outputQuantity: number;
  ingredients: RecipeIngredientResponse[];
};

type ItemResponse = {
  itemId: number;
  itemName: string;
  uomName: string;
  currentStock: number;
};

const PURPOSE_OPTIONS = [
  "Inventory Replenishment",
  "Customer Order",
  "Store Allocation",
  "Promotional Demand",
  "Safety Stock Build",
] as const;

const NOTES_OPTIONS = [
  "Standard Production Run",
  "Priority Production",
  "Seasonal Production",
  "Trial / Validation Run",
  "No Additional Notes",
] as const;

const toLocalDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function CreateBatchModal({ open, onClose, onCreated }: Props) {
  const [finishedProduct, setFinishedProduct] = useState("");
  const [finishedProductError, setFinishedProductError] = useState("");

  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [variantError, setVariantError] = useState("");

  const [userTargetYield, setUserTargetYield] = useState<number | "">("");
  const [targetYieldError, setTargetYieldError] = useState("");

  const [recipeTargetYield, setRecipeTargetYield] = useState<number | null>(null);
  const [yieldUnit, setYieldUnit] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleDateError, setScheduleDateError] = useState("");
  const [purpose, setPurpose] = useState<string>(PURPOSE_OPTIONS[0]);
  const [notes, setNotes] = useState<string>(NOTES_OPTIONS[0]);
  const [priority, setPriority] = useState<"Normal" | "Urgent">("Normal");

  const [ingredients, setIngredients] = useState<IngredientAllocation[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState<FinishedProductResponse[]>([]);
  const [recipes, setRecipes] = useState<RecipeResponse[]>([]);
  const [items, setItems] = useState<ItemResponse[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  const availableVariants = useMemo(() => {
    if (!finishedProduct) return [];
    return recipes.filter(r => r.productId.toString() === finishedProduct);
  }, [finishedProduct, recipes]);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setFinishedProduct("");
      setFinishedProductError("");
      setSelectedVariantId("");
      setVariantError("");
      setUserTargetYield("");
      setTargetYieldError("");
      setRecipeTargetYield(null);
      setYieldUnit("");
      setScheduleDate("");
      setScheduleDateError("");
      setPurpose(PURPOSE_OPTIONS[0]);
      setNotes(NOTES_OPTIONS[0]);
      setPriority("Normal");
      setIngredients([]);
      setIsComputing(false);
      setIsSubmitting(false);

      // Fetch all required data
      const loadData = async () => {
        setIsLoadingData(true);
        try {
          const [prodRes, recipeRes, itemRes] = await Promise.all([
            api.get("/api/finished-products"),
            api.get("/api/recipes"),
            api.get("/api/items?pageSize=1000"),
          ]);
          setProducts(prodRes.data.data?.items || prodRes.data.data || []);
          setRecipes(recipeRes.data.data?.items || recipeRes.data.data || []);
          setItems(itemRes.data.data?.items || itemRes.data.data || []);
        } catch (err) {
          console.error("Failed to load master data for Create Batch Modal", err);
        } finally {
          setIsLoadingData(false);
        }
      };
      loadData();
    }
  }, [open]);

  // Load recipe when variant changes
  useEffect(() => {
    if (!selectedVariantId || !finishedProduct) {
      setRecipeTargetYield(null);
      setYieldUnit("");
      setIngredients([]);
      return;
    }

    const fetchRecipe = async () => {
      setIsComputing(true);
      try {
        const variant = availableVariants.find((v) => v.recipeId.toString() === selectedVariantId);
        if (variant) {
          setRecipeTargetYield(variant.outputQuantity);
          const prodItem = items.find(i => i.itemId === products.find(p => p.productId.toString() === finishedProduct)?.itemId);
          setYieldUnit(prodItem?.uomName || "units");

          // Map ingredients to display shape
          const computedIngredients = variant.ingredients
            .filter(ing => ing.itemId !== prodItem?.itemId)
            .map(ing => {
            const item = items.find(i => i.itemId === ing.itemId);
            return {
              ingredientId: ing.ingredientId,
              ingredientName: item?.itemName || `Item #${ing.itemId}`,
              requiredQty: ing.standardQuantity,
              uom: item?.uomName || "",
              availableStock: item?.currentStock || 0
            };
          });
          setIngredients(computedIngredients);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsComputing(false);
      }
    };

    fetchRecipe();
  }, [selectedVariantId, finishedProduct, availableVariants, items, products]);

  // A Good For One recipe is scaled directly by the requested number of output units.
  const batchMultiplierFor = (targetYield: number | string) => {
    if (targetYield === "" || Number(targetYield) <= 0) return 0;
    return Number(targetYield);
  };

  const hasStockIssue = useMemo(() => {
    const multiplier = batchMultiplierFor(userTargetYield);
    return ingredients.some((ing) => ing.availableStock < ing.requiredQty * multiplier);
  }, [ingredients, userTargetYield]);

  const isFormValid =
    finishedProduct &&
    selectedVariantId &&
    userTargetYield !== "" &&
    Number(userTargetYield) > 0 &&
    !targetYieldError &&
    scheduleDate &&
    !scheduleDateError &&
    purpose &&
    notes &&
    !isSubmitting &&
    !hasStockIssue;

  const submitBatch = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      await api.post("/api/ProductionBatches", {
        recipeId: Number(selectedVariantId),
        productId: Number(finishedProduct),
        batchSize: Number(userTargetYield),
        scheduleDate: scheduleDate + "T00:00:00Z",
        assignedCook: "System Assignment", // Or user selector if available
        purpose,
        notes,
        priority,
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create batch", err);
      alert("Failed to create batch due to insufficient stock or server error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddBatch = () => {
    let hasError = false;

    if (!finishedProduct) {
      setFinishedProductError("Finished product is required.");
      hasError = true;
    }
    if (!selectedVariantId) {
      setVariantError("Variant is required.");
      hasError = true;
    }
    if (userTargetYield === "" || Number(userTargetYield) <= 0) {
      setTargetYieldError("Target yield must be greater than 0.");
      hasError = true;
    }
    if (!scheduleDate) {
      setScheduleDateError("Schedule date is required.");
      hasError = true;
    }

    if (hasError || scheduleDateError || targetYieldError || hasStockIssue) return;

    submitBatch();
  };

  // ---------- Date validation ----------
  const validateScheduleDate = (val: string) => {
    if (!val) {
      setScheduleDateError("");
      return;
    }
    // Basic format check
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(val)) {
      setScheduleDateError("Invalid date format.");
      return;
    }
    const dateObj = new Date(val + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(dateObj.getTime())) {
      setScheduleDateError("Invalid date.");
    } else if (dateObj < today) {
      setScheduleDateError("Past date is not allowed.");
    } else if (dateObj.getFullYear() > 2100) {
      setScheduleDateError("Year cannot exceed 2100.");
    } else {
      setScheduleDateError("");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-[90vw] sm:max-w-[80vw] md:max-w-[700px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto p-md sm:p-lg rounded-lg sm:rounded-xl bg-card border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Create Production Batch
            {isLoadingData && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:opacity-80 transition-opacity">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Finished Product */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Finished Product
              </label>
              <select
                value={finishedProduct}
                onChange={(e) => {
                  setFinishedProduct(e.target.value);
                  setFinishedProductError("");
                  setSelectedVariantId("");
                  setUserTargetYield("");
                  setTargetYieldError("");
                  setVariantError("");
                }}
                className={`w-full rounded-xl border ${
                  finishedProductError
                    ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                    : "border-border"
                } bg-card py-2.5 px-3 text-sm text-foreground`}
              >
                <option value="">Select product</option>
                {products.map((prod) => (
                  <option key={prod.productId} value={prod.productId}>
                    {prod.itemName}{prod.variant ? `, ${prod.variant}` : ""}
                  </option>
                ))}
              </select>
              {finishedProductError && (
                <p className="mt-1 text-xs text-destructive">{finishedProductError}</p>
              )}
            </div>

            {/* Variant */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Recipe/BOM
              </label>
              <select
                value={selectedVariantId}
                onChange={(e) => {
                  setSelectedVariantId(e.target.value);
                  setVariantError("");
                  setUserTargetYield("");
                  setTargetYieldError("");
                }}
                disabled={!finishedProduct}
                className={`w-full rounded-xl border ${
                  variantError
                    ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                    : "border-border"
                } bg-card py-2.5 px-3 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select recipe/BOM</option>
                {availableVariants.map((v) => (
                  <option key={v.recipeId} value={v.recipeId}>
                    {v.recipeName}
                  </option>
                ))}
              </select>
              {variantError && <p className="mt-1 text-xs text-destructive">{variantError}</p>}
            </div>

            {/* Editable Target Yield */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Target Yield ({yieldUnit || "pieces / units"})
              </label>
              <input
                type="number"
                min={1}
                value={userTargetYield}
                onChange={(e) => {
                  const val = e.target.value;
                  setUserTargetYield(val === "" ? "" : Number(val));
                  setTargetYieldError(
                    val === ""
                      ? "Target yield is required"
                      : Number(val) <= 0
                        ? "Target yield must be greater than 0"
                        : ""
                  );
                }}
                placeholder="Enter target yield"
                disabled={!selectedVariantId}
                className={`w-full rounded-xl border ${
                  targetYieldError
                    ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                    : "border-border"
                } bg-card py-2.5 px-3 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed`}
              />
              {targetYieldError && (
                <p className="mt-1 text-xs text-destructive">{targetYieldError}</p>
              )}
            </div>

            {/* Schedule Date */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Schedule Date
              </label>
              <input
                type="date"
                min={toLocalDateInput(new Date())}
                value={scheduleDate}
                max="2100-12-31"
                onChange={(e) => {
                  const val = e.target.value;
                  setScheduleDate(val);
                  validateScheduleDate(val);
                }}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className={`w-full rounded-xl border ${
                  scheduleDateError
                    ? "!border-destructive focus:!border-destructive focus:ring-1 focus:!ring-destructive"
                    : "border-border"
                } bg-card py-2.5 px-3 text-sm text-foreground`}
              />
              {scheduleDateError && (
                <p className="mt-1 text-xs text-destructive">{scheduleDateError}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Production Purpose
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full rounded-xl border border-border bg-card py-2.5 px-3 text-sm text-foreground"
              >
                {PURPOSE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Production Notes
              </label>
              <select
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-border bg-card py-2.5 px-3 text-sm text-foreground"
              >
                {NOTES_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as "Normal" | "Urgent")}
                className="w-full rounded-xl border border-border bg-card py-2.5 px-3 text-sm text-foreground"
              >
                <option value="Normal">Normal</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Ingredient Allocation */}
          {isComputing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Computing ingredients…
            </div>
          )}
          {!isComputing && ingredients.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <p className="text-sm text-foreground">
                  <strong>Ingredients / Bill of Materials</strong>
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-4 py-2">Ingredient Item</th>
                      <th className="px-4 py-2">Item Quantity</th>
                      <th className="px-4 py-2">Current Stock &amp; Unit</th>
                      <th className="px-4 py-2">Stock Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredients.map((ing) => {
                      const multiplier = batchMultiplierFor(userTargetYield);
                      const required = ing.requiredQty * multiplier;
                      const deficit = required - ing.availableStock;
                      const sufficient = deficit <= 0;
                      return (
                        <tr
                          key={ing.ingredientId}
                          className="border-t border-border"
                        >
                          <td className="px-4 py-2 text-foreground">
                            {ing.ingredientName}
                          </td>
                          <td className="px-4 py-2 font-medium text-foreground">
                            {required} {ing.uom}
                          </td>
                          <td className="px-4 py-2">
                            {ing.availableStock} {ing.uom}
                          </td>
                          <td className="px-4 py-2">
                            {sufficient ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <Check size={14} /> Sufficient
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-destructive">
                                <AlertTriangle size={14} /> Insufficient by {deficit.toFixed(2)}{" "}
                                {ing.uom}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {recipeTargetYield !== null && (
                <p className="ml-1 mt-3 text-xs text-muted-foreground">
                  Quantities shown are the Good For One recipe multiplied by the requested target yield.
                </p>
              )}

              {hasStockIssue && (
                <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                  <AlertTriangle size={14} /> Insufficient stock for one or more ingredients. Please
                  restock before creating this batch.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground bg-muted hover:opacity-80 transition-opacity"
          >
            Cancel
          </button>
          <button
            onClick={handleAddBatch}
            disabled={!isFormValid}
            className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            Add Batch
          </button>
        </div>
      </div>
    </div>
  );
}
