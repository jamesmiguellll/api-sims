"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CreatePRForm } from "@/components/orders-procurement/pr/CreatePRForm";
import api from "@/lib/api";
import { PurchaseRequisition } from "@/components/orders-procurement/types";
import { Loader2 } from "lucide-react";

export default function EditPRPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [prData, setPrData] = useState<PurchaseRequisition | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchPR = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/purchase-requisitions/${id}`);
        if (res.data?.success && res.data?.data) {
          setPrData(res.data.data);
        } else {
          router.push("/orders-procurement");
        }
      } catch (e) {
        console.error("Failed to load PR:", e);
        router.push("/orders-procurement");
      } finally {
        setLoading(false);
      }
    };
    fetchPR();
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin text-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider">Loading Requisition...</span>
      </div>
    );
  }

  if (!prData) return null;

  return <CreatePRForm initialData={prData} isEdit={true} />;
}
