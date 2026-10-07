"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import ModalWrapper from "@/components/resources-suppliers/ModalWrapper";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Barcode,
  X,
} from "lucide-react";
import jsQR from "jsqr";
import { MaterialIssuanceDTO, LotReservationDTO } from "./types";

interface MaterialIssuanceModalProps {
  open: boolean;
  onClose: () => void;
  issuanceId: number | null;
  onSuccess: () => void;
}

// Audio feedback chime helper
const playBeep = (success: boolean) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    if (success) {
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(300, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    }
  } catch {
    // blocked or unsupported
  }
};

export default function MaterialIssuanceModal({
  open,
  onClose,
  issuanceId,
  onSuccess,
}: MaterialIssuanceModalProps) {
  const [issuance, setIssuance] = useState<MaterialIssuanceDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [issuing, setIssuing] = useState<boolean>(false);

  // Active target lot for scanning
  const [activeTargetLot, setActiveTargetLot] = useState<LotReservationDTO | null>(null);
  const [cameraVisible, setCameraVisible] = useState<boolean>(true);

  // Camera & Scanner State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);

  // Fetch Issuance Details
  const fetchDetails = async () => {
    if (!issuanceId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/material-issuances/${issuanceId}`);
      if (res.data?.success && res.data.data) {
        const issData: MaterialIssuanceDTO = res.data.data;
        setIssuance(issData);

        // Auto-select first unverified lot for camera scanning
        const verifiedIds = new Set(
          (issData.scans ?? []).filter((s) => s.isVerified).map((s) => s.lotId)
        );
        const firstUnverified = (issData.reservations ?? []).find(
          (r) => !verifiedIds.has(r.lotId)
        );
        if (firstUnverified) {
          setActiveTargetLot(firstUnverified);
        }
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load material issuance.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && issuanceId) {
      fetchDetails();
      setCameraVisible(true);
    } else {
      stopCamera();
    }
  }, [open, issuanceId]);

  // Derived lot verification status
  const verifiedLotIds = new Set(
    (issuance?.scans ?? []).filter((s) => s.isVerified).map((s) => s.lotId)
  );
  const totalLots = issuance?.reservations?.length ?? 0;
  const verifiedCount = issuance?.reservations?.filter((r) => verifiedLotIds.has(r.lotId)).length ?? 0;
  const allVerified = totalLots > 0 && verifiedCount === totalLots;
  const isAlreadyIssued = issuance?.status === "Issued";

  // Stop camera tracks
  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setHasCamera(false);
  }, [stream]);

  // Start / restart camera
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraLoading(true);
    setErrorMessage("");
    setScanStatus("idle");
    setTimeLeft(60);
    setIsTimedOut(false);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        setStream(s);
        setHasCamera(true);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().catch(console.error);
          };
        }
      } else {
        setHasCamera(false);
        setErrorMessage("Camera access is not supported on this browser.");
      }
    } catch (err: any) {
      console.warn("Camera start error:", err);
      setHasCamera(false);
      setErrorMessage(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera permissions."
          : "Unable to connect to camera device."
      );
    } finally {
      setCameraLoading(false);
    }
  }, [stopCamera]);

  // Attach stream whenever stream state changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(console.error);
      };
    }
  }, [stream]);

  // Auto-start camera when modal opens with unverified lots
  useEffect(() => {
    if (open && cameraVisible && !allVerified && !isAlreadyIssued && !stream && !isTimedOut) {
      startCamera();
    }
  }, [open, cameraVisible, allVerified, isAlreadyIssued, stream, isTimedOut, startCamera]);

  // 1-minute (60 seconds) auto-close countdown timer
  useEffect(() => {
    if (!open || !cameraVisible || isTimedOut || scanStatus === "success" || allVerified) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsTimedOut(true);
          stopCamera();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [open, cameraVisible, isTimedOut, scanStatus, allVerified, stopCamera]);

  // Rescan button handler (reopens camera, resets timer back to 60s)
  const handleRescan = () => {
    setCameraVisible(true);
    startCamera();
  };

  // Close camera button handler
  const handleCloseCamera = () => {
    stopCamera();
    setCameraVisible(false);
  };

  // Select a specific lot for camera focus
  const handleFocusLot = (lot: LotReservationDTO) => {
    setActiveTargetLot(lot);
    setCameraVisible(true);
    setScanStatus("idle");
    setErrorMessage("");
    if (!hasCamera || isTimedOut) {
      startCamera();
    }
  };

  // Parse QR code payload (from Goods & Receiving Stock-In / Put-Away QR code)
  const parseCodeString = (raw: string): string => {
    try {
      const parsed = typeof raw === "object" ? raw : JSON.parse(raw);
      if (parsed.lot) return String(parsed.lot).trim();
      if (parsed.lotCode) return String(parsed.lotCode).trim();
      if (parsed.lot_code) return String(parsed.lot_code).trim();
      if (parsed.lotNo) return String(parsed.lotNo).trim();
      if (parsed.code) return String(parsed.code).trim();
    } catch {
      // plain text string
    }
    return String(raw).trim();
  };

  // Verify and record scan against backend
  const verifyAndRecordScan = async (rawCode: string) => {
    const code = parseCodeString(rawCode);
    const target = activeTargetLot?.lotCode || "";

    if (!code) {
      setScanStatus("error");
      setErrorMessage("Please scan a valid QR code.");
      playBeep(false);
      return;
    }

    const trimmedCode = code.toUpperCase();
    const expected = target.toUpperCase();

    // Check if code matches target lot
    if (trimmedCode !== expected && !trimmedCode.includes(expected) && !expected.includes(trimmedCode)) {
      setScanStatus("error");
      setErrorMessage(`Verification Failed: Scanned code "${code}" does not match required lot "${target}".`);
      playBeep(false);
      return;
    }

    try {
      const res = await api.post(`/api/material-issuances/${issuanceId}/scan`, {
        qrRaw: rawCode, // Send full QR code payload from Goods & Receiving
        ingredientId: activeTargetLot?.ingredientId,
        scannedBy: issuance?.issuedBy || "Inventory Manager",
      });

      if (res.data?.success && res.data.verified) {
        setScanStatus("success");
        setErrorMessage("");
        playBeep(true);
        toast.success(`Lot ${target} verified successfully!`);

        // Refresh issuance details from backend
        await fetchDetails();

        setTimeout(() => {
          setScanStatus("idle");
        }, 1200);
      } else {
        setScanStatus("error");
        setErrorMessage(res.data?.message || "Lot verification failed.");
        playBeep(false);
      }
    } catch (err: any) {
      console.error(err);
      setScanStatus("error");
      setErrorMessage(err.response?.data?.message || "Verification failed.");
      playBeep(false);
    }
  };

  // Real-time video frame processing with jsQR
  useEffect(() => {
    if (!open || !cameraVisible || !hasCamera || isTimedOut || scanStatus === "success" || allVerified) {
      return;
    }

    let isScanning = true;

    const scanTick = () => {
      if (!isScanning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const width = video.videoWidth;
        const height = video.videoHeight;

        if (width > 0 && height > 0) {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            try {
              const imageData = ctx.getImageData(0, 0, width, height);
              const qrResult = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "attemptBoth", // Scans both normal and inverted QR codes
              });

              if (qrResult && qrResult.data) {
                isScanning = false;
                verifyAndRecordScan(qrResult.data);
                return;
              }
            } catch {
              // frame processing error ignore
            }
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(scanTick);
    };

    animFrameIdRef.current = requestAnimationFrame(scanTick);

    return () => {
      isScanning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [open, cameraVisible, hasCamera, isTimedOut, scanStatus, allVerified, activeTargetLot]);

  // Final Issue Materials
  const handleIssueMaterials = async () => {
    if (!allVerified && !isAlreadyIssued) {
      toast.error("Please verify all ingredient lots before issuing.");
      return;
    }

    setIssuing(true);
    try {
      const res = await api.post(`/api/material-issuances/${issuanceId}/issue`, {
        issuedBy: issuance?.issuedBy || "Inventory Manager",
      });

      if (res.data?.success) {
        toast.success("Materials successfully issued! Ready for production.");
        onSuccess();
        onClose();
      } else {
        toast.error(res.data?.message || "Failed to issue materials.");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || "An error occurred during issuance.");
    } finally {
      setIssuing(false);
    }
  };

  if (!issuanceId) return null;

  return (
    <ModalWrapper
      open={open}
      title={`Material Issuance: ${issuance?.issuanceNumber || "Loading..."}`}
      onClose={() => {
        stopCamera();
        onClose();
      }}
      size="max-w-4xl"
    >
      {/* Hidden canvas for jsQR analysis */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="space-y-5 overflow-y-auto max-h-[calc(85vh-110px)] pr-1">
        {/* Header Summary Card */}
        {issuance && (
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-muted/20 border border-border">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground text-sm">{issuance.productName}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                <span>Request No: {issuance.reqNumber}</span>
                <span>•</span>
                <span>Recipe: {issuance.recipeName}</span>
                <span>•</span>
                <span>Target: {issuance.requestQuantity} units</span>
                <span>•</span>
                <span>Issued By: {issuance.issuedBy}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={issuance.status} />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* QR CODE SCANNER SECTION - APPEARS DIRECTLY ON TOP OF MATERIAL ISSUANCE    */}
        {/* ========================================================================= */}
        {!isAlreadyIssued && !allVerified && cameraVisible && (
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden animate-in fade-in duration-200">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center shrink-0">
                  <Camera size={15} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    QR Code Scanner
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Point camera at Goods & Receiving packaging QR code
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isTimedOut && hasCamera && scanStatus !== "success" && (
                  <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full border border-border bg-card text-foreground">
                    0:{String(timeLeft).padStart(2, "0")}
                  </span>
                )}
              </div>
            </div>

            {/* Body: 2-Column Responsive Layout */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* Left Column: Camera Viewfinder */}
              <div className="relative w-full aspect-4/3 bg-black rounded-xl overflow-hidden flex items-center justify-center border border-border">
                {/* 1. Timed Out Overlay (1 minute inactivity) - purely informative, no buttons here */}
                {isTimedOut ? (
                  <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-2 z-20 w-full h-full bg-black/95">
                    <div className="w-10 h-10 rounded-full bg-muted/20 border border-border flex items-center justify-center text-foreground">
                      <AlertCircle className="w-5 h-5 text-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">Camera Session Timed Out</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 max-w-[220px]">
                        Auto-closed after 1 minute of inactivity.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* 2. Video Element (Always mounted) */}
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${hasCamera && !isTimedOut ? "block" : "hidden"}`}
                />

                {/* 3. Fallback / Loading State */}
                {!isTimedOut && !hasCamera && (
                  <div className="flex flex-col items-center justify-center text-center p-5 text-muted-foreground gap-2">
                    {cameraLoading ? (
                      <>
                        <RefreshCw className="w-7 h-7 text-foreground animate-spin mb-1" />
                        <p className="text-xs font-semibold text-foreground">Initializing Camera...</p>
                        <p className="text-[11px] text-muted-foreground">Requesting video stream</p>
                      </>
                    ) : (
                      <>
                        <Barcode className="w-10 h-10 text-muted-foreground/40 mb-1 animate-pulse" />
                        <p className="text-xs font-semibold text-foreground">Camera Scanner Inactive</p>
                        <p className="text-[11px] text-muted-foreground max-w-[200px]">
                          {errorMessage || "Camera unavailable."}
                        </p>
                      </>
                    )}
                  </div>
                )}

                {/* 4. Scanning Reticle & Laser */}
                {!isTimedOut && hasCamera && scanStatus !== "success" && (
                  <div className="absolute inset-5 border-2 border-foreground/40 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                    <div className="absolute inset-x-2 top-0 h-0.5 bg-foreground/80 shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse" />
                    <div className="flex justify-between">
                      <div className="w-3 h-3 border-t-2 border-l-2 border-foreground" />
                      <div className="w-3 h-3 border-t-2 border-r-2 border-foreground" />
                    </div>
                    <div className="text-center">
                      <span className="text-[9px] uppercase tracking-wider font-mono bg-black/75 text-white px-2 py-0.5 rounded border border-white/20">
                        {activeTargetLot?.lotCode || "SCAN LOT"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <div className="w-3 h-3 border-b-2 border-l-2 border-foreground" />
                      <div className="w-3 h-3 border-b-2 border-r-2 border-foreground" />
                    </div>
                  </div>
                )}

                {/* 5. Success Overlay */}
                {scanStatus === "success" && (
                  <div className="absolute inset-0 bg-background/95 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 animate-in fade-in z-20">
                    <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-bold text-foreground">Lot Verified!</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{activeTargetLot?.lotCode}</p>
                  </div>
                )}
              </div>

              {/* Right Column: Target Lot Details + Close & Rescan Buttons */}
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2">
                  <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                    Current Lot Verification Target
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-foreground">{activeTargetLot?.itemName || "Select Lot"}</div>
                      <div className="text-xs font-mono text-muted-foreground">Supply No: {activeTargetLot?.itemCode || "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-foreground">{activeTargetLot?.reservedQuantity} kg</div>
                      <div className="text-[11px] text-muted-foreground">Reserved</div>
                    </div>
                  </div>
                  <div className="pt-2 flex items-center justify-between border-t border-border/50 text-xs">
                    <span className="text-muted-foreground font-medium">Target Lot:</span>
                    <span className="font-mono font-bold text-foreground bg-muted px-2.5 py-0.5 rounded border border-border">
                      {activeTargetLot?.lotCode || "—"}
                    </span>
                  </div>
                </div>

                {/* Status Feedback Banners */}
                {scanStatus === "error" && (
                  <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-foreground text-xs animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-foreground" />
                    <span className="text-[11px]">{errorMessage}</span>
                  </div>
                )}

                {scanStatus === "success" && (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted text-foreground text-xs animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-foreground" />
                    <span className="text-[11px] font-semibold">Lot successfully verified!</span>
                  </div>
                )}

                {scanStatus === "idle" && !isTimedOut && (
                  <div className="p-3 rounded-xl border border-border bg-card text-xs text-muted-foreground flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-foreground shrink-0 animate-pulse" />
                    <span className="text-[11px]">Awaiting QR code scan from Goods & Receiving...</span>
                  </div>
                )}

                {isTimedOut && (
                  <div className="p-3 rounded-xl border border-border bg-muted/40 text-xs text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-foreground shrink-0" />
                    <span className="text-[11px]">Camera session timed out. Click Rescan to resume.</span>
                  </div>
                )}

                {/* Close and Rescan buttons positioned in this panel (replacing the manual barcode / simulate scan buttons) */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCloseCamera}
                    className="flex-1 text-xs border-border hover:bg-muted font-semibold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Close Camera
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRescan}
                    className="flex-1 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Rescan
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Collapsed / Reopen Camera Button if camera was closed */}
        {!isAlreadyIssued && !allVerified && !cameraVisible && (
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
            <div className="flex items-center gap-2 text-xs">
              <Camera className="w-4 h-4 text-foreground" />
              <span className="font-semibold text-foreground">Camera Scanner Closed</span>
              <span className="text-muted-foreground">— You can reopen the camera anytime to scan packaging QR codes.</span>
            </div>
            <Button
              size="sm"
              onClick={handleRescan}
              className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 cursor-pointer shadow-sm"
            >
              <Camera className="w-3.5 h-3.5 mr-1.5" /> Open Camera Scanner
            </Button>
          </div>
        )}

        {/* All Lots Verified Banner */}
        {allVerified && !isAlreadyIssued && (
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center font-bold text-xs">
                ✓
              </div>
              <div>
                <h4 className="text-xs font-bold text-foreground">All Material Lots Successfully Verified!</h4>
                <p className="text-[11px] text-muted-foreground">
                  All {totalLots} required ingredient lots have been confirmed by QR code. You can now issue the materials.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Verification Progress Bar */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">Verification Progress</span>
            <span className="font-mono font-bold text-foreground">
              {verifiedCount} of {totalLots} lots verified ({totalLots > 0 ? Math.round((verifiedCount / totalLots) * 100) : 0}%)
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${totalLots > 0 ? (verifiedCount / totalLots) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Material Lot Verification Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Material Lot Verification
          </h4>

          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Ingredient Name</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Supply No.</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Suggested Lot</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground text-right">Reserved Qty</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground">Expiry Date</th>
                    <th className="py-2.5 px-4 font-semibold text-muted-foreground text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {issuance?.reservations?.map((res) => {
                    const isVerified = verifiedLotIds.has(res.lotId);
                    const isTarget = activeTargetLot?.lotId === res.lotId;

                    return (
                      <tr
                        key={res.reservationId}
                        onClick={() => !isVerified && handleFocusLot(res)}
                        className={`hover:bg-muted/10 transition-colors ${
                          !isVerified ? "cursor-pointer" : ""
                        } ${isTarget && !isVerified ? "bg-muted/20" : ""}`}
                      >
                        {/* Ingredient Name */}
                        <td className="py-3 px-4 font-semibold text-foreground">
                          {res.itemName}
                        </td>

                        {/* Supply No. */}
                        <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {res.itemCode || "—"}
                        </td>

                        {/* Suggested Lot Code */}
                        <td className="py-3 px-4 font-mono font-medium text-foreground whitespace-nowrap">
                          <span className="bg-muted/60 px-2 py-0.5 rounded border border-border">
                            {res.lotCode}
                          </span>
                        </td>

                        {/* Reserved Quantity */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                          {res.reservedQuantity}
                        </td>

                        {/* Expiry Date */}
                        <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                          {res.expiryDate ? new Date(res.expiryDate).toLocaleDateString() : "—"}
                        </td>

                        {/* Status Column: Checkmark when verified, blank otherwise as requested */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {isVerified || isAlreadyIssued ? (
                            <span className="inline-flex items-center text-[11px] font-semibold text-background bg-foreground border border-foreground px-2.5 py-0.5 rounded-full">
                              ✓ Verified
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!issuance?.reservations || issuance.reservations.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                        No material reservations recorded for this issuance.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-xs font-semibold rounded-xl border-border hover:bg-muted cursor-pointer"
          >
            Close
          </Button>

          {!isAlreadyIssued ? (
            <Button
              type="button"
              onClick={handleIssueMaterials}
              disabled={!allVerified || issuing}
              className={`text-xs font-semibold px-6 py-2 rounded-xl transition-all shadow-sm ${
                allVerified
                  ? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              {issuing ? "Issuing..." : "Issue Materials"}
            </Button>
          ) : (
            <span className="text-xs font-semibold text-foreground bg-muted border border-border px-3 py-1.5 rounded-xl">
              Materials Issued
            </span>
          )}
        </div>
      </div>
    </ModalWrapper>
  );
}
