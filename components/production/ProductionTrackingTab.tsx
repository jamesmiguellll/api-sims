"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronRight,
  QrCode,
  RefreshCw,
  Search,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ProductionRequest,
  MaterialRequest,
  MaterialRequestItem,
  ProductionStageLog,
  QAChecklist,
  PackagingData,
} from "./types";
import QrScannerModal from "./QrScannerModal";
import { CreatePRModal } from "@/components/orders-procurement/pr/CreatePRForm";
import { PurchaseRequisition, PRItem } from "@/components/orders-procurement/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import api from "@/lib/api";
import { toast } from "sonner";
import { HR_EMPLOYEES } from "@/lib/employees";
import { useAuth } from "@/context/AuthContext";

interface ProductionTrackingTabProps {
  initialSelectedBatchId?: number | null;
  isInventoryManager: boolean;
  isHeadCook: boolean;
  onNavigateToRequest?: () => void;
}

interface BomIngredient {
  itemId: number;
  itemName: string;
  supplierName: string;
  standardQty: number;
  uom: string;
  stock: number;
  suggestedLot: string;
  expiry: string;
}

interface BomOption {
  recipeId: number;
  recipeName: string;
  productId: number;
  outputYield: number;
  ingredients: BomIngredient[];
}

const DEFAULT_BOMS: BomOption[] = [
  {
    recipeId: 1,
    recipeName: "Standard Ube Halaya Formula A (Classic)",
    productId: 1,
    outputYield: 1,
    ingredients: [
      { itemId: 101, itemName: "Fresh Purple Yam (Ube)", supplierName: "Highland Agri Corp", standardQty: 0.3, uom: "KG", stock: 150, suggestedLot: "LOT-UB-2026-088", expiry: "2026-10-15" },
      { itemId: 102, itemName: "Condensed Milk (Sweetened)", supplierName: "Dairy Gold Co", standardQty: 0.15, uom: "Cans", stock: 80, suggestedLot: "LOT-CM-2026-012", expiry: "2027-03-20" },
      { itemId: 103, itemName: "Evaporated Milk", supplierName: "Dairy Gold Co", standardQty: 0.1, uom: "Cans", stock: 65, suggestedLot: "LOT-EM-2026-004", expiry: "2027-02-14" },
      { itemId: 104, itemName: "Pure Dairy Butter (Unsalted)", supplierName: "Creamery Phil", standardQty: 0.05, uom: "KG", stock: 25, suggestedLot: "LOT-DB-2026-091", expiry: "2026-11-30" },
      { itemId: 105, itemName: "Refined Cane Sugar", supplierName: "SweetLife Sugar", standardQty: 0.08, uom: "KG", stock: 90, suggestedLot: "LOT-SG-2026-033", expiry: "2027-08-10" },
    ],
  },
  {
    recipeId: 2,
    recipeName: "Special Ube Halaya with Cheese Formula B",
    productId: 1,
    outputYield: 1,
    ingredients: [
      { itemId: 101, itemName: "Fresh Purple Yam (Ube)", supplierName: "Highland Agri Corp", standardQty: 0.36, uom: "KG", stock: 150, suggestedLot: "LOT-UB-2026-088", expiry: "2026-10-15" },
      { itemId: 106, itemName: "Aged Cheddar Cheese (Block)", supplierName: "Dairy Gold Co", standardQty: 0.08, uom: "KG", stock: 2, suggestedLot: "LOT-CH-2026-009", expiry: "2026-10-05" }, // Simulated shortfall
      { itemId: 102, itemName: "Condensed Milk (Sweetened)", supplierName: "Dairy Gold Co", standardQty: 0.2, uom: "Cans", stock: 80, suggestedLot: "LOT-CM-2026-012", expiry: "2027-03-20" },
      { itemId: 104, itemName: "Pure Dairy Butter (Unsalted)", supplierName: "Creamery Phil", standardQty: 0.06, uom: "KG", stock: 25, suggestedLot: "LOT-DB-2026-091", expiry: "2026-11-30" },
    ],
  },
];

const PREP_STAGES = ["Peeling", "Steaming", "Mixing", "Grind", "Cooking", "Cooling"] as const;

// Storage keys for coordinating tracking steps across clients
const MR_STORAGE_KEY = "production_material_requests_v3";
const STAGE_LOGS_KEY = "production_stage_logs_v3";
const PACKAGING_STORAGE_KEY = "production_packaging_data_v3";

const formatLocalDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

