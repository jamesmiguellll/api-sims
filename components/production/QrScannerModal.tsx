"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, CheckCircle2, AlertCircle, RefreshCw, Barcode, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import jsQR from "jsqr";

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  itemName?: string;
  suggestedLot?: string;
  expectedLot?: string;
  onScanSuccess: (scannedLot: string) => void;
}

// Optional pleasant audio confirmation
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
    // AudioContext blocked or not supported
  }
};

export default function QrScannerModal({
  open,
  onClose,
  itemName = "Ingredient Lot",
  suggestedLot,
  expectedLot,
  onScanSuccess,
}: QrScannerModalProps) {
  const targetLot = suggestedLot || expectedLot || "";
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [scanStatus, setScanStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isTimedOut, setIsTimedOut] = useState<boolean>(false);

  // Helper to stop camera tracks
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

  // Start / Request Camera
  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraLoading(true);
    setErrorMessage("");
    setScanStatus("idle");

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
        setErrorMessage("Camera access is not supported by your browser.");
      }
    } catch (err: any) {
      console.warn("Camera access error:", err);
      setHasCamera(false);
      setErrorMessage(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera permissions in browser settings."
          : "Unable to start camera. Please verify camera device is connected."
      );
    } finally {
      setCameraLoading(false);
    }
  }, [stopCamera]);

  // Effect to attach stream to video element whenever stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play().catch(console.error);
      };
    }
  }, [stream]);

  // Modal open/close lifecycle
  useEffect(() => {
    if (!open) {
      stopCamera();
      setScanStatus("idle");
      setErrorMessage("");
      setManualCode("");
      setIsTimedOut(false);
      setTimeLeft(60);
      return;
    }

    setTimeLeft(60);
    setIsTimedOut(false);
    startCamera();

    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  // 1-minute (60 seconds) countdown timer
  useEffect(() => {
    if (!open || isTimedOut || scanStatus === "success") return;

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
  }, [open, isTimedOut, scanStatus, stopCamera]);

  // Parse scanned raw text (handles JSON payload or plain lot string)
  const parseCodeString = (raw: string): string => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.lotCode) return String(parsed.lotCode).trim();
      if (parsed.lotNo) return String(parsed.lotNo).trim();
      if (parsed.code) return String(parsed.code).trim();
    } catch {
      // not JSON
    }
    return raw.trim();
  };

  // Verify Lot Code
  const verifyLot = useCallback(
    (rawCode: string) => {
      const code = parseCodeString(rawCode);
      const trimmed = code.toUpperCase();
      const expected = targetLot.trim().toUpperCase();

      if (!trimmed) {
        setScanStatus("error");
        setErrorMessage("Please scan or enter a valid QR code lot number.");
        playBeep(false);
        return;
      }

      if (trimmed === expected || trimmed.includes(expected) || expected.includes(trimmed)) {
        setScanStatus("success");
        setErrorMessage("");
        playBeep(true);
        stopCamera();

        setTimeout(() => {
          onScanSuccess(targetLot);
          onClose();
        }, 800);
      } else {
        setScanStatus("error");
        setErrorMessage(`Verification Failed: Scanned code "${code}" does not match required Lot "${targetLot}".`);
        playBeep(false);
      }
    },
    [targetLot, onScanSuccess, onClose, stopCamera]
  );

  // Live video frame processing with jsQR
  useEffect(() => {
    if (!open || !hasCamera || isTimedOut || scanStatus === "success") return;

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
                inversionAttempts: "dontInvert",
              });

              if (qrResult && qrResult.data) {
                isScanning = false;
                verifyLot(qrResult.data);
                return;
              }
            } catch {
              // Ignore frame read errors
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
  }, [open, hasCamera, isTimedOut, scanStatus, verifyLot]);

  // Rescan action (restarts camera and resets 1-minute timer)
  const handleRescan = () => {
    setTimeLeft(60);
    setIsTimedOut(false);
    setScanStatus("idle");
    setErrorMessage("");
    startCamera();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      {/* Hidden canvas for jsQR analysis */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-foreground text-background flex items-center justify-center font-bold text-xs shrink-0">
              <Camera size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Scan Ingredient QR Code</h3>
              <p className="text-xs text-muted-foreground truncate max-w-[210px] sm:max-w-[260px]">{itemName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isTimedOut && scanStatus !== "success" && (
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full border border-border bg-card text-foreground">
                0:{String(timeLeft).padStart(2, "0")}
              </span>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Camera / Viewfinder Body */}
        <div className="p-4 sm:p-5 space-y-4">
          <div className="relative w-full aspect-4/3 bg-black rounded-xl overflow-hidden flex items-center justify-center border border-border">
            {/* 1. Timed Out State (Auto-closed camera after 1 minute) */}
            {isTimedOut ? (
              <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-3.5 z-10 w-full h-full bg-black/90">
                <div className="w-12 h-12 rounded-full bg-muted/20 border border-border flex items-center justify-center text-foreground">
                  <AlertCircle className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Camera Session Timed Out</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                    The camera was automatically closed after 1 minute of inactivity.
                  </p>
                </div>

                {/* Buttons directly under the camera view as requested: Close and Rescan */}
                <div className="flex items-center gap-2.5 pt-2">
                  <Button
                    variant="outline"
                    onClick={onClose}
                    className="border-border bg-card text-foreground hover:bg-muted font-semibold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" /> Close
                  </Button>
                  <Button
                    onClick={handleRescan}
                    className="bg-foreground text-background hover:bg-foreground/90 font-semibold text-xs px-5 py-2 rounded-xl transition-colors shadow-sm cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rescan
                  </Button>
                </div>
              </div>
            ) : null}

            {/* 2. Video element - ALWAYS MOUNTED in DOM so videoRef.current is never null */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${hasCamera && !isTimedOut ? "block" : "hidden"}`}
            />

            {/* 3. Fallback when camera is loading or not available */}
            {!isTimedOut && !hasCamera && (
              <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground gap-2">
                {cameraLoading ? (
                  <>
                    <RefreshCw className="w-8 h-8 text-foreground animate-spin mb-1" />
                    <p className="text-xs font-semibold text-foreground">Opening Camera...</p>
                    <p className="text-[11px] text-muted-foreground">Requesting video stream</p>
                  </>
                ) : (
                  <>
                    <Barcode className="w-12 h-12 text-muted-foreground/40 mb-2 animate-pulse" />
                    <p className="text-xs font-semibold text-foreground">Camera Scanner Inactive</p>
                    <p className="text-[11px] text-muted-foreground max-w-[240px]">
                      {errorMessage || "Camera could not be accessed. You can scan using manual barcode entry below."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={startCamera}
                      className="mt-2 text-xs border-border hover:bg-muted cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry Camera
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* 4. Active Reticle and Scanner Laser Line */}
            {!isTimedOut && hasCamera && scanStatus !== "success" && (
              <div className="absolute inset-6 sm:inset-8 border-2 border-foreground/40 rounded-xl pointer-events-none flex flex-col justify-between p-2">
                {/* Laser animation */}
                <div className="absolute inset-x-2 top-0 h-0.5 bg-foreground/80 shadow-[0_0_8px_rgba(255,255,255,0.8)] animate-pulse" />

                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-foreground" />
                  <div className="w-4 h-4 border-t-2 border-r-2 border-foreground" />
                </div>
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-wider font-mono bg-black/75 text-white px-2 py-0.5 rounded border border-white/20">
                    Target: {targetLot}
                  </span>
                </div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-foreground" />
                  <div className="w-4 h-4 border-b-2 border-r-2 border-foreground" />
                </div>
              </div>
            )}

            {/* 5. Success Overlay */}
            {scanStatus === "success" && (
              <div className="absolute inset-0 bg-background/95 backdrop-blur-xs flex flex-col items-center justify-center gap-2 animate-in fade-in z-20">
                <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-foreground">Lot Verified Successfully!</p>
                <p className="text-xs text-muted-foreground font-mono">{targetLot}</p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {scanStatus === "error" && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-border bg-muted/40 text-foreground text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-foreground" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Lot Verification & Manual Simulator */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Required Lot:</span>
              <span className="font-mono font-bold text-foreground">{targetLot}</span>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Or type lot code / barcode..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyLot(manualCode);
                }}
                className="h-9 text-xs font-mono"
              />
              <Button
                onClick={() => verifyLot(manualCode)}
                className="h-9 px-4 text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 shrink-0 cursor-pointer"
              >
                Verify
              </Button>
            </div>

            <div className="pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => verifyLot(targetLot)}
                className="w-full text-xs font-medium border-border hover:bg-muted cursor-pointer"
              >
                <ScanLine className="w-3.5 h-3.5 mr-1.5" /> Simulate Scan ({targetLot})
              </Button>
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/20">
          <div className="text-[11px] text-muted-foreground">
            {!isTimedOut ? (
              <span>Session active (1 min auto-close)</span>
            ) : (
              <span className="font-medium text-foreground">Camera closed</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isTimedOut && (
              <Button
                size="sm"
                onClick={handleRescan}
                className="text-xs font-semibold bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Rescan
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs font-semibold border-border hover:bg-muted cursor-pointer"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
