export interface ConfigVariation {
  id: string;
  productId: number;
  sku: string;
  packagingType: string;
  size: string;
  price: number;
  isActive: boolean;
}

export interface ConfigProduct {
  id: string;
  productId: number;
  name: string;
  category: string;
  description: string;
  isActive: boolean;
  imageUrl?: string;
  variations: ConfigVariation[];
}

export interface LossItemDetail {
  itemName: string;
  lotNumber: string;
  quantity: number;
  uom: string;
  unitCost: number;
  totalCost: number;
}

export interface LossReport {
  lossId: string;
  batchId: number;
  batchNumber: string;
  productName: string;
  variant: string;
  targetYield: number;
  failureStage: string;
  date: string;
  rejectionReason: string;
  inspector: string;
  notes: string;
  totalEstimatedLoss: number;
  items: LossItemDetail[];
}

// ── NEW PRODUCTION SYSTEM ENTITIES ──────────────────────────────────────────

export interface RecipeIngredientDTO {
  ingredientId: number;
  itemId: number;
  itemName: string;
  itemCode: string;
  standardQuantity: number;
  uomId: number;
  uomAbbr: string;
}

export interface LotReservationDTO {
  reservationId: number;
  ingredientId: number;
  itemId: number;
  itemName: string;
  itemCode?: string;
  lotId: number;
  lotCode: string;
  reservedQuantity: number;
  isReleased: boolean;
  releasedAt: string | null;
  expiryDate: string | null;
  quantityRemaining: number;
}

export interface IssuanceScanDTO {
  scanId: number;
  ingredientId: number;
  itemId: number;
  lotId: number;
  lotCode: string;
  scannedAt: string | null;
  scannedBy: string;
  isVerified: boolean;
}

export interface MaterialIssuanceDTO {
  issuanceId: number;
  issuanceNumber: string;
  prodReqId: number;
  reqNumber: string;
  productName: string;
  productCode: string;
  sku: string;
  recipeName: string;
  requestQuantity: number;
  priority: string;
  issuedBy: string;
  issuedAt: string | null;
  status: "Pending" | "Scanning" | "Issued" | "Cancelled";
  reqStatus: string;
  scans: IssuanceScanDTO[];
  reservations: LotReservationDTO[];
}

export interface ProductionRequestEntity {
  prodReqId: number;
  reqNumber: string;
  productId: number;
  productName: string;
  productCode: string;
  sku: string;
  variant: string;
  recipeId: number;
  recipeName: string;
  recipeCode: string;
  recipeOutputQty: number;
  yieldUom: string;
  quantity: number;
  reason: string;
  priority: "Low" | "Medium" | "High" | "Normal" | "Priority" | string;
  requiredDate: string | null;
  requiredTime: string;
  requestedBy: string;
  status:
    | "Pending Approval"
    | "Approved"
    | "Rejected"
    | "Materials Issued"
    | "Ready for Production"
    | "In Production"
    | "In Progress"
    | "Completed";
  linkedPrId: number | null;
  linkedPrNumber: string | null;
  adminNotes: string;
  approvedBy: string;
  approvedAt: string | null;
  rejectedBy: string;
  rejectedAt: string | null;
  rejectionReason: string;
  createdAt: string | null;
  updatedAt: string | null;
  recipeIngredients: RecipeIngredientDTO[];
  reservations: LotReservationDTO[];
  issuances: MaterialIssuanceDTO[];
  batches: Array<{
    batchId: number;
    batchNumber: string;
    status: string;
    stage: string;
    currentStage: string;
    estimatedQuantity: number;
    actualQuantity: number;
    productionDate: string | null;
    startedAt: string | null;
    completedDate: string | null;
  }>;
}

export interface LotSuggestionItem {
  lotId: number;
  lotCode: string;
  quantityRemaining: number;
  reservedQuantity: number;
  availableQuantity: number;
  suggestedQuantity: number;
  expiryDate: string | null;
  receivedDate: string | null;
  status: string;
}

export interface IngredientLotSuggestion {
  ingredientId: number;
  itemId: number;
  itemName: string;
  itemCode: string;
  uomId: number;
  uomAbbr: string;
  standardQuantity: number;
  requiredQuantity: number;
  totalAvailable: number;
  shortfallQuantity: number;
  hasShortfall: boolean;
  lots: LotSuggestionItem[];
}

export interface LotSuggestionsResponse {
  recipeId: number;
  recipeName: string;
  quantity: number;
  multiplier: number;
  hasAnyShortfall: boolean;
  ingredients: IngredientLotSuggestion[];
}

export interface BatchConsumptionDTO {
  consumptionId: number;
  itemId: number;
  itemName: string;
  requiredQuantity: number;
  quantityUsed: number;
  uomId: number | null;
  uomAbbr: string;
  lotId: number | null;
  lotCode: string;
  unitCost: number;
}

