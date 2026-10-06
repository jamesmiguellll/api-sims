"use client";

import React, { useState } from "react";
import { MoreHorizontal, Pencil } from "lucide-react";
import { Recipe } from "./types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface RecipeTableProps {
  recipes: Recipe[];
  currentPage: number;
  pageSize: number;
  onEdit: (recipe: Recipe) => void;
}

export default function RecipeTable({ recipes, currentPage, pageSize, onEdit }: RecipeTableProps) {
  const [activeDropdownId, setActiveDropdownId] = useState<number | null>(null);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[700px]">
        <thead className="border-b border-border bg-muted/30">
          <tr className="text-left text-xs uppercase text-muted-foreground">
            <th className="px-5 py-4">No.</th>
            <th className="px-5 py-4">Recipe Name</th>
            <th className="px-5 py-4">Finished Product</th>
            <th className="px-5 py-4">Batch Size</th>
            <th className="px-5 py-4">Status</th>
            <th className="px-5 py-4 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {recipes.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
                No Results Found
              </td>
            </tr>
          ) : (
            recipes.map((recipe, index) => (
              <tr key={recipe.recipeId} className="hover:bg-muted/30 transition-colors">
                <td className="px-5 py-4 text-sm text-muted-foreground">
                  {index + 1 + (currentPage - 1) * pageSize}
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-foreground">
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <span className="cursor-default whitespace-nowrap">
                        {recipe.recipeName}
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72">
                      <div className="space-y-1.5">
                        <p className="text-xs font-bold text-foreground">{recipe.recipeName}</p>
                        {recipe.recipeCode && (
                          <p className="text-xs font-mono text-muted-foreground">No: {recipe.recipeCode}</p>
                        )}
                        {recipe.finishedProduct && (
                          <p className="text-xs text-muted-foreground">Product: {recipe.finishedProduct}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Batch Size: {recipe.outputQuantity ? `${recipe.outputQuantity} pcs` : recipe.yieldLabel || "100 pcs"}
                        </p>
                        {recipe.notes && (
                          <p className="text-xs text-muted-foreground">Notes: {recipe.notes}</p>
                        )}
                        <div className="pt-1">
                          <StatusBadge status={recipe.isActive ? "Active" : "Inactive"} />
                        </div>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </td>
                <td className="px-5 py-4 text-sm text-muted-foreground">{recipe.finishedProduct || "N/A"}</td>
                <td className="px-5 py-4 text-sm text-muted-foreground">
                  {recipe.outputQuantity ? `${recipe.outputQuantity} pcs` : recipe.yieldLabel || "100 pcs"}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={recipe.isActive ? "Active" : "Inactive"} />
                </td>
                <td className="px-5 py-4 text-center relative">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDropdownId(activeDropdownId === recipe.recipeId ? null : recipe.recipeId)
                    }
                    className="p-1.5 rounded-lg text-foreground hover:bg-muted transition-colors focus:outline-none"
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  {activeDropdownId === recipe.recipeId && (
                    <div className="absolute right-10 top-2 z-[100] w-32 rounded-xl border border-border bg-card shadow-xl py-1.5 text-left">
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(recipe);
                          setActiveDropdownId(null);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil size={14} className="shrink-0" /> Edit Recipe
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
