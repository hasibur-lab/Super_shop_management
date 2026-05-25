import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, AlertCircle } from 'lucide-react';

interface CatalogImageProps {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
}

export default function CatalogImage({ src, alt, className = 'w-full h-full object-cover', fill = true }: CatalogImageProps) {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');

  const handleLoad = () => {
    setLoadState('loaded');
  };

  const handleError = () => {
    setLoadState('error');
  };

  return (
    <div className={`relative w-full h-full overflow-hidden select-none bg-slate-950/80 ${fill ? 'absolute inset-0' : ''}`}>
      {/* Skeleton Loading Shimmer State */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-[length:200%_100%] animate-[pulse_1.5s_infinite] flex flex-col items-center justify-center gap-1.5"
            style={{
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          >
            {/* Glowing neon core inside the skeleton */}
            <div className="w-7 h-7 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center animate-pulse">
              <Package className="w-4 h-4 text-yellow-500/60" />
            </div>
            <span className="text-[8px] font-mono font-bold tracking-widest text-slate-500 uppercase">
              FETCHING IMAGE...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fallback Failure State */}
      {loadState === 'error' && (
        <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-2 text-center border border-dashed border-slate-800/60">
          <AlertCircle className="w-5 h-5 text-red-500/50 mb-1" />
          <span className="text-[8px] font-mono text-slate-500 uppercase select-none tracking-tight truncate max-w-[90%]">
            LOAD FAILED
          </span>
        </div>
      )}

      {/* Main Image Asset */}
      <img
        src={src}
        alt={alt}
        onLoad={handleLoad}
        onError={handleError}
        referrerPolicy="no-referrer"
        className={`${className} transition-all duration-500 ease-out ${
          loadState === 'loaded' ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-95 blur-md'
        }`}
      />
    </div>
  );
}
