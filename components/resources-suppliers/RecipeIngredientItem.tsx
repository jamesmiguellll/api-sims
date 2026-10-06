"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { SupplyItem, Ingredient } from "./types";

interface RecipeIngredientItemProps {
  ingredient: Ingredient;
  index: number;
  canRemove: boolean;
  baseSupplies: SupplyItem[];
  excludedItemIds?: number[];
  error?: string;
  onRemove: (id: number) => void;
  onItemChange: (id: number, itemId: number, uomId: number) => void;
  onQuantityChange: (id: number, quantity: string) => void;
}

export default function RecipeIngredientItem({
  ingredient,
  canRemove,
  baseSupplies,
  excludedItemIds = [],
  error,
  onRemove,
  onItemChange,
  onQuantityChange,
}: RecipeIngredientItemProps) {
  const selectedSupply = baseSupplies.find((s) => s.itemId === ingredient.itemId);
  const uomDisplay = selectedSupply?.uomName || "-";

  // Filter out items already selected in other rows to prevent duplicates
  const availableSupplies = baseSupplies.filter(
    (s) => s.itemId === ingredient.itemId || !excludedItemIds.includes(s.itemId)
  );

  return (
    <div className="rounded-xl border border-border p-3 bg-card/60 transition-colors">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 items-end">
        {/* Item Selector */}
        <div className="sm:col-span-6">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Item <span className="text-destructive">*</span>
          </label>
          <select
            value={ingredient.itemId || ""}
            onChange={(e) => {
              const newId = Number(e.target.value);
              const supply = baseSupplies.find((s) => s.itemId === newId);
              onItemChange(ingredient.id, newId, supply?.uomId || 0);
            }}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-ring outline-none"
          >
            <option value="" disabled>
              Select item
            </option>
            {availableSupplies.map((supply) => (
              <option key={supply.itemId} value={supply.itemId}>
                {supply.itemName}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity Input */}
        <div className="sm:col-span-3">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Quantity <span className="text-destructive">*</span>
          </label>
          <Input
            type="number"
            min={0.001}
            step="any"
            placeholder="e.g. 5"
            value={ingredient.quantity}
            aria-invalid={!!error}
            style={error ? { borderColor: "var(--destructive)" } : undefined}
            onKeyDown={(e) => {
              if (["-", "+", "e", "E"].includes(e.key)) {
                e.preventDefault();
              }
            }}
            onChange={(e) => {
              const val = e.target.value;
              if (val.length <= 50) {
                onQuantityChange(ingredient.id, val);
              }
            }}
            className={`w-full rounded-lg border ${
              error ? "!border-destructive focus-visible:!ring-destructive" : "border-border"
            } bg-card px-3 py-2 text-xs text-foreground`}
          />
        </div>

        {/* Read-Only Unit */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Unit</label>
          <input
            type="text"
            readOnly
            disabled
            value={uomDisplay}
            className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground cursor-not-allowed select-none"
          />
        </div>

        {/* Remove Button */}
        <div className="sm:col-span-1 flex justify-center pb-0.5">
          {canRemove ? (
            <button
              type="button"
              onClick={() => onRemove(ingredient.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-lg font-semibold leading-none transition-colors"
              title="Remove item"
              aria-label="Remove item"
            >
              ×
            </button>
          ) : (
            <div className="w-8" />
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}