export default function ProductionTrackingTab({
  initialSelectedBatchId,
  isInventoryManager,
  isHeadCook,
}: ProductionTrackingTabProps) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ProductionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [boms, setBoms] = useState<BomOption[]>(DEFAULT_BOMS);
  const [activeStepTab, setActiveStepTab] = useState<number | null>(null);

  // Material requests stored locally for coordinating Step 2, 3, 4
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);

  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(() => {
    if (initialSelectedBatchId) return initialSelectedBatchId;
    return null;
  });

  useEffect(() => {
    if (initialSelectedBatchId) {
      setSelectedBatchId(initialSelectedBatchId);
      setActiveStepTab(null);
    }
  }, [initialSelectedBatchId]);

  // Inventory Manager Tabs: Material Request and Material Issued
  const [invMainTab, setInvMainTab] = useState<"requests" | "issued">("requests");
  const [mrSearchQuery, setMrSearchQuery] = useState("");
  const [mrStockFilter, setMrStockFilter] = useState("All");
  const [selectedMRId, setSelectedMRId] = useState<string | null>(null);
  const [isIssuanceMode, setIsIssuanceMode] = useState(false);

  // Step 2: BOM Selection & MR State
  const [selectedBomId, setSelectedBomId] = useState<number>(DEFAULT_BOMS[0].recipeId);
  const [neededDate, setNeededDate] = useState(
    new Date(Date.now() + 86400000).toISOString().split("T")[0]
  );

  // QR Scanner State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanningItem, setScanningItem] = useState<MaterialRequestItem | null>(null);

  // Shortfall PR Modal State
  const [isPROpen, setIsPROpen] = useState(false);
  const [requestingShortfallItemId, setRequestingShortfallItemId] = useState<number | null>(null);

  // Step 5: Cooking Stages Input State
  const [stageInCharge, setStageInCharge] = useState(isHeadCook ? "Head Cook" : "Elena Reyes");
  const [stagePhotoFile, setStagePhotoFile] = useState<File | null>(null);
  const [stagePhoto, setStagePhoto] = useState<string>("");
  const [stageNotes, setStageNotes] = useState("");
  const stageFileInputRef = useRef<HTMLInputElement>(null);

  // Step 6: QA Form State
  const [qaAppearance, setQaAppearance] = useState<boolean>(true);
  const [qaAroma, setQaAroma] = useState<boolean>(true);
  const [qaTexture, setQaTexture] = useState<boolean>(true);
  const [qaTaste, setQaTaste] = useState<boolean>(true);
  const [qaConsistency, setQaConsistency] = useState<boolean>(true);
  const [qaInspector, setQaInspector] = useState(isHeadCook ? "Head Cook" : "Inventory Manager");
  const [qaNotes, setQaNotes] = useState("");
  const [qaRejectReason, setQaRejectReason] = useState("");
  const [showRejectPrompt, setShowRejectPrompt] = useState(false);

  // Step 7: Packaging Form State
  const [goodOutput, setGoodOutput] = useState<number | "">("");
  const [damagedOutput, setDamagedOutput] = useState<number | "">(0);
  const [wasteOutput, setWasteOutput] = useState<number | "">(0);
  const [packagerName, setPackagerName] = useState("Elena Reyes");
  const [expiryDate, setExpiryDate] = useState(
    new Date(Date.now() + 86400000 * 90).toISOString().split("T")[0]
  );
  const [packagingPhotoFile, setPackagingPhotoFile] = useState<File | null>(null);
  const [packagingPhoto, setPackagingPhoto] = useState<string>("");
  const packagingFileInputRef = useRef<HTMLInputElement>(null);

  // Load Material Requests from storage
  const loadMaterialRequests = () => {
    try {
      const data = localStorage.getItem(MR_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch {}
    return [];
  };

  const saveMaterialRequests = (mrs: MaterialRequest[]) => {
    setMaterialRequests(mrs);
    try {
      localStorage.setItem(MR_STORAGE_KEY, JSON.stringify(mrs));
    } catch (e) {
      console.error(e);
    }
  };

  // Stage logs storage
  const getStageLogs = (batchId: number): ProductionStageLog[] => {
    try {
      const data = localStorage.getItem(`${STAGE_LOGS_KEY}_${batchId}`);
      if (data) return JSON.parse(data);
    } catch {}
    return [];
  };

  const saveStageLogs = (batchId: number, logs: ProductionStageLog[]) => {
    try {
      localStorage.setItem(`${STAGE_LOGS_KEY}_${batchId}`, JSON.stringify(logs));
    } catch (e) {
      console.error(e);
    }
  };

  // Packaging data storage
  const getPackagingData = (batchId: number): PackagingData | undefined => {
    try {
      const data = localStorage.getItem(`${PACKAGING_STORAGE_KEY}_${batchId}`);
      if (data) return JSON.parse(data);
    } catch {}
    return undefined;
  };

  const savePackagingData = (batchId: number, data: PackagingData) => {
    try {
      localStorage.setItem(`${PACKAGING_STORAGE_KEY}_${batchId}`, JSON.stringify(data));
    } catch (e) {
      console.error(e);
    }
  };

  const mapStatus = (statusStr: string): ProductionRequest["status"] => {
    const s = (statusStr || "").toLowerCase().trim();
    if (s === "scheduled") return "Pending Approval";
    if (s === "approved") return "Approved";
    if (s === "in progress" || s === "inprogress") return "In Progress";
    if (s === "passed qa" || s === "passedqa") return "Passed QA";
    if (s === "completed") return "Completed";
    if (s === "inventory added" || s === "inventoryadded") return "Completed";
    if (s === "rejected") return "Rejected";
    if (s === "cancelled") return "Cancelled";
    return "Pending Approval";
  };

  // Fetch batches & BOMs from API
  const fetchData = async () => {
    try {
      setLoading(true);
      const [batchesRes, recipesRes, itemsRes] = await Promise.all([
        api.get("/api/ProductionBatches"),
        api.get("/api/recipes"),
        api.get("/api/Items"),
      ]);

      const storedMRs = loadMaterialRequests();
      setMaterialRequests(storedMRs);

      const rawBatches = batchesRes.data || [];
      const mappedBatches: ProductionRequest[] = rawBatches.map((b: any) => {
        const mr = storedMRs.find((m: MaterialRequest) => m.batchId === b.batchId);
        const stageLogs = getStageLogs(b.batchId);
        const pkgData = getPackagingData(b.batchId);

        return {
          batchId: b.batchId,
          batchNumber: b.batchNumber,
          productId: b.productId,
          productName: b.productName,
          variant: b.variant,
          targetYield: b.estimatedQuantity,
          yieldUnit: "PCS",
          purpose: b.purpose || b.notes || "",
          status: mapStatus(b.status),
          stage: b.stage,
          scheduleDate: b.productionDate,
          rejectionReason: b.rejectionReason,
          recipeId: b.recipeId,
          recipeName: b.recipeName,
          batchMultiplier: b.batchMultiplier,
          actualQuantity: b.actualQuantity,
          scrapQuantity: b.scrapQuantity,
          scrapReason: b.scrapReason,
          fgLotId: b.fgLotId,
          assignedCook: b.assignedCook,
          imageUrl: b.imageUrl,
          qualityStatus: b.qualityStatus,
          materialRequest: mr,
          stageLogs: stageLogs.length > 0 ? stageLogs : undefined,
          packagingData: pkgData,
        };
      });

      setRequests(mappedBatches);

      // Handle BOM options from API
      const rawRecipes = recipesRes.data?.data || recipesRes.data || [];
      if (rawRecipes.length > 0) {
        const itemsList = itemsRes.data?.data?.items || itemsRes.data?.data || [];
        const mappedBoms: BomOption[] = rawRecipes.map((r: any) => ({
          recipeId: r.recipeId,
          recipeName: r.recipeName,
          productId: r.productId,
          outputYield: Number(r.outputQuantity) || 100,
          ingredients: (r.ingredients || []).map((ing: any) => {
            const item = itemsList.find((i: any) => i.itemId === ing.itemId);
            return {
              itemId: ing.itemId,
              itemName: item?.itemName || `Ingredient #${ing.itemId}`,
              supplierName: "Registered Supplier",
              standardQty: Number(ing.standardQuantity) || 5,
              uom: item?.uomName || "KG",
              stock: item?.currentStock ?? 100,
              suggestedLot: `LOT-ING-${ing.itemId}-2026`,
              expiry: new Date(Date.now() + 180 * 86400000).toISOString().split("T")[0],
            };
          }),
        }));

        // Merge with defaults if recipes have empty ingredients
        const finalBoms = mappedBoms.map((b) =>
          b.ingredients.length > 0 ? b : DEFAULT_BOMS[0]
        );
        setBoms(finalBoms.length > 0 ? finalBoms : DEFAULT_BOMS);
      }

      // Auto-select batch
      if (!selectedBatchId && mappedBatches.length > 0) {
        const firstActive = mappedBatches.find(
          (b) => b.status === "In Progress" || b.status === "Approved"
        );
        setSelectedBatchId(firstActive ? firstActive.batchId : mappedBatches[0].batchId);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load tracking data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedBatch = requests.find((r) => r.batchId === selectedBatchId);

  const selectedBom =
    boms.find((b) => b.recipeId === (selectedBatch?.recipeId ?? selectedBomId)) ||
    boms[0] || DEFAULT_BOMS[0];

  // Calculate current waterfall step (1 to 8)
  const getBatchStep = (batch?: ProductionRequest): number => {
    if (!batch) return 1;
    if (batch.status === "Completed") return 8;
    if (batch.stage === "Stock In") return 8;
    if (batch.stage === "Packaging") return 7;
    if (
      batch.status === "Passed QA" ||
      batch.stage === "Quality Control" ||
      batch.stage === "QA Review" ||
      batch.stage === "QA"
    )
      return 6;

    // Check material request for this batch
    const mr =
      materialRequests.find((m) => m.batchId === batch.batchId) ||
      batch.materialRequest;

    const isActivelyCooking =
      (PREP_STAGES as readonly string[]).includes(batch.stage) &&
      batch.stage !== "Preparation";

    if (isActivelyCooking) return 5;
    if (mr?.status === "Issued") return 4;
    if (mr?.status === "Ready to Issue" || mr?.status === "Pending") return 3;
    if (mr) return 2;

    // By default, newly approved batches start at Step 1 (Request Info & Authorization)
    return 1;
  };

  const calculatedStep = getBatchStep(selectedBatch);
  const currentStep = activeStepTab ?? calculatedStep;

  // Active material request for currently selected batch
  const activeMR =
    materialRequests.find((m) => m.batchId === selectedBatch?.batchId) ||
    selectedBatch?.materialRequest;

  const prInitialData = useMemo<PurchaseRequisition | undefined>(() => {
    if (!activeMR) return undefined;
    const shortfallItems = activeMR.items.filter((item) => item.isShortfall);
    if (shortfallItems.length === 0) return undefined;

    return {
      prId: 0,
      prNumber: "",
      department: "Production",
      requestedBy: activeMR.submittedBy,
      requestDate: new Date().toISOString(),
      requiredDate: activeMR.neededDate,
      status: "Draft",
      requestType: "Production Shortfall",
      priority: selectedBatch?.priority || "Normal",
      purpose: `Material shortfall for ${activeMR.batchNumber}`,
      notes: `Generated from Material Request ${activeMR.mrId}.`,
      items: shortfallItems.map((item) => ({
        itemId: item.itemId,
        itemCode: "",
        itemName: item.itemName,
        uomName: item.uom,
        actualInventory: item.availableStock,
        requestedQuantity: Math.max(0, item.requiredQty - item.availableStock),
      })),
    };
  }, [activeMR, selectedBatch?.priority]);

  // Trackable batches (Approved, In Progress, Passed QA, Completed)
  const allTrackableBatches = requests.filter(
    (r) =>
      r.status === "In Progress" ||
      r.status === "Approved" ||
      r.status === "Passed QA" ||
      (r.status === "Completed" && r.stage !== "Completed")
  );

  const preProdBatches = allTrackableBatches.filter((b) => getBatchStep(b) < 5);
  const activeCookingBatches = allTrackableBatches.filter((b) => getBatchStep(b) === 5);
  const qaAndBeyondBatches = allTrackableBatches.filter((b) => getBatchStep(b) > 5);

  const [trackingFilter, setTrackingFilter] = useState<"all" | "pre-prod" | "cooking" | "qa">("all");

  const filteredDisplayBatches =
    trackingFilter === "pre-prod"
      ? preProdBatches
      : trackingFilter === "cooking"
      ? activeCookingBatches
      : trackingFilter === "qa"
      ? qaAndBeyondBatches
      : allTrackableBatches;

  // Submit Material Request (Step 2 -> Step 3)
  const handleSubmitMR = () => {
    if (!selectedBatch) return;

    const multiplier = selectedBatch.targetYield;
    const items: MaterialRequestItem[] = selectedBom.ingredients.map((ing, idx) => {
      const required = Math.round(ing.standardQty * multiplier * 1000) / 1000;
      const isShortfall = ing.stock < required;
      return {
        ingredientId: idx + 1,
        itemId: ing.itemId,
        itemName: ing.itemName,
        supplierName: ing.supplierName,
        requiredQty: required,
        uom: ing.uom,
        availableStock: ing.stock,
        isShortfall,
        suggestedLot: ing.suggestedLot,
        suggestedExpiry: ing.expiry,
        isScanned: false,
      };
    });

    const newMR: MaterialRequest = {
      mrId: `MR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
      batchId: selectedBatch.batchId,
      batchNumber: selectedBatch.batchNumber,
      productName: selectedBatch.productName,
      recipeId: selectedBom.recipeId,
      recipeName: selectedBom.recipeName,
      neededDate,
      status: "Pending",
      items,
      submittedBy: isHeadCook ? "Head Cook" : "Elena Reyes",
      submittedAt: new Date().toISOString(),
    };

    const updated = [newMR, ...materialRequests.filter((m) => m.batchId !== selectedBatch.batchId)];
    saveMaterialRequests(updated);

    toast.success(`Material Request (${newMR.mrId}) submitted to Inventory Manager!`);
    setActiveStepTab(3);
    fetchData();
  };

  // QR Scan trigger
  const handleOpenScan = (item: MaterialRequestItem) => {
    setScanningItem(item);
    setScannerOpen(true);
  };

  const handleScanSuccess = (scannedLot: string) => {
    if (!scanningItem) return;
    const mrId = selectedBatch?.materialRequest?.mrId || selectedMRId;
    if (!mrId) return;

    const mr = materialRequests.find((m) => m.mrId === mrId);
    if (!mr) return;

    const cleanedScanned = scannedLot.trim().toUpperCase();
    const targetLot = scanningItem.suggestedLot.trim().toUpperCase();

    // Verify lot match
    if (cleanedScanned !== targetLot && !cleanedScanned.includes(targetLot)) {
      toast.error(`Scanned lot (${cleanedScanned}) does not match suggested lot (${targetLot})!`);
      return;
    }

    const updatedItems = mr.items.map((i) =>
      i.itemId === scanningItem.itemId
        ? { ...i, isScanned: true, scannedLot: cleanedScanned, scannedAt: new Date().toISOString() }
        : i
    );

    const allDone = updatedItems.every((i) => i.isScanned);
    const updatedMR: MaterialRequest = {
      ...mr,
      items: updatedItems,
      status: allDone ? "Ready to Issue" : "Pending",
    };

    const updatedList = materialRequests.map((m) => (m.mrId === mrId ? updatedMR : m));
    saveMaterialRequests(updatedList);

    toast.success(`Verified Lot: ${cleanedScanned} ✓`);
    setScannerOpen(false);
    setScanningItem(null);
    fetchData();
  };

  // Issue Materials to Production (Calls Backend PUT /api/ProductionBatches/{id}/stage with Preparation)
  const handleIssueMaterials = async (mrId: string) => {
    const targetMR = materialRequests.find((m) => m.mrId === mrId);
    if (!targetMR) return;

    const allScanned = targetMR.items.every((i) => i.isScanned);
    if (!allScanned) {
      toast.error("All ingredients must be scanned and verified before issuance!");
      return;
    }

    try {
      toast.loading("Issuing materials and deducting stock (FEFO)...", { id: "issue-mat" });

      // Call backend stage: "Preparation" which runs FEFO deduction
      await api.put(`/api/ProductionBatches/${targetMR.batchId}/stage`, {
        stage: "Preparation",
      });

      const updatedMR: MaterialRequest = {
        ...targetMR,
        status: "Issued",
        issuedAt: new Date().toISOString(),
        issuedBy: "Inventory Manager",
      };

      const updatedList = materialRequests.map((m) => (m.mrId === mrId ? updatedMR : m));
      saveMaterialRequests(updatedList);

      toast.success("Materials issued to production via FEFO! Stage updated to Preparation.", {
        id: "issue-mat",
      });
      setSelectedMRId(null);
      setIsIssuanceMode(false);
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to issue materials", { id: "issue-mat" });
    }
  };

  const handleRequestShortfall = async (mr: MaterialRequest, item: MaterialRequestItem) => {
    const shortfallQuantity = Math.max(0, item.requiredQty - item.availableStock);
    if (shortfallQuantity <= 0 || item.shortfallRequested) return;

    const requestedBy = user?.firstName
      ? `${user.firstName} ${user.lastName || ""}`.trim()
      : user?.username || "Inventory Manager";
    const linkedBatch = requests.find((request) => request.batchId === mr.batchId);

    try {
      setRequestingShortfallItemId(item.itemId);
      const response = await api.post("/api/purchase-requisitions", {
        requestedBy,
        department: user?.roles?.some((role) => role.toLowerCase().includes("cook"))
          ? "Production"
          : "Inventory",
        requiredDate: `${mr.neededDate}T00:00:00Z`,
        requestType: "Production Shortfall",
        priority: linkedBatch?.priority === "Urgent" ? "Urgent" : "Normal",
        purpose: `Production shortfall for ${mr.batchNumber} - ${item.itemName}`,
        notes: `Automatically generated from Material Request ${mr.mrId}.`,
        submitForApproval: true,
        items: [{ itemId: item.itemId, requestedQuantity: shortfallQuantity }],
      });

      const created = response.data?.data;
      saveMaterialRequests(materialRequests.map((request) =>
        request.mrId === mr.mrId
          ? {
              ...request,
              items: request.items.map((requestItem) =>
                requestItem.itemId === item.itemId
                  ? { ...requestItem, shortfallRequested: true, linkedPrNumber: created?.prNumber }
                  : requestItem
              ),
            }
          : request
      ));
      toast.success(`Purchase Requisition ${created?.prNumber || "created"} for ${item.itemName}.`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to create the shortfall request.");
    } finally {
      setRequestingShortfallItemId(null);
    }
  };

  // Complete Cooking Stage (Step 5)
  const handleCompleteCurrentStage = async (stageName: typeof PREP_STAGES[number]) => {
    if (!selectedBatch) return;
    if (!stageInCharge.trim()) {
      toast.error("Please specify the operator in-charge.");
      return;
    }

    try {
      toast.loading(`Advancing to next stage...`, { id: "stage-advance" });

      // If photo was selected, upload to backend
      let uploadedUrl = stagePhoto;
      if (stagePhotoFile) {
        const formData = new FormData();
        formData.append("file", stagePhotoFile);
        const imgRes = await api.post(`/api/ProductionBatches/${selectedBatch.batchId}/images`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploadedUrl = imgRes.data?.imageUrl || uploadedUrl;
      }

      // Next stage index
      const currIdx = PREP_STAGES.indexOf(stageName);
      const nextStage = currIdx < PREP_STAGES.length - 1 ? PREP_STAGES[currIdx + 1] : "Quality Control";

      // Map stage to backend compatible value ("Grind" -> "Mixing and Processing")
      const backendStageName = nextStage === "Grind" ? "Mixing and Processing" : nextStage;

      await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/stage`, {
        stage: backendStageName,
      });

      // Save log entry
      const existingLogs = getStageLogs(selectedBatch.batchId);
      const newLog: ProductionStageLog = {
        stageName,
        inCharge: stageInCharge.trim(),
        timestamp: new Date().toLocaleTimeString(),
        photoUrl: uploadedUrl,
        notes: stageNotes.trim(),
        completed: true,
      };

      saveStageLogs(selectedBatch.batchId, [...existingLogs, newLog]);

      toast.success(`Completed stage: ${stageName}`, { id: "stage-advance" });
      setStagePhotoFile(null);
      setStagePhoto("");
      setStageNotes("");
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to advance stage", { id: "stage-advance" });
    }
  };

  // Submit QA (Step 6)
  const handleQAApprove = async () => {
    if (!selectedBatch) return;
    try {
      toast.loading("Submitting QA approval...", { id: "qa-action" });

      // Submit QA notes
      await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/qa-notes`, {
        notes: qaNotes.trim() || "Passed all sensory and safety checks",
      });

      // Submit QA approval verdict (locationId: 1 for FinishedGoods)
      await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/qa-status`, {
        isApproved: true,
        locationId: 1,
      });

      toast.success("QA Inspection Passed! Batch released for Packaging.", { id: "qa-action" });
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to submit QA approval", { id: "qa-action" });
    }
  };

  const handleQAReject = async () => {
    if (!selectedBatch) return;
    if (!qaRejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }

    try {
      toast.loading("Submitting QA rejection...", { id: "qa-action" });

      await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/qa-status`, {
        isApproved: false,
        rejectionReason: qaRejectReason.trim(),
        locationId: 1,
      });

      // Create Loss Report
      try {
        await api.post("/api/LossReports", {
          batchId: selectedBatch.batchId,
          batchNumber: selectedBatch.batchNumber,
          productName: selectedBatch.productName,
          variant: selectedBatch.variant,
          failureStage: "Quality Control",
          rejectionReason: qaRejectReason.trim(),
          inspector: qaInspector,
          notes: qaNotes.trim(),
        });
      } catch {}

      toast.error(`Batch rejected! Automatic loss report generated in the Loss tab.`, { id: "qa-action" });
      setShowRejectPrompt(false);
      setQaRejectReason("");
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to reject batch", { id: "qa-action" });
    }
  };

  // Submit Packaging (Step 7)
  const handleCompletePackaging = async () => {
    if (!selectedBatch) return;
    if (goodOutput === "" || Number(goodOutput) <= 0) {
      toast.error("Please enter a valid Good Output quantity");
      return;
    }
    if (!packagerName.trim()) {
      toast.error("Please provide the Packager Name");
      return;
    }

    try {
      toast.loading("Finalizing packaging...", { id: "pkg-action" });

      const goodQtyNum = Number(goodOutput);
      const damagedQtyNum = Number(damagedOutput) || 0;

      // Upload packaging photo if present
      let uploadedUrl = packagingPhoto;
      if (packagingPhotoFile) {
        const formData = new FormData();
        formData.append("file", packagingPhotoFile);
        const imgRes = await api.post(`/api/ProductionBatches/${selectedBatch.batchId}/images`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        uploadedUrl = imgRes.data?.imageUrl || uploadedUrl;
      }

      // Update stage to Packaging with actual quantity
      await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/stage`, {
        stage: "Packaging",
        actualQuantity: goodQtyNum,
      });

      const fgLot = `FG-${selectedBatch.batchNumber}`;
      const pkgData: PackagingData = {
        batchNumber: selectedBatch.batchNumber,
        productName: selectedBatch.productName,
        packagingSize: selectedBatch.variant,
        bulkAvailable: `${Math.round(selectedBatch.targetYield * 0.25)} KG`,
        targetOutput: selectedBatch.targetYield,
        materials: [],
        goodQty: goodQtyNum,
        damagedQty: damagedQtyNum,
        wasteQty: Number(wasteOutput) || 0,
        fgLotNumber: fgLot,
        expiryDate,
        packagerName: packagerName.trim(),
        photoUrl: uploadedUrl,
        completed: true,
      };

      savePackagingData(selectedBatch.batchId, pkgData);

      toast.success(`Packaging finalized! System assigned Lot: ${fgLot}`, { id: "pkg-action" });
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to finalize packaging", { id: "pkg-action" });
    }
  };

  // Final Stock In (Step 8)
  const handleAddBatchToInventory = async () => {
    if (!selectedBatch) return;
    try {
      toast.loading("Stocking finished goods into Inventory...", { id: "stockin-action" });
      await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/add-to-inventory`);
      toast.success("Batch successfully stocked into Finished Goods Inventory!", { id: "stockin-action" });
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add batch to inventory", { id: "stockin-action" });
    }
  };

  // ==========================================
  // INVENTORY MANAGER VIEW: Material Request & Material Issued
  // ==========================================
  if (isInventoryManager) {
    const q = mrSearchQuery.toLowerCase().trim();

    const filteredMRs = materialRequests.filter((m) => {
      const matchesSearch =
        !q ||
        m.mrId.toLowerCase().includes(q) ||
        m.batchNumber.toLowerCase().includes(q) ||
        m.productName.toLowerCase().includes(q) ||
        m.recipeName.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const hasShortfall = m.items.some((i) => i.isShortfall);
      if (mrStockFilter === "Sufficient") return !hasShortfall;
      if (mrStockFilter === "Shortfall") return hasShortfall;
      return true;
    });

    const pendingMRs = filteredMRs.filter((m) => m.status === "Pending" || m.status === "Ready to Issue");
    const issuedMRs = filteredMRs.filter((m) => m.status === "Issued");
    const activeMR = materialRequests.find((m) => m.mrId === selectedMRId);

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">View Material Requests</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review kitchen requisitions, verify stock availability, and issue supplies
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 h-9 rounded-xl border-border hover:bg-muted font-semibold text-xs text-foreground cursor-pointer shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Search Bar */}
        <div className="border border-border rounded-xl overflow-hidden bg-card shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 bg-muted/20">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input
                type="text"
                placeholder="Search by MR No, Batch No, Product Name, or Recipe..."
                value={mrSearchQuery}
                onChange={(e) => setMrSearchQuery(e.target.value)}
                className="border-0 shadow-none focus-visible:ring-0 bg-transparent h-8 p-0 text-sm flex-1 text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Select value={mrStockFilter} onValueChange={setMrStockFilter}>
                <SelectTrigger className="w-[160px] h-8 text-xs bg-transparent border-input">
                  <SelectValue placeholder="All Stock Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Stock Status</SelectItem>
                  <SelectItem value="Sufficient">Sufficient Stock</SelectItem>
                  <SelectItem value="Shortfall">Shortfall Detected</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground font-medium pl-1 hidden sm:inline">
                Showing {invMainTab === "requests" ? pendingMRs.length : issuedMRs.length} records
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex items-center">
          <div className="inline-flex p-1 rounded-xl border border-border bg-card shadow-xs gap-1">
            <button
              type="button"
              onClick={() => {
                setInvMainTab("requests");
                setSelectedMRId(null);
                setIsIssuanceMode(false);
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                invMainTab === "requests"
                  ? "bg-foreground text-background font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Pending MR ({pendingMRs.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setInvMainTab("issued");
                setSelectedMRId(null);
                setIsIssuanceMode(false);
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                invMainTab === "issued"
                  ? "bg-foreground text-background font-bold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              Materials Issued ({issuedMRs.length})
            </button>
          </div>
        </div>

        {/* Issuance Execution Mode */}
        {activeMR && (
          <div className="rounded-xl border border-border bg-card shadow-xs p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {isIssuanceMode ? "Scan & Verify Raw Materials for " : "Stock Verification for "} {activeMR.mrId}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Batch: {activeMR.batchNumber} &bull; Product: {activeMR.productName}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isIssuanceMode ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsIssuanceMode(false)}
                      className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft size={13} /> Back to Stock Verification
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedMRId(null)}
                      className="h-8 text-xs font-semibold gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft size={13} /> Back
                    </Button>
                    {activeMR.items.some((i) => i.isShortfall) && (
                      <Button
                        size="sm"
                        onClick={() => setIsPROpen(true)}
                        className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-xl shadow-xs cursor-pointer"
                      >
                        Create Purchase Requisition
                      </Button>
                    )}
                    {!activeMR.items.some((i) => i.isShortfall) && (
                      <Button
                        size="sm"
                        onClick={() => setIsIssuanceMode(true)}
                        className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-xl shadow-xs cursor-pointer"
                      >
                        Proceed to Material Issuance
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Details Form Grid styled like PRDetailsModal */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-1.5 block">
                    Product
                  </label>
                  <p className="text-sm font-semibold text-foreground">
                    {activeMR.productName}
                  </p>
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-1.5 block">
                    Recipe / Formula
                  </label>
                  <p className="text-sm font-medium text-foreground">{activeMR.recipeName}</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-1.5 block">
                    Required Date
                  </label>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {formatLocalDate(activeMR.neededDate)}
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-1.5 block">
                    Requested By
                  </label>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {activeMR.submittedBy}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase mb-1.5 block">
                    Status
                  </label>
                  <StatusBadge status={activeMR.status} />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Material</th>
                    <th className="py-3 px-4">Required Qty</th>
                    <th className="py-3 px-4">Available Stock</th>
                    {isIssuanceMode && (
                      <>
                        <th className="py-3 px-4">Lot / Batch</th>
                        <th className="py-3 px-4">Expiry Date</th>
                        <th className="py-3 px-4">Scan Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeMR.items.map((item) => {
                    const isShortfall = !isIssuanceMode && item.availableStock < item.requiredQty;
                    return (
                      <tr key={item.itemId} className="hover:bg-muted/30">
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {item.itemName}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold">
                          {item.requiredQty} {item.uom}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`font-mono font-semibold ${isShortfall ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                            {item.availableStock} {item.uom}
                          </span>
                          {isShortfall && (
                            <span className="ml-2 text-[10px] text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full font-bold">
                              SHORTFALL
                            </span>
                          )}
                        </td>
                        {isIssuanceMode && (
                          <>
                            <td className="py-3 px-4 font-mono">{item.suggestedLot}</td>
                            <td className="py-3 px-4 text-muted-foreground">{item.suggestedExpiry}</td>
                            <td className="py-3 px-4">
                              {item.isScanned ? (
                                <span className="font-semibold text-foreground flex items-center gap-1">
                                  <CheckCircle2 size={13} className="text-emerald-500" /> {item.scannedLot}
                                </span>
                              ) : (
                                <span className="text-muted-foreground italic">Pending Scan</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenScan(item)}
                                className="h-7 text-xs font-semibold gap-1 cursor-pointer"
                              >
                                <QrCode size={12} /> {item.isScanned ? "Re-Scan" : "Scan QR"}
                              </Button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {isIssuanceMode && (
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    activeMR.items.forEach((item) => {
                      handleScanSuccess(item.suggestedLot);
                    });
                  }}
                  className="h-8 text-xs font-semibold cursor-pointer"
                >
                  Auto-Scan All
                </Button>
                <Button
                  onClick={() => handleIssueMaterials(activeMR.mrId)}
                  disabled={!activeMR.items.every((i) => i.isScanned)}
                  className="h-8 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 cursor-pointer disabled:opacity-50"
                >
                  Issue to Production
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Table of Requests */}
        {!activeMR && (
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider text-[10px] border-b border-border">
                  <tr>
                    <th className="py-3 px-4">MR Number</th>
                    <th className="py-3 px-4">Batch No</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Needed Date</th>
                    <th className="py-3 px-4">Stock Status</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(invMainTab === "requests" ? pendingMRs : issuedMRs).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-muted-foreground text-xs">
                        No material requests found.
                      </td>
                    </tr>
                  ) : (
                    (invMainTab === "requests" ? pendingMRs : issuedMRs).map((mr) => {
                      const hasShortfall = mr.items.some((i) => i.isShortfall);
                      return (
                        <tr key={mr.mrId} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-foreground">
                            {mr.mrId}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-foreground">
                            {mr.batchNumber}
                          </td>
                          <td className="py-3 px-4 font-semibold text-foreground">
                            {mr.productName}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {formatLocalDate(mr.neededDate)}
                          </td>
                          <td className="py-3 px-4">
                            {hasShortfall ? (
                              <span className="flex items-center gap-1.5 text-destructive font-medium">
                                <AlertCircle size={14} /> Shortfall
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                                <CheckCircle2 size={14} /> Sufficient
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={mr.status} />
                          </td>
                          <td className="py-3 px-4 text-right">
                            {mr.status === "Pending" ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedMRId(mr.mrId);
                                  setIsIssuanceMode(false);
                                }}
                                className="h-7 px-3 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
                              >
                                Check Stock & Verify
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedMRId(mr.mrId);
                                  setIsIssuanceMode(true);
                                }}
                                className="h-7 px-3 text-xs font-semibold border-border hover:bg-muted cursor-pointer"
                              >
                                View Issued Items
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* QR Scanner Modal */}
        <QrScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScanSuccess={handleScanSuccess}
          expectedLot={scanningItem?.suggestedLot}
        />

        {/* Create PR Modal for Inventory Manager */}
        <CreatePRModal
          open={isPROpen}
          onClose={() => setIsPROpen(false)}
          onSuccess={() => {
            setIsPROpen(false);
            toast.success("Purchase Requisition submitted to Procurement!");
            fetchData();
          }}
          initialData={prInitialData}
        />
      </div>
    );
  }

  // ==========================================
  // HEAD COOK / PRODUCTION TRACKING WATERFALL
  // ==========================================
  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* ── Left Panel: Trackable Batches List ── */}
      <div className="w-full lg:w-72 shrink-0 space-y-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <h3 className="text-xs font-bold text-foreground">Batch Tracking</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {activeCookingBatches.length} Cooking &bull; {preProdBatches.length} Pre-Prod
              </p>
            </div>
            <span className="text-[11px] font-mono font-bold text-muted-foreground">
              {filteredDisplayBatches.length} Batches
            </span>
          </div>

          {/* Filter Pills */}
          <div className="grid grid-cols-4 gap-1 bg-muted/40 p-1 rounded-lg text-center">
            <button
              type="button"
              onClick={() => setTrackingFilter("all")}
              className={`py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                trackingFilter === "all"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTrackingFilter("pre-prod")}
              className={`py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                trackingFilter === "pre-prod"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Pre-Prod
            </button>
            <button
              type="button"
              onClick={() => setTrackingFilter("cooking")}
              className={`py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                trackingFilter === "cooking"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Cooking
            </button>
            <button
              type="button"
              onClick={() => setTrackingFilter("qa")}
              className={`py-1 text-[10px] font-bold rounded transition-colors cursor-pointer ${
                trackingFilter === "qa"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              QA
            </button>
          </div>

          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {filteredDisplayBatches.length === 0 ? (
              <div className="text-center py-6 px-2">
                <p className="text-xs text-muted-foreground">
                  {trackingFilter === "cooking"
                    ? "No active batches currently in cooking stages."
                    : trackingFilter === "pre-prod"
                    ? "No batches currently in pre-production."
                    : trackingFilter === "qa"
                    ? "No batches currently in QA or packaging."
                    : "No active batches available for tracking."}
                </p>
              </div>
            ) : (
              filteredDisplayBatches.map((b) => {
                const isSelected = b.batchId === selectedBatchId;
                const step = getBatchStep(b);
                const progressPercent = Math.round((step / 8) * 100);
                const phaseLabel =
                  step === 1 ? "Pre-Prod: Authorized"
                  : step === 2 ? "Pre-Prod: BOM"
                  : step === 3 ? "Pre-Prod: MR Sent"
                  : step === 4 ? "Pre-Prod: MR Ready"
                  : step === 5 ? `Cooking: ${b.stage === "Preparation" ? "Peeling" : b.stage}`
                  : step === 6 ? "QA Review"
                  : step === 7 ? "Packaging"
                  : "Stock In";

                return (
                  <button
                    key={b.batchId}
                    type="button"
                    onClick={() => {
                      setSelectedBatchId(b.batchId);
                      setActiveStepTab(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "border-foreground bg-foreground text-background shadow-xs"
                        : "border-border bg-card text-foreground hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold">{b.batchNumber}</span>
                      <span
                        className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          isSelected ? "bg-background text-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {step}/8
                      </span>
                    </div>
                    <p className={`text-xs font-bold mt-0.5 truncate ${isSelected ? "text-background" : "text-foreground"}`}>
                      {b.productName}
                    </p>
                    <div className="flex items-center justify-between mt-0.5 text-[10px]">
                      <span className={`truncate ${isSelected ? "text-background/80" : "text-muted-foreground"}`}>
                        {b.variant} &bull; {b.targetYield} PCS
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px]">
                      <span
                        className={`font-semibold px-1 py-0.5 rounded ${
                          isSelected
                            ? "bg-background/20 text-background"
                            : step < 5
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold"
                            : step === 5
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
                            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold"
                        }`}
                      >
                        {phaseLabel}
                      </span>
                    </div>

                    <div className="mt-1.5">
                      <div className={`w-full h-1 rounded-full overflow-hidden ${isSelected ? "bg-background/20" : "bg-muted"}`}>
                        <div
                          className={`h-full transition-all duration-300 ${isSelected ? "bg-background" : "bg-foreground"}`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Right Panel: Wide Waterfall Process ── */}
      <div className="flex-1 w-full min-w-0">
        {!selectedBatch ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground text-xs">
            Select an active batch from the left to execute the waterfall stages.
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-border bg-muted/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold font-mono text-foreground">
                    {selectedBatch.batchNumber}
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    &bull; {selectedBatch.productName}
                  </span>
                  <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded border border-border bg-muted">
                    {selectedBatch.variant}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Target Yield: <strong className="text-foreground">{selectedBatch.targetYield} PCS</strong> &bull; Target Start Date: <span className="font-mono">{new Date(selectedBatch.scheduleDate).toLocaleDateString()}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-3 py-1.5 rounded-lg bg-foreground text-background font-mono shadow-xs">
                  Step {currentStep} of 8: {selectedBatch.stage || "Preparation"}
                </span>
              </div>
            </div>

            {/* Waterfall Horizontal Step Progress */}
            <div className="p-3 border-b border-border bg-muted/20 overflow-x-auto no-scrollbar">
              <div className="flex items-center min-w-max gap-1.5 text-xs">
                {[
                  "1. Request",
                  "2. Bill of Materials Selection",
                  "3. Material Request",
                  "4. Materials Issued",
                  "5. Cooking Stages",
                  "6. Quality Assurance Review",
                  "7. Packaging",
                  "8. Stock In",
                ].map((stepLabel, idx) => {
                  const stepNum = idx + 1;
                  const isDone = calculatedStep > stepNum;
                  const isCurr = currentStep === stepNum;
                  const isAccessible = stepNum <= calculatedStep;

                  return (
                    <div key={stepLabel} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!isAccessible}
                        onClick={() => setActiveStepTab(stepNum)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                          isDone
                            ? "bg-foreground text-background cursor-pointer"
                            : isCurr
                            ? "border border-foreground bg-card text-foreground font-bold shadow-xs cursor-pointer"
                            : isAccessible
                            ? "text-muted-foreground hover:text-foreground cursor-pointer"
                            : "text-muted-foreground/30 cursor-not-allowed opacity-40"
                        }`}
                      >
                        {stepLabel}
                      </button>
                      {idx < 7 && <span className="text-muted-foreground/40 text-xs">&rarr;</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stage Body */}
            <div className="p-6 space-y-6">
              {/* ── STEP 1: Request Approved ── */}
              {currentStep === 1 && (
                <div className="p-6 rounded-xl border border-border bg-muted/10 space-y-4">
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      Step 1: Production Request Approved
                    </h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      This batch has been authorized by Admin. Proceed to select the Bill of Materials (BOM) recipe.
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setActiveStepTab(2);
                    }}
                    className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                  >
                    Proceed to Bill of Materials &rarr;
                  </Button>
                </div>
              )}

              {/* ── STEP 2: BOM Selection & Material Request ── */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-base font-bold text-foreground">
                      Step 2: Select Bill of Materials Recipe & Generate Material Request
                    </h4>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Each recipe is Good For One. Required quantities are automatically scaled by the production batch size of {selectedBatch.targetYield} containers.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-foreground mb-1.5 block">
                        Recipe / Bill of Materials (BOM)
                      </label>
                      <Select
                        value={selectedBom.recipeId.toString()}
                        onValueChange={(val) => setSelectedBomId(parseInt(val, 10))}
                        disabled={Boolean(selectedBatch.recipeId)}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Choose Recipe" />
                        </SelectTrigger>
                        <SelectContent>
                          {boms.map((b) => (
                            <SelectItem
                              key={b.recipeId}
                              value={b.recipeId.toString()}
                              className="text-xs"
                            >
                              {b.recipeName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBatch.recipeId && (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Recipe selected in the approved production batch request.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-bold text-foreground mb-1.5 block">
                        Target Production Needed Date
                      </label>
                      <Input
                        type="date"
                        value={neededDate}
                        onChange={(e) => setNeededDate(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  {/* Ingredients Table */}
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                        <tr>
                          <th className="py-3 px-4">Ingredient</th>
                          <th className="py-3 px-4">Per Container</th>
                          <th className="py-3 px-4">Scaled Target Qty</th>
                          <th className="py-3 px-4">Available Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {selectedBom.ingredients.map((ing) => {
                          const multiplier = selectedBatch.targetYield;
                          const scaled = Math.round(ing.standardQty * multiplier * 1000) / 1000;
                          const deficit = Math.max(0, scaled - ing.stock);
                          const isDeficit = deficit > 0;
                          return (
                            <tr key={ing.itemId} className="hover:bg-muted/10">
                              <td className="py-3 px-4 font-semibold text-foreground">
                                {ing.itemName}
                              </td>
                              <td className="py-3 px-4 text-muted-foreground">
                                {ing.standardQty} {ing.uom}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-foreground">
                                {scaled} {ing.uom}
                              </td>
                              <td className="py-3 px-4 font-mono text-muted-foreground">
                                {ing.stock} {ing.uom}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {isDeficit ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                    <AlertTriangle size={11} /> Shortfall (-{deficit} {ing.uom})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    <CheckCircle2 size={11} /> Sufficient
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {(() => {
                    const multiplier = selectedBatch.targetYield / (selectedBom.outputYield || 100);
                    const shortfallList = selectedBom.ingredients
                      .map((ing) => ({
                        itemId: ing.itemId,
                        itemName: ing.itemName,
                        uom: ing.uom,
                        availableStock: ing.stock,
                        requiredQty: Math.round(ing.standardQty * multiplier * 10) / 10,
                      }))
                      .filter((it) => it.requiredQty > it.availableStock);

                    return shortfallList.length > 0 ? (
                      <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-center gap-2 text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span className="text-xs font-semibold">
                          Note: {shortfallList.length} ingredient(s) have insufficient stock. Upon submitting this requisition, the Inventory Manager will review inventory and generate a Purchase Requisition (PR).
                        </span>
                      </div>
                    ) : null;
                  })()}

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSubmitMR}
                      className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                    >
                      Submit Material Request
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Material Request Dispatched (Waiting for Inventory) ── */}
              {currentStep === 3 && (
                activeMR ? (
                  <div className="space-y-5">
                    <div className="p-5 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-bold text-foreground">
                          Step 3: Material Request Dispatched ({activeMR.mrId})
                        </h4>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Dispatched to Inventory Manager for stock verification and QR lot scanning.
                        </p>
                      </div>
                      <span className="text-xs font-mono font-bold px-3 py-1 rounded bg-foreground text-background">
                        {activeMR.status}
                      </span>
                    </div>

                    {/* Waiting status banner based on MR state */}
                    {activeMR.status === "Issued" ? (
                      <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-emerald-900 dark:text-emerald-200">
                        <div className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div>
                            <h5 className="text-xs font-bold">Materials Issued by Inventory Manager ✓</h5>
                            <p className="text-xs opacity-90">
                              All required raw materials have been verified and issued. You may now proceed to Step 4 (Materials Issued).
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => setActiveStepTab(4)}
                          className="h-8 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 gap-1.5 cursor-pointer shrink-0 shadow-xs"
                        >
                          Proceed to Materials Issued (Step 4) &rarr;
                        </Button>
                      </div>
                    ) : (() => {
                      const shortfallItems = activeMR.items.filter(
                        (i) => i.isShortfall || i.availableStock < i.requiredQty
                      );
                      const hasShortfall = shortfallItems.length > 0;

                      return hasShortfall ? (
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold">
                              Awaiting Inventory Manager Review &amp; PR Procurement
                            </h5>
                            <p className="text-xs opacity-90">
                              Shortfall detected for {shortfallItems.length} material(s). Production is waiting for the Inventory Manager to review stock, initiate a Purchase Requisition (PR), and issue materials to the kitchen.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl border border-border bg-muted/20 flex items-start gap-2.5 text-foreground">
                          <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 animate-spin" />
                          <div className="space-y-0.5">
                            <h5 className="text-xs font-bold">Awaiting Material Issuance from Inventory Manager</h5>
                            <p className="text-xs text-muted-foreground">
                              All ingredients are sufficient in warehouse inventory. Waiting for the Inventory Manager to complete QR scanning and issue materials to production.
                            </p>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="border border-border rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                          <tr>
                            <th className="py-2.5 px-4">Ingredient</th>
                            <th className="py-2.5 px-4">Required</th>
                            <th className="py-2.5 px-4">Available Stock</th>
                            <th className="py-2.5 px-4">Stock Status</th>
                            <th className="py-2.5 px-4">Assigned Lot</th>
                            <th className="py-2.5 px-4 text-right">Issuance Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {activeMR.items.map((item) => {
                            const isDeficit = item.isShortfall || item.availableStock < item.requiredQty;
                            const deficit = Math.max(0, Math.round((item.requiredQty - item.availableStock) * 10) / 10);

                            return (
                              <tr key={item.itemId} className="hover:bg-muted/20">
                                <td className="py-3 px-4 font-semibold text-foreground">
                                  {item.itemName}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-foreground">
                                  {item.requiredQty} {item.uom}
                                </td>
                                <td className="py-3 px-4 font-mono text-muted-foreground">
                                  {item.availableStock} {item.uom}
                                </td>
                                <td className="py-3 px-4">
                                  {isDeficit ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                      <AlertTriangle size={10} /> Shortfall (-{deficit} {item.uom})
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                      <CheckCircle2 size={10} /> Sufficient
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-mono font-bold text-foreground">
                                  {item.suggestedLot}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {activeMR.status === "Issued" || item.isScanned ? (
                                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                                      <CheckCircle2 size={12} /> Issued
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">
                                      Pending Warehouse Issuance
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border">
                      <p className="text-xs text-muted-foreground italic">
                        {activeMR.status === "Issued"
                          ? "Supplies have been issued from the warehouse."
                          : "Waiting for the Inventory Manager in 'View Material Requests' to verify stock and issue supplies."}
                      </p>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchData}
                          className="h-8 px-3 text-xs font-semibold border-border hover:bg-muted gap-1.5 cursor-pointer"
                        >
                          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh Status
                        </Button>
                        {activeMR.status === "Issued" && (
                          <Button
                            onClick={() => setActiveStepTab(4)}
                            className="h-8 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 gap-1.5 cursor-pointer shadow-xs"
                          >
                            Proceed to Step 4 &rarr;
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-border bg-muted/10 space-y-4">
                    <div>
                      <h4 className="text-base font-bold text-foreground">
                        Step 3: Material Request
                      </h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        No Material Request has been submitted yet for this batch. Complete Step 2 first.
                      </p>
                    </div>
                    <Button
                      onClick={() => setActiveStepTab(2)}
                      className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                    >
                      Go to Step 2: Bill of Materials &rarr;
                    </Button>
                  </div>
                )
              )}

              {/* ── STEP 4: Materials Issued Confirmation ── */}
              {currentStep === 4 && (
                activeMR ? (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-lg border border-border bg-muted/20">
                      <h4 className="text-xs font-bold text-foreground">
                        Step 4: Raw Materials Issued & Verified
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        All ingredients have been verified. Click below to begin cooking stages.
                      </p>
                    </div>

                    <div className="border border-border rounded-lg overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                          <tr>
                            <th className="py-2 px-3">Supply Name</th>
                            <th className="py-2 px-3">Supplier Name</th>
                            <th className="py-2 px-3">Lot Number</th>
                            <th className="py-2 px-3">Expiry Date</th>
                            <th className="py-2 px-3 text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {activeMR.items.map((item) => (
                            <tr key={item.itemId}>
                              <td className="py-2 px-3 font-semibold text-foreground">
                                {item.itemName}
                              </td>
                              <td className="py-2 px-3 text-muted-foreground">{item.supplierName}</td>
                              <td className="py-2 px-3 font-mono font-bold text-foreground">
                                {item.scannedLot || item.suggestedLot}
                              </td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">
                                {item.suggestedExpiry}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                                {item.requiredQty} {item.uom}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={async () => {
                          await api.put(`/api/ProductionBatches/${selectedBatch.batchId}/stage`, {
                            stage: "Peeling",
                          });
                          toast.success("Started Peeling stage!");
                          fetchData();
                        }}
                        className="h-8 px-3 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                      >
                        Start Production Stages
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-border bg-muted/10 space-y-4">
                    <div>
                      <h4 className="text-base font-bold text-foreground">
                        Step 4: Materials Issuance
                      </h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Materials have not been requested yet. Please submit the Material Request in Step 2 first.
                      </p>
                    </div>
                    <Button
                      onClick={() => setActiveStepTab(2)}
                      className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                    >
                      Go to Step 2: Bill of Materials &rarr;
                    </Button>
                  </div>
                )
              )}

              {/* ── STEP 5: 6 Preparation & Cooking Stages (Waterfall) ── */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      Step 5: Production Execution (Waterfall Stages)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Each stage strictly requires an operator name, photo upload, and timestamp before proceeding.
                    </p>
                  </div>

                  {/* Stage Progress Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    {PREP_STAGES.map((s, idx) => {
                      const isCompleted = selectedBatch.stageLogs?.some(
                        (l) => l.stageName === s && l.completed
                      );
                      const isCurrentStage = selectedBatch.stage === s;

                      return (
                        <div
                          key={s}
                          className={`p-2 rounded-lg border text-center transition-all ${
                            isCompleted
                              ? "border-border bg-foreground text-background"
                              : isCurrentStage
                              ? "border-foreground bg-card text-foreground font-bold shadow-xs"
                              : "border-border bg-muted/20 text-muted-foreground/60 opacity-60"
                          }`}
                        >
                          <span className="text-[9px] block uppercase font-semibold">
                            Stage {idx + 1}
                          </span>
                          <span className="text-xs font-bold block">{s}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Current Active Stage Form */}
                  <div className="p-4 rounded-xl border border-border bg-muted/10 space-y-4">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <h5 className="text-xs font-bold text-foreground">
                        Active Stage: {selectedBatch.stage || "Preparation"}
                      </h5>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {new Date().toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-foreground mb-1 block">
                          Operator In-Charge <span className="text-foreground">*</span>
                        </label>
                        <Input
                          placeholder="Operator name..."
                          value={stageInCharge}
                          onChange={(e) => setStageInCharge(e.target.value)}
                          className="h-9 text-xs"
                          required
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-foreground mb-1 block">
                          Stage Notes
                        </label>
                        <Input
                          placeholder="Observations, temperature..."
                          value={stageNotes}
                          onChange={(e) => setStageNotes(e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    {/* Photo Upload */}
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1.5 block">
                        Stage Completion Photo
                      </label>
                      <input
                        type="file"
                        ref={stageFileInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setStagePhotoFile(file);
                            setStagePhoto(URL.createObjectURL(file));
                          }
                        }}
                        accept="image/*"
                        className="hidden"
                      />
                      <div className="flex items-center gap-4">
                        <div className="w-20 h-20 rounded-lg border border-border bg-card overflow-hidden flex items-center justify-center shrink-0">
                          {stagePhoto ? (
                            <img src={stagePhoto} alt="Stage Proof" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">No Photo</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => stageFileInputRef.current?.click()}
                              className="h-8 text-xs font-semibold border-border hover:bg-muted cursor-pointer"
                            >
                              {stagePhoto ? "Change Photo" : "Upload Photo"}
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Photo saved directly into the backend database.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        onClick={() =>
                          handleCompleteCurrentStage(
                            (selectedBatch.stage as typeof PREP_STAGES[number]) || "Peeling"
                          )
                        }
                        className="h-8 px-3 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                      >
                        Complete {selectedBatch.stage || "Stage"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── STEP 6: Quality Assurance (QA) Checklist ── */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <div className="border-b border-border pb-2">
                    <h4 className="text-xs font-bold text-foreground">
                      Step 6: Quality Assurance Food Sensory Checklist
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Perform taste test and sensory checklist. Rejection will automatically log a Loss Report in the Loss tab.
                    </p>
                  </div>

                  <div className="space-y-2 mt-4">
                    {[
                      { label: "Overall Appearance", val: qaAppearance, set: setQaAppearance },
                      { label: "Aroma", val: qaAroma, set: setQaAroma },
                      { label: "Texture & Mouthfeel", val: qaTexture, set: setQaTexture },
                      { label: "Taste Test", val: qaTaste, set: setQaTaste },
                      { label: "Consistency", val: qaConsistency, set: setQaConsistency },
                    ].map((item) => (
                      <label key={item.label} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={item.val}
                          onChange={(e) => item.set(e.target.checked)}
                          className="w-4 h-4 text-foreground border-border rounded focus:ring-foreground accent-foreground"
                        />
                        <span className="font-semibold text-xs text-foreground select-none">{item.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1 block">
                        Quality Assurance Inspector Name <span className="text-foreground">*</span>
                      </label>
                      <select
                        value={qaInspector}
                        onChange={(e) => setQaInspector(e.target.value)}
                        className="h-9 w-full rounded-md border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                      >
                        {HR_EMPLOYEES.map((employee) => (
                          <option key={employee} value={employee}>{employee}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1 block">
                        Tasting Comments
                      </label>
                      <Input
                        placeholder="Sensory tasting notes..."
                        value={qaNotes}
                        onChange={(e) => setQaNotes(e.target.value)}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setShowRejectPrompt(true)}
                      className="h-8 px-3 text-xs font-semibold border-border hover:bg-muted text-destructive hover:text-destructive cursor-pointer"
                    >
                      Reject Batch
                    </Button>
                    <Button
                      onClick={handleQAApprove}
                      className="h-8 px-3 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                    >
                      Approve Quality Assurance
                    </Button>
                  </div>

                  {showRejectPrompt && (
                    <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
                      <p className="text-xs font-bold text-destructive">
                        Rejection Reason (Auto-generates Loss Report)
                      </p>
                      <Textarea
                        placeholder="State reason for rejection..."
                        value={qaRejectReason}
                        onChange={(e) => setQaRejectReason(e.target.value)}
                        className="text-xs resize-none"
                        rows={2}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowRejectPrompt(false)}
                          className="h-8 text-xs cursor-pointer"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleQAReject}
                          className="h-8 px-3 text-xs font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors rounded-md shadow-xs cursor-pointer"
                        >
                          Confirm Rejection
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── STEP 7: Packaging ── */}
              {currentStep === 7 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      Step 7: Packaging & Finished Goods Lot Allocation
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Record actual output quantities and assign finished goods lot number.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-4 font-mono text-xs">
                    <div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground uppercase font-sans font-bold">
                          Batch No:
                        </span>
                        <span className="font-bold text-foreground">{selectedBatch.batchNumber}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground uppercase font-sans font-bold">
                          Product:
                        </span>
                        <span className="font-bold text-foreground">{selectedBatch.productName}</span>
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-muted-foreground uppercase font-sans font-bold">
                          Packaging Size:
                        </span>
                        <span className="font-bold text-foreground">{selectedBatch.variant}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                      <div>
                        <span className="text-muted-foreground uppercase font-sans font-semibold block text-[10px]">
                          Bulk Product Available
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {Math.round(selectedBatch.targetYield * 0.25)} KG
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground uppercase font-sans font-semibold block text-[10px]">
                          Target Output
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {selectedBatch.targetYield} PCS
                        </span>
                      </div>
                    </div>

                    {/* Actual Output Form */}
                    <div className="pt-3 border-t border-border space-y-3 font-sans">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Actual Output
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1 block">
                            Good (PCS) <span className="text-foreground">*</span>
                          </label>
                          <Input
                            type="number"
                            min="0"
                            placeholder={selectedBatch.targetYield.toString()}
                            value={goodOutput}
                            onChange={(e) =>
                              setGoodOutput(e.target.value === "" ? "" : parseInt(e.target.value, 10))
                            }
                            className="h-9 text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1 block">
                            Damaged (PCS)
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={damagedOutput}
                            onChange={(e) =>
                              setDamagedOutput(e.target.value === "" ? "" : parseInt(e.target.value, 10))
                            }
                            className="h-9 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1 block">
                            Waste (PCS)
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={wasteOutput}
                            onChange={(e) =>
                              setWasteOutput(e.target.value === "" ? "" : parseInt(e.target.value, 10))
                            }
                            className="h-9 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1 block">
                            Packager Name <span className="text-foreground">*</span>
                          </label>
                          <Input
                            value={packagerName}
                            onChange={(e) => setPackagerName(e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground mb-1 block">
                            Assigned Expiry Date <span className="text-foreground">*</span>
                          </label>
                          <Input
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={expiryDate}
                            onChange={(e) => setExpiryDate(e.target.value)}
                            className="h-9 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleCompletePackaging}
                      className="h-8 px-3 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                    >
                      Finalize Packaging
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STEP 8: Stock In (Add to Inventory) ── */}
              {currentStep === 8 && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
                    <h4 className="text-xs font-bold text-foreground">
                      Step 8: Final Production Stock-In Review
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Production and packaging are completed. Click below to add the finished goods into the active Inventory module with the assigned Lot Number.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg border border-border bg-card text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                          Finished Lot
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          {selectedBatch.packagingData?.fgLotNumber || `FG-${selectedBatch.batchNumber}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                          Stock Quantity
                        </span>
                        <span className="font-bold text-foreground">
                          {selectedBatch.actualQuantity || selectedBatch.targetYield} PCS
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                          Expiry Date
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          {selectedBatch.packagingData?.expiryDate || "12 Months"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-semibold block">
                          Packager
                        </span>
                        <span className="font-bold text-foreground">
                          {selectedBatch.packagingData?.packagerName || selectedBatch.assignedCook}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleAddBatchToInventory}
                      className="h-8 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors rounded-md shadow-xs cursor-pointer"
                    >
                      Add to Inventory
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Create PR Modal for Head Cook / Tracking Waterfall */}
      <CreatePRModal
        open={isPROpen}
        onClose={() => setIsPROpen(false)}
        onSuccess={() => {
          setIsPROpen(false);
          toast.success("Purchase Requisition submitted to Procurement!");
          fetchData();
        }}
        initialData={prInitialData}
      />
    </div>
  );
}
