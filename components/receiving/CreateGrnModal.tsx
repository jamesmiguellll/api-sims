"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Plus, Trash2, ClipboardCheck, AlertTriangle } from "lucide-react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import api from "@/lib/api";
import { ArrivedDelivery, GRN, QAInspection } from "./types";
import { HR_EMPLOYEES } from "@/lib/employees";

interface Props {
  open: boolean;
  initialDeliveryId?: number;
  onClose: () => void;
  onSuccess: (grn: GRN) => void;
}

interface ItemBatch {
  id: string;
  expiryDate: string;
  deliveredQuantity: number | "";
}

interface ItemRow {
  poItemId: number;
  deliveryItemId: number;
  itemId: number;
  itemName: string;
  categoryName: string;
  ordered: number;
  previous: number;
  declared: number;
  uom: string;
  batches: ItemBatch[];
}

interface QaItemRow {
  inspectionItemId: number;
  itemId: number;
  itemName: string;
  categoryName?: string;
  lotId?: number;
  batchNumber?: number;
  totalBatches?: number;
  expiryDate?: string;
  deliveredQuantity: number;
  acceptedQuantity: number | "";
  rejectedQuantity: number | "";
  concessionQuantity: number;
  defectReason: string;
  notes: string;
  checks: Record<string, boolean>;
}

const rawMaterialChecks = [
  { id: "identity", label: "Material identity and approved specification match" },
  { id: "quantity", label: "Quantity, unit of measure, and pack size verified" },
  { id: "condition", label: "Freshness, appearance, packaging, and physical condition acceptable" },
  { id: "traceability", label: "Lot, label, manufacture date, and expiry checked" },
  { id: "safety", label: "Cleanliness, contamination, allergen, and foreign matter check passed" },
  { id: "documents", label: "COA, certificate, temperature, and storage requirements reviewed" },
];

const toolAndSupplyChecks = [
  { id: "identity", label: "Item identity, model, size, and approved specification match" },
  { id: "quantity", label: "Quantity, unit of measure, and pack count verified" },
  { id: "condition", label: "Item is undamaged, clean, and fit for use" },
  { id: "packaging", label: "Packaging and seals are intact where applicable" },
  { id: "safety", label: "Safety, hygiene, and contact-use requirements checked" },
  { id: "documents", label: "Certificate, warranty, expiry, or supplier document reviewed" },
];

const defectReasons = [
  "Expired / Insufficient Shelf Life",
  "Damaged Packaging / Torn Seal",
  "Contamination / Foreign Matter",
  "Temperature Abuse / Thawed",
  "Incorrect Product / Model",
  "Quality / Visual Defect",
  "Documentation Missing / Incomplete",
  "Quantity Shortage / Missing Units",
  "Other Quality Non-Conformance",
];

const receivingChecks = [
  ["physicalQuantityVerified", "Physical quantity verified"],
  ["itemsMatchPurchaseOrder", "Items match delivery manifest"],
  ["supplierDocumentsChecked", "Supplier documents checked"],
  ["packagingConditionChecked", "Packaging / condition checked"],
] as const;

