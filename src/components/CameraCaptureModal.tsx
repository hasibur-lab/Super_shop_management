import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCw, AlertTriangle, FlipHorizontal } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCaptureSuccess: (base64Data: string) => void;
  title?: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCaptureSuccess,
  title = "Capture Product Photo"
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [isMirrored, setIsMirrored] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    // Automatically default mirroring off for environment camera, on for selfie camera
    setIsMirrored(facingMode === 'user');
  }, [facingMode]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);

    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        // Stop current stream before switching
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        };

        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(e => console.warn("Video play error:", e));
        }
      } catch (err: any) {
        console.warn("Camera access failed, falling back:", err);
        try {
          // Absolute fallback constraint
          const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          activeStream = fallbackStream;
          setStream(fallbackStream);
          if (videoRef.current) {
            videoRef.current.srcObject = fallbackStream;
            videoRef.current.play().catch(e => console.warn("Video play error:", e));
          }
        } catch (retryErr) {
          setError("Failed to access camera device. Please confirm camera permissions or try another browser.");
        }
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  const handleCapture = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get as base64 jpeg
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    // Trigger flash animation
    setShowFlash(true);
    setTimeout(() => {
      setShowFlash(false);
      onCaptureSuccess(dataUrl);
      onClose();
    }, 150);
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col text-left">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-500">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-sans font-bold text-white text-base tracking-tight">{title}</h3>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-medium">Capture Station</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-350 hover:text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Video stream container */}
        <div className="p-6 flex-1 flex flex-col justify-center relative bg-slate-950/20 min-h-[320px]">
          {error ? (
            <div className="bg-rose-500/5 border border-rose-500/15 rounded-xl p-5 flex flex-col items-center justify-center gap-3.5 text-center text-xs text-rose-300">
              <AlertTriangle className="w-8 h-8 text-rose-500 shrink-0" />
              <p className="leading-relaxed font-sans max-w-sm">{error}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  playsInline
                  className={`w-full h-full object-cover transition-transform duration-300 ${isMirrored ? 'scale-x-[-1]' : 'scale-x-100'}`}
                />

                {/* Shutter flash overlay effect */}
                {showFlash && (
                  <div className="absolute inset-0 bg-white z-20 animate-pulse"></div>
                )}

                {/* Green guidelines box for aligning product */}
                <div className="absolute inset-x-12 inset-y-8 border-2 border-dashed border-emerald-500/40 rounded-xl pointer-events-none flex items-center justify-center z-10">
                  <div className="text-[10px] font-mono uppercase bg-slate-950/80 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded tracking-wider">
                    Position Product Here
                  </div>
                </div>

                {/* Horizontal scanning lines or lens overlay */}
                <div className="absolute inset-0 pointer-events-none p-6 z-10">
                  <div className="absolute top-6 left-6 w-6 h-6 border-t-2 border-l-2 border-yellow-500"></div>
                  <div className="absolute top-6 right-6 w-6 h-6 border-t-2 border-r-2 border-yellow-500"></div>
                  <div className="absolute bottom-6 left-6 w-6 h-6 border-b-2 border-l-2 border-yellow-500"></div>
                  <div className="absolute bottom-6 right-6 w-6 h-6 border-b-2 border-r-2 border-yellow-500"></div>
                </div>
              </div>

              {/* Toolbar controls */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={handleCapture}
                  className="flex-1 bg-yellow-500 hover:bg-yellow-600 active:scale-[0.98] py-3 text-slate-950 font-black rounded-xl text-xs tracking-widest uppercase transition-all shadow-[0_4px_12px_rgba(234,179,8,0.15)] cursor-pointer flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4 fill-slate-950" />
                  Snap Picture
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className="w-12 h-12 bg-slate-800 hover:bg-slate-700 flex items-center justify-center rounded-xl text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 border border-slate-700/60"
                  title="Switch Front/Rear Camera"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsMirrored(prev => !prev)}
                  className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all cursor-pointer shrink-0 border ${
                    isMirrored 
                      ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-500' 
                      : 'bg-slate-800 border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}
                  title={isMirrored ? "Disable Mirror Mode" : "Enable Mirror Mode"}
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info panel */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 text-center flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>FACING: {facingMode.toUpperCase()}</span>
          <span>HASIB PHOTOENGINE-V1</span>
        </div>
      </div>
    </div>
  );
};
