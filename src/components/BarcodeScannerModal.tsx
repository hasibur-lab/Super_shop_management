import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, ScanLine, AlertTriangle, Play, Keyboard } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
  title?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = "Universal Barcode Camera Scanner"
}) => {
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [activeTab, setActiveTab] = useState<'camera' | 'manual'>('camera');
  const [isStopping, setIsStopping] = useState(false);

  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Barcode scanners typically emit a high pitch pure sine wave beep
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1450, audioCtx.currentTime); // High pitch clear beep

      // Smooth gain ramp to avoid speaker clipping pops
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);

      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.14);
    } catch (err) {
      console.warn("Audio Context beep playback failed:", err);
    }
  };

  const handleSuccess = (barcode: string) => {
    playBeep();
    onScanSuccess(barcode);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setManualInput('');
    setActiveTab('camera');
    setIsStopping(false);

    let html5Qrcode: Html5Qrcode | null = null;
    const elementId = "scanner-camera-view";

    const startScanner = async () => {
      // Brief delay to ensure DOM element is rendered
      await new Promise((resolve) => setTimeout(resolve, 300));
      const element = document.getElementById(elementId);
      if (!element) return;

      try {
        html5Qrcode = new Html5Qrcode(elementId);
        await html5Qrcode.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (width, height) => {
              // Wide rectangle is best suited for 1D/2D barcodes
              const w = Math.min(width * 0.85, 450);
              const h = Math.min(height * 0.45, 180);
              return { width: Math.floor(w), height: Math.floor(h) };
            }
          },
          async (decodedText) => {
            if (html5Qrcode && html5Qrcode.isScanning) {
              try {
                setIsStopping(true);
                await html5Qrcode.stop();
              } catch (err) {
                console.warn("Stopping camera failed:", err);
              }
            }
            handleSuccess(decodedText);
          },
          () => {
            // Ignore frame check failures
          }
        );
      } catch (err: any) {
        console.warn("Failed to lock/access camera:", err);
        setError("Camera feedback is blocked or permissions are not granted. Code fallback and simulated quick scans are ready below.");
        setActiveTab('manual');
      }
    };

    if (activeTab === 'camera') {
      startScanner();
    }

    return () => {
      if (html5Qrcode && html5Qrcode.isScanning) {
        html5Qrcode.stop().catch((e) => console.warn("Teardown scanner failure:", e));
      }
    };
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleSuccess(manualInput.trim());
    }
  };

  const triggerInstantScan = (code: string) => {
    handleSuccess(code);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col text-left">
        
        {/* Header toolbar */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-500">
              <ScanLine className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-white text-base tracking-tight">{title}</h3>
              <p className="text-[10px] text-slate-400">Aim camera at barcode or select simulation targets.</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-800 bg-slate-950/20 px-3 py-1.5 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
              activeTab === 'camera' 
                ? 'bg-yellow-500 text-slate-950' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Active Camera
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
              activeTab === 'manual' 
                ? 'bg-yellow-500 text-slate-950' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            Manual Key-in / Sim
          </button>
        </div>

        {/* Main interactive area */}
        <div className="p-6 flex-1 flex flex-col justify-center min-h-[300px]">
          {activeTab === 'camera' ? (
            <div className="space-y-4">
              {/* Outer box of camera scanning feed */}
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-inner flex flex-col items-center justify-center">
                
                {/* HTML5 QR Code element hook */}
                <div id="scanner-camera-view" className="absolute inset-0 w-full h-full object-cover"></div>

                {isStopping && (
                  <div className="absolute inset-0 bg-slate-950/70 z-20 flex flex-col items-center justify-center">
                    <span className="text-xs text-yellow-500 font-mono animate-pulse">LOCKING SCAN DETAILS...</span>
                  </div>
                )}

                {/* Aesthetic green corner brackets overlay to suggest camera scanning activity */}
                <div className="absolute inset-0 z-10 pointer-events-none p-6">
                  {/* Top-Left */}
                  <div className="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-yellow-500 rounded-tl-md"></div>
                  {/* Top-Right */}
                  <div className="absolute top-6 right-6 w-8 h-8 border-t-4 border-r-4 border-yellow-500 rounded-tr-md"></div>
                  {/* Bottom-Left */}
                  <div className="absolute bottom-6 left-6 w-8 h-8 border-b-4 border-l-4 border-yellow-500 rounded-bl-md"></div>
                  {/* Bottom-Right */}
                  <div className="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-yellow-500 rounded-br-md"></div>

                  {/* Horizontal red scanning laser laser bar */}
                  <div className="absolute left-10 right-10 top-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-[bounce_3s_infinite] opacity-80"></div>
                </div>

                {/* Subtext info inside stream when working correctly */}
                {!error && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-slate-800 rounded-md px-3 py-1 flex items-center gap-1.5 z-10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></div>
                    <span className="text-[10px] font-mono uppercase text-slate-350 tracking-widest">FEED ONLINE</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Camera warning fallback */}
              {error && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex gap-2.5 items-start text-xs text-amber-305">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-sans">{error}</p>
                </div>
              )}

              {/* Pure keyboard submit */}
              <form onSubmit={handleManualSubmit} className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Type Barcode Value</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="e.g. 800111, 900222, 12345"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-yellow-500 font-mono"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="bg-yellow-500 hover:bg-yellow-600 px-4 py-2 text-slate-950 font-black rounded-lg text-xs tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center"
                  >
                    SUBMIT
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick-simulation sample helper section so the user can easily test scanned product loading */}
          <div className="mt-6 border-t border-slate-800 pt-5 space-y-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Simulation Targets (Instant Decodes)</h4>
            <p className="text-[10px] text-slate-400">Clicking any option simulates camera scanning that specific physical item immediately:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => triggerInstantScan('800111')}
                className="bg-slate-950 border border-slate-850 hover:bg-slate-800 p-2.5 rounded-xl text-left hover:border-yellow-500 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-white group-hover:text-yellow-500 transition-colors">Neapolitan Espresso</div>
                <div className="text-[9px] text-slate-500 font-mono">CODE: 800111 [Coffee Outlet]</div>
              </button>
              <button
                type="button"
                onClick={() => triggerInstantScan('800222')}
                className="bg-slate-950 border border-slate-850 hover:bg-slate-800 p-2.5 rounded-xl text-left hover:border-yellow-500 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-white group-hover:text-yellow-500 transition-colors">Sicilian Cannoli</div>
                <div className="text-[9px] text-slate-500 font-mono">CODE: 800222 [Pastry Outlet]</div>
              </button>
              <button
                type="button"
                onClick={() => triggerInstantScan('900222')}
                className="bg-slate-950 border border-slate-850 hover:bg-slate-800 p-2.5 rounded-xl text-left hover:border-yellow-500 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-white group-hover:text-yellow-500 transition-colors">Selvedge Denim Jacket</div>
                <div className="text-[9px] text-slate-500 font-mono">CODE: 900222 [Fashion Outlet]</div>
              </button>
              <button
                type="button"
                onClick={() => triggerInstantScan('012499')}
                className="bg-slate-950 border border-slate-850 hover:bg-slate-800 p-2.5 rounded-xl text-left hover:border-yellow-500 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-white group-hover:text-yellow-500 transition-colors">Collagen Facial Serum</div>
                <div className="text-[9px] text-slate-500 font-mono">CODE: 012499 [Ai Generation]</div>
              </button>
            </div>
          </div>
        </div>

        {/* Modal footer status */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 text-center">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">
            Hasib's Superstore Scanning System v3.1
          </p>
        </div>
      </div>
    </div>
  );
};
