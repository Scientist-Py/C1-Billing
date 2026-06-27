import React, { useEffect, useState } from 'react';
import { ShieldAlert, Volume2, Cpu, Terminal, Radio } from 'lucide-react';
import { getSettings } from '../utils/db';
import { speakText } from '../utils/ai';

export const getDeviceDetails = (): { name: string; type: string } => {
  if (typeof window === 'undefined') return { name: 'Unknown Device', type: 'unknown' };
  const ua = window.navigator.userAgent;
  
  if (/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream) {
    if (/iPhone/.test(ua)) return { name: 'Apple iPhone', type: 'iOS' };
    if (/iPad/.test(ua)) return { name: 'Apple iPad', type: 'iOS' };
    return { name: 'Apple iOS Device', type: 'iOS' };
  }
  
  if (/Android/.test(ua)) {
    const match = ua.match(/Android\s+[^;]+;\s+([^;\)]+)/);
    if (match && match[1]) {
      const model = match[1].split('Build/')[0].trim();
      return { name: model, type: 'Android' };
    }
    return { name: 'Android Device', type: 'Android' };
  }
  
  if (/Macintosh|Mac OS X/.test(ua)) {
    return { name: 'Apple macOS Computer', type: 'macOS' };
  }
  
  if (/Linux/.test(ua)) {
    return { name: 'Linux Workstation', type: 'Linux' };
  }
  
  return { name: 'Non-Windows Device', type: 'unknown' };
};

export const AccessDenied: React.FC = () => {
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [device, setDevice] = useState<{ name: string; type: string }>({ name: 'Device', type: 'unknown' });
  const [ipAddress, setIpAddress] = useState<string>('192.168.1.1');

  useEffect(() => {
    // Detect device details
    setDevice(getDeviceDetails());
    
    // Simulate randomized terminal IP
    const randomIp = `192.168.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
    setIpAddress(randomIp);

    // Load Gemini Key from Settings database
    const loadSettings = async () => {
      try {
        const s = await getSettings();
        if (s?.geminiApiKey) {
          setGeminiKey(s.geminiApiKey);
        }
      } catch (err) {
        console.warn('Failed to load database keys for access denied audio:', err);
      }
    };
    loadSettings();
  }, []);

  const triggerAudioWarning = () => {
    const speechTextStr = `Warning. The billing system console you are trying to run on ${device.name} is prohibited. Access is restricted to authorized Windows terminals only. Please contact the administration for access.`;
    speakText(speechTextStr, geminiKey);
  };

  useEffect(() => {
    // Autoplay audio warning after a short delay for smooth page loading
    const timer = setTimeout(() => {
      triggerAudioWarning();
    }, 1000);
    return () => clearTimeout(timer);
  }, [device, geminiKey]);

  return (
    <div className="fixed inset-0 bg-[#060608] flex flex-col items-center justify-center p-6 text-white font-sans select-none overflow-hidden z-50">
      {/* Scanline Grid Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #333 1px, transparent 1px),
            linear-gradient(to bottom, #333 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px'
        }}
      />

      {/* Cyber ambient glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-red-950/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -top-40 right-10 w-[300px] h-[300px] bg-orange-950/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Terminal Security Lock Card */}
      <div className="relative max-w-lg w-full bg-[#0d0d11]/85 backdrop-blur-2xl border border-red-500/20 rounded-2xl p-8 shadow-[0_0_60px_rgba(239,68,68,0.08)] flex flex-col items-center space-y-6 text-center z-10">
        
        {/* Neon warning grid header */}
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-0.5 bg-red-950/90 border border-red-500/30 text-[9px] font-bold text-red-400 rounded-full tracking-[0.15em] uppercase flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
          <span>Security Violation Detected</span>
        </div>

        {/* Big Alert Icon */}
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-red-950/30 border border-red-500/20 flex items-center justify-center text-red-500 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]">
            <ShieldAlert className="w-10 h-10 animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-red-500/20 border border-red-500/40 w-6 h-6 rounded-full flex items-center justify-center text-red-400">
            <Radio className="w-3.5 h-3.5 animate-bounce" />
          </div>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold tracking-tight text-[#f5f5f7] flex items-center justify-center gap-2">
            <span>Terminal Lockout</span>
          </h2>
          <p className="text-xs text-[#86868b] leading-relaxed max-w-sm mx-auto">
            You are attempting to initialize the billing system client environment on an unauthorized platform:
            <span className="block mt-1.5 text-red-400 font-bold text-sm tracking-wide">
              {device.name} ({device.type})
            </span>
          </p>
        </div>

        {/* Terminal Info Metrics */}
        <div className="w-full bg-[#16161c]/60 border border-[#2c2c35]/50 rounded-xl p-4 text-[10px] text-[#86868b] text-left font-mono space-y-2 relative overflow-hidden">
          <div className="absolute top-2 right-2 text-[#2c2c35]">
            <Terminal className="w-12 h-12 opacity-10" />
          </div>
          
          <div className="flex justify-between py-1 border-b border-[#2c2c35]/30">
            <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-red-500/70" /> Client Hardware:</span>
            <span className="text-red-400/90 font-semibold">{device.name}</span>
          </div>
          
          <div className="flex justify-between py-1 border-b border-[#2c2c35]/30">
            <span>Network Address:</span>
            <span className="text-[#e8e8ed]">{ipAddress}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-[#2c2c35]/30">
            <span>Terminal Policy:</span>
            <span className="text-red-500 font-bold">WINDOWS_ONLY_STRICT</span>
          </div>

          <div className="flex justify-between py-1">
            <span>Terminal Signature:</span>
            <span className="text-orange-400">POS-ERR_X86_64</span>
          </div>
        </div>

        {/* Instructions */}
        <div className="space-y-4 w-full">
          <p className="text-[11px] text-[#86868b] leading-relaxed max-w-xs mx-auto">
            Access to this POS node is restricted to official x86 Windows terminal configurations. Please contact administrative support to authorize this device.
          </p>

          <button
            type="button"
            onClick={triggerAudioWarning}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-red-950/30 hover:bg-red-950/50 text-red-400 font-bold border border-red-500/25 rounded-xl transition-all cursor-pointer shadow-[0_4px_15px_rgba(239,68,68,0.05)] hover:shadow-[0_4px_25px_rgba(239,68,68,0.15)] text-xs uppercase tracking-wider active:scale-[0.98]"
          >
            <Volume2 className="w-4 h-4 text-red-400" />
            <span>Replay System Voice Alert</span>
          </button>
        </div>

      </div>
    </div>
  );
};
