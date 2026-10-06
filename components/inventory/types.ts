export type InventoryItem = {
  inventoryId: number;
  itemId: number;
  itemName: string;
  categoryName: string;
  uomName: string;
  locationId: number;
  locationName: string;
  currentStock: number;
  reservedStock?: number;
  availableStock?: number;
  minStockLevel: number;
  maxStockLevel: number;
  isLowStock: boolean;
};
