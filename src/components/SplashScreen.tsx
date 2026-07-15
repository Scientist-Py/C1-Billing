import React, { useEffect, useState } from 'react';
import logo from '../assets/logo.jpg';

export const SplashScreen: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 2; // Increments to 100 over 2 seconds (1000ms total at 20ms steps, or 50 steps * 40ms = 2s)
      });
    }, 40);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-[#0d0d11] flex flex-col items-center justify-between p-12 text-white font-sans select-none z-50 overflow-hidden">
      {/* Soft warm glowing background ambient circles */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#5c3d2e]/10 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[140px] pointer-events-none animate-pulse" />

      {/* Top spacer */}
      <div className="text-[10px] tracking-[0.2em] text-[#86868b] uppercase opacity-60">
        Chapter One Cafe Console
      </div>

      {/* Central Logo & Brand Box */}
      <div className="flex flex-col items-center justify-center space-y-8 animate-fade-in">
        {/* Glowing Logo Frame */}
        <div className="relative group">
          <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-600 to-[#5c3d2e] rounded-[2.5rem] blur-xl opacity-40 group-hover:opacity-60 transition duration-1000 group-hover:duration-200" />
          <div className="relative w-36 h-36 rounded-[2.2rem] bg-white border border-white/10 shadow-[0_15px_40px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden">
            <img src={logo} alt="Chapter One Logo" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-light tracking-[0.1em] text-white">
            CHAPTER ONE <span className="font-bold text-amber-500">POS</span>
          </h1>
          <p className="text-xs text-[#86868b] tracking-wider uppercase font-light">
            Smart Cafe Management System
          </p>
        </div>
      </div>

      {/* Bottom Progress Bar & Loading Indicator */}
      <div className="w-full max-w-[280px] space-y-4 flex flex-col items-center">
        {/* Progress Bar Container */}
        <div className="w-full h-[3px] bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
          <div 
            className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full transition-all duration-75 ease-out shadow-[0_0_10px_rgba(245,158,11,0.5)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Loading text */}
        <div className="text-[10px] text-[#86868b] tracking-widest uppercase opacity-75 animate-pulse">
          {progress < 100 ? 'Starting Database...' : 'Redirecting...'}
        </div>
      </div>
    </div>
  );
};