export default function CreateGrnModal({ open, initialDeliveryId, onClose, onSuccess }: Props) {
  // Stepper: Step 1 = Receiving & Physical Count; Step 2 = QA Inspection
  const [step, setStep] = useState<1 | 2>(1);

  const [deliveries, setDeliveries] = useState<ArrivedDelivery[]>([]);
  const [selected, setSelected] = useState<ArrivedDelivery | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewGrnNo, setPreviewGrnNo] = useState<string>("GRN-Pending");
  const [notes, setNotes] = useState("");

  // Step 1: Receiving Check checkboxes
  const [verified, setVerified] = useState<Record<string, boolean>>({
    physicalQuantityVerified: false,
    itemsMatchPurchaseOrder: false,
    supplierDocumentsChecked: false,
    packagingConditionChecked: false,
  });

  // Rejection dialog
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  // Confirmations
  const [confirmFinishGrnOpen, setConfirmFinishGrnOpen] = useState(false);

  // Step 2: QA state
  const [activeGrn, setActiveGrn] = useState<GRN | null>(null);
  const [qaInspection, setQaInspection] = useState<QAInspection | null>(null);
  const [qaItems, setQaItems] = useState<QaItemRow[]>([]);
  const [inspectorName, setInspectorName] = useState("");
  const [qaOverallNotes, setQaOverallNotes] = useState("");
  const [qaVerificationChoice, setQaVerificationChoice] = useState("");
  const [expandedQaItems, setExpandedQaItems] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setError(null);
    setFieldErrors({});
    setItems([]);
    setSelected(null);
    setNotes("");
    setActiveGrn(null);
    setQaInspection(null);
    setQaItems([]);
    setInspectorName("");
    setQaOverallNotes("");
    setQaVerificationChoice("");
    setExpandedQaItems({});
    setShowRejectModal(false);
    setRejectionReason("");
    setConfirmFinishGrnOpen(false);
    setVerified({
      physicalQuantityVerified: false,
      itemsMatchPurchaseOrder: false,
      supplierDocumentsChecked: false,
      packagingConditionChecked: false,
    });

    api
      .get("/api/deliveries?eligibleForGrn=true&pageSize=1000")
      .then(({ data }) => {
        const payload = data?.data;
        const list = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
        const arrived = list.filter((d: ArrivedDelivery) => d.status === "Arrived");
        setDeliveries(arrived);

        if (initialDeliveryId) {
          const target = arrived.find((d: ArrivedDelivery) => d.deliveryId === initialDeliveryId);
          if (target) loadSource(target);
        }
      })
      .catch(() => setError("Unable to load arrived deliveries. Please refresh and try again."));

    api
      .get("/api/goods-receipts")
      .then(({ data }) => {
        const allGrns: GRN[] = Array.isArray(data?.data) ? data.data : [];
        const year = new Date().getFullYear();
        const nextSeq = allGrns.length + 1;
        setPreviewGrnNo(`GRN-${year}-${String(nextSeq).padStart(4, "0")}`);
      })
      .catch(() => {
        const year = new Date().getFullYear();
        setPreviewGrnNo(`GRN-${year}-0001`);
      });
  }, [open, initialDeliveryId]);

  const loadSource = async (delivery: ArrivedDelivery) => {
    setSelected(delivery);
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      const [deliveryResult, poResult, itemsCatalogRes] = await Promise.all([
        api.get(`/api/deliveries/${delivery.deliveryId}`),
        api.get(`/api/purchase-orders/${delivery.poId}`),
        api.get("/api/items?pageSize=1000").catch(() => ({ data: { data: [] } })),
      ]);

      const catalogItems = Array.isArray(itemsCatalogRes.data?.data?.items)
        ? itemsCatalogRes.data.data.items
        : Array.isArray(itemsCatalogRes.data?.data)
        ? itemsCatalogRes.data.data
        : [];
      const categoryMap: Record<number, string> = {};
      catalogItems.forEach((catItem: any) => {
        if (catItem.itemId) {
          categoryMap[catItem.itemId] = catItem.categoryName || "";
        }
      });

      const poItems = poResult.data?.data?.items || [];
      const rows: ItemRow[] = (deliveryResult.data?.data?.items || []).map((line: any) => {
        const po = poItems.find((p: any) => p.poItemId === line.poItemId) || line;
        const declared = Number(line.declaredQuantity);
        const resolvedCategory =
          categoryMap[line.itemId] ||
          po.categoryName ||
          line.categoryName ||
          "Raw Materials";

        // Counts start empty so user fills them in
        return {
          poItemId: line.poItemId,
          deliveryItemId: line.deliveryItemId,
          itemId: line.itemId,
          itemName: line.itemName || `Item #${line.itemId}`,
          categoryName: resolvedCategory,
          ordered: Number(po.quantity ?? line.poOrderedQuantity ?? 0),
          previous: Number(po.receivedQuantity ?? line.poTotalReceivedQuantity ?? 0),
          declared,
          uom: line.purchaseUomName || line.uomName || "Unit",
          batches: [
            {
              id: `batch-${Date.now()}-${Math.random()}`,
              expiryDate: "",
              deliveredQuantity: "",
            },
          ],
        };
      });
      setItems(rows);
    } catch {
      setError("Unable to load delivery source lines.");
    } finally {
      setLoading(false);
    }
  };

  const updateBatchQuantity = (itemIndex: number, batchIndex: number, value: string) => {
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy[`qty_${itemIndex}_${batchIndex}`];
      return copy;
    });
    setItems((current) =>
      current.map((item, i) => {
        if (i !== itemIndex) return item;
        const newBatches: ItemBatch[] = item.batches.map((b, bi) => {
          if (bi !== batchIndex) return b;
          const qty: number | "" = value.trim() === "" ? "" : Math.max(0, Number(value));
          return {
            ...b,
            deliveredQuantity: qty,
          };
        });
        return { ...item, batches: newBatches };
      })
    );
  };

  const updateBatchExpiry = (itemIndex: number, batchIndex: number, value: string) => {
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy[`expiry_${itemIndex}_${batchIndex}`];
      return copy;
    });
    setItems((current) =>
      current.map((item, i) => {
        if (i !== itemIndex) return item;
        const newBatches = item.batches.map((b, bi) => {
          if (bi !== batchIndex) return b;
          return { ...b, expiryDate: value };
        });
        return { ...item, batches: newBatches };
      })
    );
  };

  const addBatch = (itemIndex: number) => {
    setItems((current) =>
      current.map((item, i) => {
        if (i !== itemIndex) return item;
        return {
          ...item,
          batches: [
            ...item.batches,
            {
              id: `batch-${Date.now()}-${Math.random()}`,
              expiryDate: "",
              deliveredQuantity: "",
            },
          ],
        };
      })
    );
  };

  const removeBatch = (itemIndex: number, batchIndex: number) => {
    setItems((current) =>
      current.map((item, i) => {
        if (i !== itemIndex) return item;
        if (item.batches.length <= 1) return item;
        return {
          ...item,
          batches: item.batches.filter((_, bi) => bi !== batchIndex),
        };
      })
    );
  };

  const getItemTotalActual = (item: ItemRow): number => {
    return item.batches.reduce((sum, b) => {
      const q = typeof b.deliveredQuantity === "number" ? b.deliveredQuantity : 0;
      return sum + q;
    }, 0);
  };

  // Variance is shown whenever ANY batch has a quantity — independent of expiry
  const hasAnyQty = (item: ItemRow): boolean => {
    return item.batches.some(
      (b) => b.deliveredQuantity !== "" && typeof b.deliveredQuantity === "number" && b.deliveredQuantity > 0
    );
  };

  // For proceed-to-QA: all batches need qty>0, AND expiry required for raw materials
  const isItemExpiryRequired = (item: ItemRow): boolean => {
    const isToolOrSupply =
      item.categoryName?.toLowerCase().includes("tool") ||
      item.categoryName?.toLowerCase().includes("suppl") ||
      item.categoryName?.toLowerCase().includes("equip");
    return !isToolOrSupply;
  };

  const isBatchValid = (b: ItemBatch, reqExpiry: boolean): boolean => {
    const hasQty =
      b.deliveredQuantity !== "" &&
      typeof b.deliveredQuantity === "number" &&
      !isNaN(b.deliveredQuantity) &&
      b.deliveredQuantity > 0;
    const hasExpiry = reqExpiry ? Boolean(b.expiryDate && b.expiryDate.trim()) : true;
    return hasQty && hasExpiry;
  };

  const isItemCounted = (item: ItemRow): boolean => {
    const reqExpiry = isItemExpiryRequired(item);
    return item.batches.length > 0 && item.batches.every((b) => isBatchValid(b, reqExpiry));
  };

  const isReadyForQa = Boolean(
    selected &&
      items.length > 0 &&
      items.every((item) => isItemCounted(item)) &&
      Object.keys(fieldErrors).length === 0
  );

  const rawMaterials = items.filter(
    (i) =>
      !i.categoryName?.toLowerCase().includes("tool") &&
      !i.categoryName?.toLowerCase().includes("suppl")
  );
  const toolsAndSupplies = items.filter(
    (i) =>
      i.categoryName?.toLowerCase().includes("tool") ||
      i.categoryName?.toLowerCase().includes("suppl")
  );

  // STEP 1 Action: Reject Entire Shipment at gate
  const handleRejectShipment = async () => {
    if (!selected) return;
    if (!rejectionReason.trim()) {
      setError("Please provide a reason for rejecting the shipment.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const requestItems = items.flatMap((i) =>
        i.batches.map((b) => ({
          poItemId: i.poItemId,
          deliveryItemId: i.deliveryItemId,
          itemId: i.itemId,
          deliveredQuantity: Number(b.deliveredQuantity) || 0,
          expiryDate: b.expiryDate ? `${b.expiryDate.split("T")[0]}T12:00:00Z` : undefined,
        }))
      );

      const { data: createData } = await api.post("/api/goods-receipts", {
        deliveryId: selected.deliveryId,
        notes: notes.trim() || undefined,
        ...verified,
        items: requestItems,
      });

      if (!createData?.success) {
        throw new Error(createData?.message || "Failed to initiate GRN for rejection.");
      }

      const createdGrn = createData.data;

      const { data: rejectData } = await api.post(`/api/goods-receipts/${createdGrn.grnId}/reject`, {
        reason: rejectionReason.trim(),
        notes: notes.trim() || undefined,
      });

      if (!rejectData?.success) {
        throw new Error(rejectData?.message || "Failed to record shipment rejection.");
      }

      onSuccess(rejectData.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to reject shipment.");
    } finally {
      setSubmitting(false);
      setShowRejectModal(false);
    }
  };

  // STEP 1 Action: Proceed to QA Step in same modal
  const executeProceedToQa = async () => {
    if (!selected) {
      setFieldErrors({ delivery: "Please select an arrived delivery." });
      return;
    }

    if (items.length === 0) {
      setError("No items found for this delivery.");
      return;
    }

    const errs: Record<string, string> = {};

    items.forEach((item, itemIdx) => {
      const reqExpiry = isItemExpiryRequired(item);
      item.batches.forEach((b, batchIdx) => {
        const hasQty =
          b.deliveredQuantity !== "" &&
          typeof b.deliveredQuantity === "number" &&
          !isNaN(b.deliveredQuantity) &&
          b.deliveredQuantity > 0;
        if (!hasQty) {
          errs[`qty_${itemIdx}_${batchIdx}`] = "Quantity required (> 0)";
        }
        if (reqExpiry && (!b.expiryDate || !b.expiryDate.trim())) {
          errs[`expiry_${itemIdx}_${batchIdx}`] = "Expiry date required";
        }
      });
    });

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      // Check if a GRN already exists for this delivery (handles retry after partial failure)
      let resolvedGrn: GRN | null = null;

      const existingGrnRes = await api.get(`/api/goods-receipts?deliveryId=${selected.deliveryId}`);
      const existingGrns: GRN[] = Array.isArray(existingGrnRes.data?.data) ? existingGrnRes.data.data : [];

      // Find a GRN that has already been posted (Received or later) for this delivery
      const postedGrn = existingGrns.find(
        (g) => g.deliveryId === selected.deliveryId && g.status !== "Draft" && g.status !== "Cancelled"
      );

      if (postedGrn) {
        // GRN was already posted — reuse it and skip creation
        resolvedGrn = postedGrn;
        setActiveGrn(postedGrn);
      } else {
        // Check for existing draft for this delivery
        const draftGrn = existingGrns.find(
          (g) => g.deliveryId === selected.deliveryId && g.status === "Draft"
        );

        let createdGrn: GRN;

        if (draftGrn) {
          // Reuse existing draft
          createdGrn = draftGrn;
        } else {
          // Create a new draft GRN
          const requestItems = items.flatMap((i) =>
            i.batches.map((b) => ({
              poItemId: i.poItemId,
              deliveryItemId: i.deliveryItemId,
              itemId: i.itemId,
              deliveredQuantity: Number(b.deliveredQuantity) || 0,
              expiryDate: b.expiryDate ? b.expiryDate.split("T")[0] : undefined,
            }))
          );

          const { data: createData } = await api.post("/api/goods-receipts", {
            deliveryId: selected.deliveryId,
            notes: notes.trim() || undefined,
            ...verified,
            items: requestItems,
          });

          if (!createData?.success) {
            throw new Error(createData?.message || "Failed to create draft GRN.");
          }

          createdGrn = createData.data;
        }

        setActiveGrn(createdGrn);

        // Post the draft GRN
        const postResult = await api.post(`/api/goods-receipts/${createdGrn.grnId}/post`);
        if (!postResult.data?.success) {
          throw new Error(postResult.data?.message || "GRN saved as draft but failed to advance.");
        }

        resolvedGrn = postResult.data.data;
        setActiveGrn(resolvedGrn);
      }

      // Fetch or locate the QA inspection for this GRN
      let inspection: QAInspection | null = null;
      try {
        const qaRes = await api.get(`/api/QualityInspections?grnId=${resolvedGrn!.grnId}`);
        const inspectionList: QAInspection[] = Array.isArray(qaRes.data?.data)
          ? qaRes.data.data
          : Array.isArray(qaRes.data)
          ? qaRes.data
          : [];
        inspection = inspectionList[0] || null;

        if (!inspection) {
          const allQc = await api.get("/api/QualityInspections");
          const allList: QAInspection[] = Array.isArray(allQc.data?.data)
            ? allQc.data.data
            : Array.isArray(allQc.data)
            ? allQc.data
            : [];
          inspection =
            allList.find(
              (q) =>
                q.referenceId === resolvedGrn!.grnId ||
                q.referenceNumber === resolvedGrn!.grnNumber ||
                (q as any).grnId === resolvedGrn!.grnId
            ) || null;
        }
      } catch (qcFetchErr) {
        console.warn("Could not fetch QA inspection directly:", qcFetchErr);
      }

      setQaInspection(inspection);

      // Populate QA inspection rows from inspection items if available, or fall back to GRN/source items
      const sourceItemsList =
        inspection?.items && inspection.items.length > 0
          ? inspection.items
          : items.flatMap((src) =>
              src.batches.map((b, bIdx) => ({
                itemId: src.itemId,
                itemName: src.itemName,
                categoryName: src.categoryName,
                deliveredQuantity: Number(b.deliveredQuantity) || 0,
                lotId: undefined,
                batchNumber: bIdx + 1,
                totalBatches: src.batches.length,
                expiryDate: b.expiryDate ? b.expiryDate.split("T")[0] : undefined,
              }))
            );

      const itemBatchCounters: Record<number, number> = {};
      const qaRows: QaItemRow[] = sourceItemsList.map((qItem: any, idx: number) => {
        const itemId = qItem.itemId;
        const currentCount = itemBatchCounters[itemId] || 0;
        itemBatchCounters[itemId] = currentCount + 1;

        const matchingSource = items.find((src) => src.itemId === itemId);
        const matchingBatch = matchingSource?.batches?.[currentCount] || matchingSource?.batches?.[0];
        const batchNum = qItem.batchNumber || currentCount + 1;
        const totalBatches = qItem.totalBatches || matchingSource?.batches?.length || 1;
        const expiry =
          qItem.lot?.expiryDate?.split("T")[0] ||
          qItem.expiryDate?.split("T")[0] ||
          (matchingBatch?.expiryDate ? matchingBatch.expiryDate.split("T")[0] : undefined);

        const deliveredQty =
          Number(qItem.deliveredQuantity) ||
          Number(matchingBatch?.deliveredQuantity) ||
          (matchingSource ? getItemTotalActual(matchingSource) : 0);

        return {
          inspectionItemId: qItem.inspectionItemId || idx + 1,
          itemId: qItem.itemId,
          itemName: qItem.itemName || matchingSource?.itemName || `Item #${qItem.itemId}`,
          categoryName: matchingSource?.categoryName || "Raw Materials",
          lotId: qItem.lotId || qItem.lot?.lotId,
          batchNumber: batchNum,
          totalBatches: totalBatches,
          expiryDate: expiry,
          deliveredQuantity: deliveredQty,
          acceptedQuantity: deliveredQty,
          rejectedQuantity: 0,
          concessionQuantity: 0,
          defectReason: "",
          notes: "",
          checks: Object.fromEntries(
            [...rawMaterialChecks, ...toolAndSupplyChecks].map((c) => [c.id, false])
          ),
        };
      });

      if (!inspectorName && HR_EMPLOYEES.length > 0) {
        setInspectorName(HR_EMPLOYEES[0]);
      }
      setQaItems(qaRows);
      setExpandedQaItems(Object.fromEntries(qaRows.map((r, i) => [r.inspectionItemId, i === 0])));
      setStep(2);
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.message ||
        (err?.response?.data?.errors
          ? Object.entries(err.response.data.errors)
              .map(([k, v]: [string, any]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join("; ")
          : null) ||
        err?.response?.data?.title ||
        err?.message ||
        "An error occurred while proceeding to QA inspection.";
      console.error("[Proceed to QA] Error message:", errorMsg, err);
      setError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // STEP 2 QA Handlers
  const getQaChecks = (item: QaItemRow) => {
    const isTool = /tool|suppl/i.test(item.categoryName || "");
    return isTool ? toolAndSupplyChecks : rawMaterialChecks;
  };

  const handleSetAccepted = (index: number, valStr: string) => {
    setQaItems((prev) => {
      const copy = [...prev];
      if (valStr === "") {
        copy[index] = { ...copy[index], acceptedQuantity: "" };
        return copy;
      }
      const num = Math.max(0, Math.min(copy[index].deliveredQuantity, Number(valStr)));
      copy[index] = {
        ...copy[index],
        acceptedQuantity: num,
        rejectedQuantity: copy[index].deliveredQuantity - num,
      };
      return copy;
    });
  };

  const handleSetRejected = (index: number, valStr: string) => {
    setQaItems((prev) => {
      const copy = [...prev];
      if (valStr === "") {
        copy[index] = { ...copy[index], rejectedQuantity: "" };
        return copy;
      }
      const num = Math.max(0, Math.min(copy[index].deliveredQuantity, Number(valStr)));
      copy[index] = {
        ...copy[index],
        rejectedQuantity: num,
        acceptedQuantity: copy[index].deliveredQuantity - num,
      };
      return copy;
    });
  };

  const toggleQaCheck = (itemIndex: number, checkId: string) => {
    setQaItems((prev) => {
      const copy = [...prev];
      const current = copy[itemIndex].checks[checkId] ?? false;
      copy[itemIndex] = {
        ...copy[itemIndex],
        checks: { ...copy[itemIndex].checks, [checkId]: !current },
      };
      return copy;
    });
  };

  const toggleCheckAll = (itemIndex: number) => {
    setQaItems((prev) => {
      const copy = [...prev];
      const item = copy[itemIndex];
      const available = getQaChecks(item);
      const allChecked = available.every((c) => item.checks[c.id]);
      const newChecks = { ...item.checks };
      available.forEach((c) => {
        newChecks[c.id] = !allChecked;
      });
      copy[itemIndex] = { ...item, checks: newChecks };
      return copy;
    });
  };

  const toggleExpandQaItem = (itemId: number) => {
    setExpandedQaItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  // Check if Step 2 QA is fully completed
  const isQaDone = Boolean(
    inspectorName.trim() && qaVerificationChoice &&
      qaItems.length > 0 &&
      qaItems.every((i) => {
        const hasAccepted = typeof i.acceptedQuantity === "number" && !isNaN(i.acceptedQuantity);
        const hasRejected = typeof i.rejectedQuantity === "number" && !isNaN(i.rejectedQuantity);
        if (!hasAccepted || !hasRejected) return false;
        if (Number(i.acceptedQuantity) + Number(i.rejectedQuantity) !== Number(i.deliveredQuantity)) return false;
        if (Number(i.rejectedQuantity) > 0 && !i.defectReason.trim()) return false;
        return true;
      })
  );

  const isQaAllAccepted = qaItems.length > 0 && qaItems.every((i) => Number(i.acceptedQuantity) === Number(i.deliveredQuantity));
  const isQaAllRejected = qaItems.length > 0 && qaItems.every((i) => Number(i.rejectedQuantity) === Number(i.deliveredQuantity));

  useEffect(() => {
    if (isQaAllAccepted) setQaVerificationChoice("All Accepted");
    else if (isQaAllRejected) setQaVerificationChoice("All Rejected");
    else if (qaVerificationChoice === "All Accepted" || qaVerificationChoice === "All Rejected") setQaVerificationChoice("");
  }, [isQaAllAccepted, isQaAllRejected]);

  // STEP 2 Action: Finish GRN (Complete QA)
  const executeFinishGrn = async () => {
    if (!activeGrn || !isQaDone) return;

    setSubmitting(true);
    setError(null);
    try {
      let resolvedInspectionId = qaInspection?.inspectionId;
      if (!resolvedInspectionId) {
        const qaRes = await api.get(`/api/QualityInspections?grnId=${activeGrn.grnId}`);
        const list = Array.isArray(qaRes.data?.data) ? qaRes.data.data : [];
        if (list[0]?.inspectionId) {
          resolvedInspectionId = list[0].inspectionId;
          setQaInspection(list[0]);
        }
      }

      if (!resolvedInspectionId) {
        throw new Error("Unable to locate active quality inspection for this GRN.");
      }

      const payload = {
        overallNotes: [`Inspector: ${inspectorName.trim()}`, `VERIFICATION: ${qaVerificationChoice}`, qaOverallNotes.trim()].filter(Boolean).join(" | "),
        items: qaItems.map((i) => ({
          inspectionItemId: i.inspectionItemId,
          itemId: i.itemId,
          lotId: i.lotId,
          deliveredQuantity: Number(i.deliveredQuantity),
          acceptedQuantity: Number(i.acceptedQuantity),
          rejectedQuantity: Number(i.rejectedQuantity),
          concessionQuantity: Number(i.concessionQuantity),
          defectReason: i.defectReason.trim() || undefined,
          notes: [
            `[QA CHECKS: ${getQaChecks(i).filter((check) => i.checks[check.id]).map((check) => check.id).join(", ") || "none recorded"}]`,
            i.notes.trim(),
          ].filter(Boolean).join(" "),
        })),
      };

      const res = await api.post(`/api/QualityInspections/${resolvedInspectionId}/complete`, payload);
      if (!res.data?.success) {
        throw new Error(res.data?.message || "Failed to complete QA inspection.");
      }

      const grnRes = await api.get(`/api/goods-receipts/${activeGrn.grnId}`);
      const finalGrn: GRN = grnRes.data?.data || activeGrn;

      onSuccess(finalGrn);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "Failed to complete Goods Receipt Note Quality Assurance.");
    } finally {
      setSubmitting(false);
    }
  };

  // Export Report Generation (PDF)
  const handleExportGrnReport = async () => {
    if (!isQaDone) return;

    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const grnNo = activeGrn?.grnNumber || previewGrnNo;
      const now = new Date().toLocaleString("en-PH");

      const doc = new jsPDF({ format: "a4", orientation: "portrait" });

      doc.setFontSize(18);
      doc.text("GOODS RECEIPT & QUALITY ASSURANCE REPORT", 14, 22);

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text("Commissary Central Receiving & Quality Control", 14, 28);

      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(grnNo, 196, 22, { align: "right" });

      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Printed: ${now}`, 196, 28, { align: "right" });

      // Info box
      doc.setDrawColor(200);
      doc.setFillColor(248, 250, 252);
      doc.rect(14, 35, 182, 20, "FD");

      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text(`Supplier: ${selected?.supplierName || "—"}`, 18, 42);
      doc.text(`Carrier: ${selected?.carrier || "—"}`, 18, 49);

      doc.text(`Delivery No: ${selected?.deliveryNumber || "—"}`, 105, 42);
      doc.text(`Inspector: ${inspectorName || "—"}`, 105, 49);

      // Table
      const tableData = qaItems.map((item) => {
        const source = items.find((s) => s.itemId === item.itemId);
        const expiry = source?.batches[0]?.expiryDate || "—";
        const isRejected = Number(item.rejectedQuantity) > 0;
        return [
          item.itemName,
          source?.declared ?? item.deliveredQuantity,
          item.deliveredQuantity,
          item.acceptedQuantity,
          item.rejectedQuantity,
          expiry,
          isRejected ? `[REJECTED: ${item.defectReason || "Defect"}] ${item.notes || ""}` : `[PASSED] ${item.notes || ""}`
        ];
      });

      autoTable(doc, {
        startY: 65,
        head: [["Item Description", "Declared", "Received", "Accepted", "Rejected", "Expiry", "Quality Assurance Status & Notes"]],
        body: tableData,
        theme: "grid",
        styles: { fontSize: 8 },
        headStyles: { fillColor: [244, 244, 245], textColor: 0, fontStyle: "bold" },
      });

      let finalY = (doc as any).lastAutoTable.finalY + 15;

      if (qaOverallNotes) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, finalY, 182, 20, "FD");
        doc.text("Inspector Notes:", 18, finalY + 7);
        doc.setFont("helvetica", "normal");
        const lines = doc.splitTextToSize(qaOverallNotes, 174);
        doc.text(lines, 18, finalY + 14);
        finalY += 30;
      }

      // Signatures
      finalY += 20;
      doc.setFontSize(9);
      doc.text("Received & Counted By:", 14, finalY);
      doc.line(14, finalY + 15, 64, finalY + 15);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("Warehouse Receiving Officer", 14, finalY + 20);

      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text("Quality Inspected By:", 75, finalY);
      doc.line(75, finalY + 15, 125, finalY + 15);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(inspectorName || "Quality Assurance Specialist", 75, finalY + 20);

      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text("Acknowledged / Noted:", 136, finalY);
      doc.line(136, finalY + 15, 196, finalY + 15);
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text("Commissary Supervisor", 136, finalY + 20);

      doc.save(`${grnNo}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    }
  };

  const renderItemTableSection = (groupItems: ItemRow[], title: string) => {
    if (groupItems.length === 0) return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
            {title} ({groupItems.length})
          </span>
        </div>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Item Description</th>
                <th className="px-3 py-3 text-right">Declared</th>
                <th className="px-3 py-3 text-right">Actual Received</th>
                <th className="px-3 py-3 text-center">Expiry Date <span className="text-destructive">*</span></th>
                <th className="px-3 py-3 text-center">Variance</th>
                <th className="px-3 py-3 text-right">Batch Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {groupItems.map((item) => {
                const itemIndex = items.findIndex((i) => i.deliveryItemId === item.deliveryItemId);
                const actualTotal = getItemTotalActual(item);
                // Variance shows as soon as ANY qty is entered — independent of expiry date
                const hasQty = hasAnyQty(item);
                const variance = hasQty ? actualTotal - item.declared : null;

                return (
                  <React.Fragment key={item.deliveryItemId}>
                    <tr className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="font-semibold text-foreground">{item.itemName}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.uom} {item.batches.length > 1 ? `· ${item.batches.length} Batches` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-semibold">{item.declared}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex flex-col items-end">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.batches[0].deliveredQuantity === "" ? "" : item.batches[0].deliveredQuantity}
                            placeholder=""
                            onKeyDown={(e) => {
                              if (e.key === "-" || e.key === "e") e.preventDefault();
                            }}
                            onChange={(e) => updateBatchQuantity(itemIndex, 0, e.target.value)}
                            className={`w-24 rounded-xl border ${
                              fieldErrors[`qty_${itemIndex}_0`]
                                ? "!border-destructive text-destructive focus:!ring-destructive"
                                : "border-border"
                            } bg-background px-2.5 py-1.5 text-right font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-foreground`}
                          />
                          {fieldErrors[`qty_${itemIndex}_0`] && (
                            <span className="text-[10px] text-destructive font-medium mt-0.5 whitespace-nowrap">
                              {fieldErrors[`qty_${itemIndex}_0`]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center">
                          <input
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            value={item.batches[0].expiryDate}
                            onChange={(e) => updateBatchExpiry(itemIndex, 0, e.target.value)}
                            className={`rounded-xl border ${
                              fieldErrors[`expiry_${itemIndex}_0`]
                                ? "!border-destructive text-destructive focus:!ring-destructive"
                                : "border-border"
                            } bg-background px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-foreground`}
                          />
                          {fieldErrors[`expiry_${itemIndex}_0`] && (
                            <span className="text-[10px] text-destructive font-medium mt-0.5 whitespace-nowrap">
                              {fieldErrors[`expiry_${itemIndex}_0`]}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-medium">
                        {variance === null ? (
                          <span className="text-muted-foreground/60 text-xs">—</span>
                        ) : variance === 0 ? (
                          <span className="font-semibold text-foreground text-xs">Match</span>
                        ) : variance < 0 ? (
                          <span className="text-destructive font-bold text-xs">
                            Short {Math.abs(variance)}
                          </span>
                        ) : (
                          <span className="text-destructive font-bold text-xs">
                            Over +{variance}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => addBatch(itemIndex)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-foreground hover:text-background transition-colors"
                        >
                          <Plus size={14} className="shrink-0" />
                          <span>Add Batch</span>
                        </button>
                      </td>
                    </tr>

                    {/* Additional Batch Rows */}
                    {item.batches.slice(1).map((batch, subIdx) => {
                      const batchIndex = subIdx + 1;
                      return (
                        <tr key={batch.id} className="bg-muted/15 border-t border-border/40">
                          <td className="px-4 py-2 pl-8 font-medium">
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                              <span>Batch #{batchIndex + 1}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-[11px] text-muted-foreground">—</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={batch.deliveredQuantity === "" ? "" : batch.deliveredQuantity}
                                placeholder=""
                                onKeyDown={(e) => {
                                  if (e.key === "-" || e.key === "e") e.preventDefault();
                                }}
                                onChange={(e) => updateBatchQuantity(itemIndex, batchIndex, e.target.value)}
                                className={`w-24 rounded-xl border ${
                                  fieldErrors[`qty_${itemIndex}_${batchIndex}`]
                                    ? "!border-destructive text-destructive focus:!ring-destructive"
                                    : "border-border"
                                } bg-background px-2.5 py-1.5 text-right font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-foreground`}
                              />
                              {fieldErrors[`qty_${itemIndex}_${batchIndex}`] && (
                                <span className="text-[10px] text-destructive font-medium mt-0.5 whitespace-nowrap">
                                  {fieldErrors[`qty_${itemIndex}_${batchIndex}`]}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-col items-center">
                              <input
                                type="date"
                                min={new Date().toISOString().split("T")[0]}
                                value={batch.expiryDate}
                                onChange={(e) => updateBatchExpiry(itemIndex, batchIndex, e.target.value)}
                                className={`rounded-xl border ${
                                  fieldErrors[`expiry_${itemIndex}_${batchIndex}`]
                                    ? "!border-destructive text-destructive focus:!ring-destructive"
                                    : "border-border"
                                } bg-background px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-foreground`}
                              />
                              {fieldErrors[`expiry_${itemIndex}_${batchIndex}`] && (
                                <span className="text-[10px] text-destructive font-medium mt-0.5 whitespace-nowrap">
                                  {fieldErrors[`expiry_${itemIndex}_${batchIndex}`]}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-muted-foreground">—</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeBatch(itemIndex, batchIndex)}
                              className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors focus:outline-none"
                              title="Remove Batch"
                            >
                              <Trash2 size={16} className="text-destructive" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <>
      <ModalWrapper
        open={open}
        title={
          step === 1
            ? "Create Goods Receipt Note"
            : `Quality Assurance Inspection — ${activeGrn?.grnNumber || previewGrnNo}`
        }
        onClose={onClose}
        size="max-w-4xl"
      >
        <div className="space-y-4 text-foreground">
          {/* Top Assigned GRN Header */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                step === 1 ? "bg-foreground text-background" : "bg-muted text-foreground"
              }`}>
                <span>1</span>
                <span>Receiving &amp; Physical Count</span>
              </div>
              <span className="text-muted-foreground">›</span>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                step === 2 ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground"
              }`}>
                <span>2</span>
                <span>Quality Assurance Inspection</span>
              </div>
            </div>

            <div className="text-xs font-medium text-muted-foreground">
              Assigned Goods Receipt Note: <span className="font-mono font-bold text-foreground">{previewGrnNo}</span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-foreground flex items-start justify-between gap-3">
              <span className="whitespace-pre-line leading-relaxed">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-foreground font-bold text-xs hover:underline ml-2 shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ================= STEP 1: RECEIVING CHECK & PHYSICAL COUNTS ================= */}
          {step === 1 && (
            <>
              {/* Delivery Selection */}
              <section className="space-y-1.5">
                <label className="block text-xs font-semibold text-foreground">
                  Select Delivery <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={selected?.deliveryId ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFieldErrors((prev) => {
                        const copy = { ...prev };
                        delete copy.delivery;
                        return copy;
                      });
                      if (!val) {
                        setSelected(null);
                        setItems([]);
                        setActiveGrn(null);
                        return;
                      }
                      const id = Number(val);
                      const target = deliveries.find((d) => d.deliveryId === id);
                      if (target) loadSource(target);
                    }}
                    className={`w-64 rounded-xl border ${
                      fieldErrors.delivery
                        ? "!border-destructive focus:!ring-destructive"
                        : "border-border"
                    } bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground cursor-pointer`}
                  >
                    <option value="">Select Delivery</option>
                    {deliveries.map((d) => (
                      <option key={d.deliveryId} value={d.deliveryId}>
                        {d.deliveryNumber}
                      </option>
                    ))}
                  </select>
                </div>
                {fieldErrors.delivery && (
                  <p className="mt-1.5 text-xs font-medium text-destructive animate-in fade-in-50">
                    {fieldErrors.delivery}
                  </p>
                )}

                {selected && (
                  <div className="mt-3 rounded-xl border border-border bg-muted/20 p-3 text-xs">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">Supplier</span>
                        <span className="font-semibold text-foreground">{selected.supplierName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold uppercase text-muted-foreground block">Delivery No.</span>
                        <span className="font-semibold text-foreground">{selected.deliveryNumber}</span>
                      </div>
                      {selected.carrier && selected.carrier !== "N/A" && (
                        <div>
                          <span className="text-[10px] font-bold uppercase text-muted-foreground block">Carrier</span>
                          <span className="font-semibold text-foreground">{selected.carrier}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {!selected && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-2xl bg-muted/10">
                  <p className="text-sm font-semibold text-muted-foreground">No delivery selected</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Choose an arrived delivery above to enter physical counts.
                  </p>
                </div>
              )}

              {loading && (
                <div className="py-10 text-center text-xs text-muted-foreground animate-pulse">
                  Loading delivery items…
                </div>
              )}

              {selected && !loading && (
                <>
                  <section className="space-y-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">Physical Count &amp; Expiry Verification</p>
                      <p className="text-xs text-muted-foreground">
                        Enter actual counts and expiry dates for each item. Click &quot;Add Batch&quot; on the right if received across multiple lots or expiry dates.
                      </p>
                    </div>

                    {renderItemTableSection(rawMaterials, "Raw Materials")}
                    {renderItemTableSection(toolsAndSupplies, "Tools and Supplies")}
                  </section>

                  {/* Receiving Checks Section */}
                  <section className="rounded-2xl border border-border bg-muted/20 p-4">
                    <p className="mb-3 text-sm font-bold text-foreground">Receiving Check</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {receivingChecks.map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted/30 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={!!verified[key]}
                            onChange={(e) => setVerified((v) => ({ ...v, [key]: e.target.checked }))}
                            className="h-4 w-4 rounded border-border text-foreground accent-foreground"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  {/* Receiving Notes */}
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-foreground">Receiving Gate Notes</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
                      placeholder="Document quantity differences, packaging condition, or gate inspection notes."
                    />
                  </label>
                </>
              )}

              {/* Step 1 Footer Action Buttons: Reference Add Suppliers modal buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-3">
                  {selected && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => setShowRejectModal(true)}
                      className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Reject Entire Shipment
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={submitting || !isReadyForQa}
                    onClick={executeProceedToQa}
                    className="rounded-xl bg-foreground text-background px-6 py-2.5 text-sm font-semibold hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    {submitting ? "Proceeding…" : "Proceed to Quality Assurance"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ================= STEP 2: EMBEDDED QUALITY ASSURANCE INSPECTION ================= */}
          {step === 2 && (
            <>
              {/* Quality Assurance Inspector Header */}
              <div className="grid sm:grid-cols-2 gap-3 pb-2">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-foreground">Inspector Name <span className="text-destructive">*</span></span>
                  <select
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  >
                    <option value="" disabled>Select inspector...</option>
                    {HR_EMPLOYEES.map(emp => (
                      <option key={emp} value={emp}>{emp}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Item Quality Assurance Inspection Accordion List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                    Items to Inspect ({qaItems.length})
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Fill out accepted and rejected quantities for each item
                  </span>
                </div>

                <div className="space-y-3">
                  {qaItems.map((qaItem, idx) => {
                    const checksList = getQaChecks(qaItem);
                    const allChecked = checksList.every((c) => qaItem.checks[c.id]);
                    const isExpanded = !!expandedQaItems[qaItem.inspectionItemId];

                    return (
                      <div
                        key={qaItem.inspectionItemId}
                        className="rounded-2xl border border-border bg-card overflow-hidden transition-colors shadow-xs"
                      >
                        {/* Clean Grey Accordion Header for QA item */}
                        <div
                          onClick={() => toggleExpandQaItem(qaItem.inspectionItemId)}
                          className="flex items-center justify-between p-3.5 bg-muted/60 dark:bg-muted/40 text-foreground border-b border-border/80 cursor-pointer hover:bg-muted/80 dark:hover:bg-muted/60 transition-colors select-none"
                        >
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{qaItem.itemName}</span>
                            <span className="rounded-md bg-card border border-border text-muted-foreground px-2 py-0.5 text-[10px] font-semibold">
                              {qaItem.categoryName || "Raw Material"}
                            </span>
                            {(qaItem.totalBatches || 1) > 1 && (
                              <span className="rounded-md bg-card border border-border text-foreground px-2 py-0.5 text-[10px] font-mono font-medium">
                                Batch #{qaItem.batchNumber || 1} of {qaItem.totalBatches}
                              </span>
                            )}
                            {qaItem.expiryDate && (
                              <span className="rounded-md bg-card border border-border text-foreground px-2 py-0.5 text-[10px] font-mono font-medium">
                                Exp: {qaItem.expiryDate}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-xs text-muted-foreground">
                              Delivered: <strong className="text-foreground">{qaItem.deliveredQuantity}</strong>
                            </div>
                            {typeof qaItem.acceptedQuantity === "number" && (
                              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                                Acc: {qaItem.acceptedQuantity}
                              </div>
                            )}
                            {typeof qaItem.rejectedQuantity === "number" && Number(qaItem.rejectedQuantity) > 0 && (
                              <div className="text-xs text-rose-600 dark:text-rose-400 font-bold">
                                Rej: {qaItem.rejectedQuantity}
                              </div>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Accordion Body */}
                        {isExpanded && (
                          <div className="p-4 space-y-3.5 border-t border-border/60">
                            {/* Specific Batch & Expiry Date Info */}
                            <div className="rounded-xl border border-border bg-muted/20 p-2.5 text-xs flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
                                Batch &amp; Expiry:
                              </span>
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border text-[11px] font-mono">
                                <span className="text-muted-foreground">
                                  {(qaItem.totalBatches || 1) > 1 ? `Batch #${qaItem.batchNumber || 1} of ${qaItem.totalBatches}:` : "Batch #1:"}
                                </span>
                                <strong className="text-foreground">{qaItem.deliveredQuantity}</strong>
                                <span className="text-muted-foreground">· Expiry:</span>
                                <span className="text-foreground font-semibold">
                                  {qaItem.expiryDate || "Non-expiring"}
                                </span>
                              </div>
                            </div>

                            {/* Checklist Section (Optional) */}
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Verification Checks (Optional)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleCheckAll(idx)}
                                  className="text-[11px] font-semibold text-foreground hover:underline"
                                >
                                  {allChecked ? "Uncheck All" : "Check All"}
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {checksList.map((check) => (
                                  <label
                                    key={check.id}
                                    className="flex items-start gap-2 rounded-lg border border-border bg-card p-2 text-[11px] cursor-pointer hover:bg-muted/30 transition-colors"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!!qaItem.checks[check.id]}
                                      onChange={() => toggleQaCheck(idx, check.id)}
                                      className="mt-0.5 h-3.5 w-3.5 rounded border-border text-foreground accent-foreground"
                                    />
                                    <span className="leading-tight">{check.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Quantity Inputs */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                              <label className="space-y-1">
                                <span className="text-xs font-semibold text-foreground block">
                                  Accepted Quantity <span className="text-destructive">*</span>
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max={qaItem.deliveredQuantity}
                                  value={qaItem.acceptedQuantity}
                                  placeholder=""
                                  onChange={(e) => handleSetAccepted(idx, e.target.value)}
                                  className="w-full rounded-xl border border-border bg-background px-3 py-1.5 font-mono text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                                />
                              </label>

                              <label className="space-y-1">
                                <span className="text-xs font-semibold text-foreground block">
                                  Rejected Quantity <span className="text-destructive">*</span>
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max={qaItem.deliveredQuantity}
                                  value={qaItem.rejectedQuantity}
                                  placeholder=""
                                  onChange={(e) => handleSetRejected(idx, e.target.value)}
                                  className="w-full rounded-xl border border-border bg-background px-3 py-1.5 font-mono text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                                />
                              </label>

                              {Number(qaItem.rejectedQuantity) > 0 ? (
                                <label className="space-y-1">
                                  <span className="text-xs font-semibold text-destructive block">
                                    Defect Reason <span className="text-destructive">*</span>
                                  </span>
                                  <select
                                    value={qaItem.defectReason}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setQaItems((prev) => {
                                        const c = [...prev];
                                        c[idx] = { ...c[idx], defectReason: val };
                                        return c;
                                      });
                                    }}
                                    className="w-full rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                                  >
                                    <option value="">Select Reason</option>
                                    {defectReasons.map((r) => (
                                      <option key={r} value={r}>
                                        {r}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                <label className="space-y-1">
                                  <span className="text-xs font-semibold text-muted-foreground block">
                                    Item Notes
                                  </span>
                                  <input
                                    type="text"
                                    value={qaItem.notes}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setQaItems((prev) => {
                                        const c = [...prev];
                                        c[idx] = { ...c[idx], notes: val };
                                        return c;
                                      });
                                    }}
                                    placeholder="Optional remarks"
                                    className="w-full rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Overall QA Notes moved to end */}
              <div className="pt-2 space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">
                    Verification Choice <span className="text-destructive">*</span>
                  </span>
                  <select
                    value={qaVerificationChoice}
                    onChange={(e) => setQaVerificationChoice(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                  >
                    <option value="">Select a Verification Reason...</option>
                    <optgroup label="Positive Outcomes (Accepted)">
                      <option value="All Accepted">All Accepted</option>
                      <option value="Partial Accept - Acceptable Quality">Partial Accept - Acceptable Quality</option>
                      <option value="Partial Accept - Condition Satisfactory">Partial Accept - Condition Satisfactory</option>
                    </optgroup>
                    <optgroup label="Negative Outcomes (Rejected)">
                      <option value="All Rejected">All Rejected</option>
                      <option value="Rejected - Quality Issues">Rejected - Quality Issues</option>
                      <option value="Rejected - Packaging Issues">Rejected - Packaging Issues</option>
                      <option value="Rejected - Documentation Issues">Rejected - Documentation Issues</option>
                    </optgroup>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-foreground">Additional Remarks (Optional)</span>
                  <textarea
                    value={qaOverallNotes}
                    onChange={(e) => setQaOverallNotes(e.target.value)}
                    rows={2}
                    placeholder="Record any general quality observations or inspection summary..."
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
                  />
                </label>
              </div>

              {/* Step 2 Footer Actions: Buttons styled after SupplierModal, without logos */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Back to Receiving Counts
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={!isQaDone || submitting}
                    onClick={handleExportGrnReport}
                    className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Export Goods Receipt Note
                  </button>
                  <button
                    type="button"
                    disabled={!isQaDone || submitting}
                    onClick={() => setConfirmFinishGrnOpen(true)}
                    className="rounded-xl bg-foreground text-background px-6 py-2.5 text-sm font-semibold hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                  >
                    {submitting ? "Finishing Goods Receipt Note…" : "Finish Goods Receipt Note"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </ModalWrapper>

      {/* Reject Entire Shipment Modal (Matching POActionModal confirmation layout) */}
      {showRejectModal && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowRejectModal(false)}
        >
          <div
            style={{ width: "100%", maxWidth: "440px" }}
            className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col p-6 text-foreground shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center justify-center text-center">
              {/* Circular Alert Icon */}
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 text-foreground">
                <AlertTriangle className="w-6 h-6" />
              </div>

              {/* Title */}
              <h2 className="text-xl font-bold text-foreground mb-1">
                Reject Entire Shipment
              </h2>

              {/* Subtitle */}
              <p className="text-xs font-mono font-semibold text-muted-foreground mb-3">
                Delivery No: {selected?.deliveryNumber || "—"}
              </p>

              {/* Description */}
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                Are you sure you want to reject this entire shipment? This will mark the Goods Receipt Note as Rejected and automatically log Discrepancy records for every line item.
              </p>

              {/* Rejection Reason Input */}
              <div className="w-full text-left space-y-1.5 mb-4">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  Rejection Reason <span className="text-destructive">*</span>
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground"
                >
                  <option value="">Select Reason</option>
                  <option value="Severe transit damage to cargo">Severe transit damage to cargo</option>
                  <option value="Packaging compromised / contaminated">Packaging compromised / contaminated</option>
                  <option value="Wrong products delivered altogether">Wrong products delivered altogether</option>
                  <option value="Delivery documentation completely missing">Delivery documentation completely missing</option>
                  <option value="Temperature compliance breached">Temperature compliance breached</option>
                  <option value="Expired products on arrival">Expired products on arrival</option>
                  <option value="Rejected by commissary gate supervisor">Rejected by commissary gate supervisor</option>
                </select>
              </div>

              {/* Additional Remarks */}
              <div className="w-full text-left space-y-1.5 mb-5">
                <label className="text-xs font-semibold text-foreground">
                  Additional Remarks
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Additional notes or photos reference..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-foreground resize-none"
                />
              </div>

              {/* Uniform Action Buttons */}
              <div className="flex justify-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  disabled={submitting}
                  className="flex-1 px-5 py-2.5 text-sm font-semibold text-foreground border border-border bg-card hover:bg-muted rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!rejectionReason.trim() || submitting}
                  onClick={handleRejectShipment}
                  className="flex-1 px-5 py-2.5 text-sm font-semibold text-background bg-foreground hover:bg-foreground/85 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {submitting ? "Rejecting…" : "Confirm Rejection"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}


      {/* Confirmation before Finish GRN */}
      {confirmFinishGrnOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-[500px] border border-border overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    Complete Quality Assurance & Goods Receipt Note
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You are about to finalize this Goods Receipt Note.
                  </p>
                </div>
              </div>

              <div className="bg-muted/30 rounded-xl p-4 mb-6 space-y-2 border border-border">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Goods Receipt Note #:</span>
                  <span className="font-semibold text-foreground">
                    {activeGrn?.grnNumber || previewGrnNo || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Action:</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-md">
                    Finalize & Save
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setConfirmFinishGrnOpen(false)}
                  disabled={submitting}
                  className="rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setConfirmFinishGrnOpen(false);
                    executeFinishGrn();
                  }}
                  className="rounded-xl bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:bg-foreground/85 transition-colors shadow-sm disabled:opacity-50"
                >
                  {submitting ? "Processing..." : "Confirm & Save"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