export interface ProductionBatchEntity {
  batchId: number;
  batchNumber: string;
  prodReqId: number | null;
  reqNumber: string;
  productId: number;
  productName: string;
  productCode: string;
  variant: string;
  sku: string;
  recipeId: number;
  recipeName: string;
  recipeCode: string;
  yieldUom: string;
  batchMultiplier: number;
  estimatedQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  scrapReason: string;
  productionDate: string | null;
  startedAt: string | null;
  completedDate: string | null;
  packagedAt: string | null;
  packagedBy: string;
  expiryDate: string | null;
  stage: string;
  currentStage: string;
  qualityStatus: string;
  rejectionReason: string;
  notes: string;
  purpose: string;
  status: string;
  assignedCook: string;
  fgLotId: number | null;
  totalMaterialCost: number;
  unitCost: number;
  yieldPercentage: number;
  consumptions: BatchConsumptionDTO[];
}

// ── LEGACY COMPATIBILITY TYPES ──────────────────────────────────────────────

export interface FinishedProductItem {
  productId: number;
  itemId: number;
  itemName: string;
  sellingPrice: number;
  sku: string;
  variant: string;
  imageUrl?: string;
}

export interface ProductionBatchItem {
  batchId: number;
  batchNumber: string;
  recipeId: number;
  recipeName: string;
  productId: number;
  productName: string;
  variant: string;
  purpose: string;
  batchMultiplier: number;
  estimatedQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  scrapReason?: string;
  fgLotId?: number;
  productionDate: string;
  stage: string;
  status: string;
  assignedCook: string;
  qualityStatus: string;
  rejectionReason: string;
  imageUrl: string;
  notes: string;
}

export interface MaterialRequestItem {
  ingredientId: number;
  itemId: number;
  itemName: string;
  supplierName: string;
  requiredQty: number;
  uom: string;
  availableStock: number;
  isShortfall: boolean;
  suggestedLot: string;
  suggestedExpiry: string;
  isScanned: boolean;
  shortfallRequested?: boolean;
  linkedPrNumber?: string;
  scannedLot?: string;
  scannedAt?: string;
}

export interface MaterialRequest {
  mrId: string;
  batchId: number;
  batchNumber: string;
  productName: string;
  recipeId: number;
  recipeName: string;
  neededDate: string;
  status: "Pending" | "Ready to Issue" | "Issued";
  items: MaterialRequestItem[];
  submittedBy: string;
  submittedAt: string;
  issuedAt?: string;
  issuedBy?: string;
}

export interface ProductionStageLog {
  stageName: "Peeling" | "Steaming" | "Mixing" | "Grind" | "Cooking" | "Cooling";
  inCharge: string;
  timestamp: string;
  photoUrl: string;
  notes?: string;
  completed: boolean;
}

export interface QAChecklist {
  overallAppearance: "Pass" | "Fail";
  aroma: "Pass" | "Fail";
  texture: "Pass" | "Fail";
  tasteTest: "Pass" | "Fail";
  consistency: "Pass" | "Fail";
  inspector: string;
  notes: string;
  photoUrl?: string;
  decision: "Approved" | "Rejected";
  decisionDate: string;
  rejectionReason?: string;
}

export interface PackagingMaterialItem {
  name: string;
  required: number;
  available: number;
  shortfall: boolean;
}

export interface PackagingData {
  batchNumber: string;
  productName: string;
  packagingSize: string;
  bulkAvailable: string;
  targetOutput: number;
  materials: PackagingMaterialItem[];
  goodQty: number;
  damagedQty: number;
  wasteQty: number;
  fgLotNumber: string;
  expiryDate: string;
  packagerName: string;
  photoUrl?: string;
  completed: boolean;
}

export interface ProductionSummaryReport {
  batchNumber: string;
  productName: string;
  variant: string;
  targetYield: number;
  actualGoodOutput: number;
  purpose: string;
  createdAt: string;
  approvedBy: string;
  completedAt: string;
  materialsUsed: {
    itemName: string;
    supplierName: string;
    lotNumber: string;
    quantity: number;
    uom: string;
    expiryDate: string;
  }[];
  stageLogs: ProductionStageLog[];
  qaResults: QAChecklist;
  packaging: {
    packagingSize: string;
    goodQty: number;
    damagedQty: number;
    wasteQty: number;
    fgLotNumber: string;
    expiryDate: string;
    packagerName: string;
    photoUrl?: string;
  };
}

export interface ProductionRequest {
  batchId: number;
  batchNumber: string;
  productId: number;
  productName: string;
  variant: string;
  batchSize: number;
  targetYield: number;
  yieldUnit: string;
  purpose: string;
  notes?: string;
  priority?: "Normal" | "Urgent";
  status:
    | "Draft"
    | "Pending Approval"
    | "Approved"
    | "In Progress"
    | "Passed QA"
    | "Rejected"
    | "Cancelled"
    | "Completed"
    | "Inventory Added";
  stage: string;
  scheduleDate: string;
  rejectionReason?: string;
  recipeId?: number;
  recipeName?: string;
  batchMultiplier?: number;
  actualQuantity?: number;
  scrapQuantity?: number;
  scrapReason?: string;
  fgLotId?: number;
  assignedCook?: string;
  imageUrl?: string;
  qualityStatus?: string;
  createdAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  startedAt?: string;
  completedAt?: string;
  materialRequest?: MaterialRequest;
  stageLogs?: ProductionStageLog[];
  qaChecklist?: QAChecklist;
  packagingData?: PackagingData;
  summaryReport?: ProductionSummaryReport;
}
