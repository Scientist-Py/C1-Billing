import React, { useState } from 'react';
import { ShieldAlert, ArrowLeft, Lock, User as UserIcon } from 'lucide-react';
import type { User } from '../types';
import adminPhoto from './admin.png';
import nancyPhoto from './nancy.png';
import raviPhoto from './ravi.png';

interface AutoLockScreenProps {
  currentUser: User;
  onUnlock: () => void;
  onLogout: () => void;
}

export const AutoLockScreen: React.FC<AutoLockScreenProps> = ({
  currentUser,
  onUnlock,
  onLogout
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const photo = currentUser.username === 'Nancy' 
    ? nancyPhoto 
    : currentUser.username === 'Ravi' 
    ? raviPhoto 
    : currentUser.role === 'admin' 
    ? adminPhoto 
    : null;

  const handleKeyPress = (digit: string) => {
    setError(null);
    const newPin = pin + digit;
    
    if (newPin.length <= currentUser.pin.length) {
      setPin(newPin);
      
      // Auto-submit when length matches
      if (newPin.length === currentUser.pin.length) {
        if (currentUser.pin.toLowerCase() === newPin.toLowerCase()) {
          onUnlock();
        } else {
          setError('Incorrect PIN. Please try again.');
          setPin('');
        }
      }
    }
  };

  const handleBackspace = () => {
    setError(null);
    setPin(prev => prev.slice(0, -1));
  };

  // Support physical keyboard entry for pin digits and backspace
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [pin, currentUser]);

  return (
    <div className="fixed inset-0 z-50 bg-[#1d1d1f]/80 backdrop-blur-2xl flex flex-col justify-between p-8 select-none animate-fade-in text-white">
      {/* Top Status */}
      <div className="flex justify-between items-center text-apple-gray-300 text-xs font-semibold">
        <div className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-orange-400" />
          <span>Console Terminal Locked (Idle Timeout)</span>
        </div>
        <div>Chapter One Cafe</div>
      </div>

      {/* Lockscreen body */}
      <div className="flex flex-col items-center justify-center my-auto w-full max-w-[280px] mx-auto space-y-6">
        <div className="text-center">
          {/* User Portrait Avatar */}
          <div className="w-48 h-48 bg-apple-gray-800 border-2 border-white/10 shadow-apple-medium rounded-full flex items-center justify-center overflow-hidden mx-auto mb-4">
            {photo ? (
              <img src={photo} alt={currentUser.username} className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-16 h-16 text-[#86868b]" />
            )}
          </div>
          <h2 className="text-xl font-bold">{currentUser.username}</h2>
          <p className="text-[10px] text-apple-gray-300 font-semibold tracking-wider uppercase mt-1">
            {currentUser.role === 'admin' ? 'System Administrator' : `Staff ID: ${currentUser.id}`}
          </p>
        </div>

        {error && (
          <div className="mx-auto py-2.5 px-4 bg-red-500/25 border border-red-500/35 rounded-xl text-red-200 text-xs font-semibold flex items-center gap-2 animate-bounce w-full max-w-[280px]">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-300" />
            <span>{error}</span>
          </div>
        )}

        {/* iPhone PIN Dots */}
        <div className="flex justify-center gap-4">
          {Array.from({ length: currentUser.pin.length }).map((_, idx) => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-155 ${
                idx < pin.length
                  ? 'bg-white border-white scale-110 shadow-sm'
                  : 'bg-transparent border-white/30'
              }`}
            />
          ))}
        </div>

        {/* iPhone Numerical Keypad */}
        <div className="mx-auto w-full max-w-[280px]">
          <div className="grid grid-cols-3 gap-y-4 gap-x-6 justify-items-center">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border border-white/5 shadow-sm active:scale-95 transition-all flex items-center justify-center text-xl font-bold text-white cursor-pointer"
              >
                {num}
              </button>
            ))}
            
            {/* Switch User / Logout button */}
            <button
              type="button"
              onClick={onLogout}
              className="w-16 h-16 rounded-full bg-white/5 hover:bg-red-500/20 border border-white/5 flex flex-col items-center justify-center text-[9px] font-bold text-[#86868b] hover:text-red-400 transition-all cursor-pointer"
              title="Switch user or lock console fully"
            >
              <ArrowLeft className="w-3.5 h-3.5 mb-0.5" />
              <span>Log Out</span>
            </button>

            {/* Number 0 */}
            <button
              type="button"
              onClick={() => handleKeyPress('0')}
              className="w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 border border-white/5 shadow-sm active:scale-95 transition-all flex items-center justify-center text-xl font-bold text-white cursor-pointer"
            >
              0
            </button>

            {/* Backspace Button */}
            <button
              type="button"
              onClick={handleBackspace}
              disabled={pin.length === 0}
              className="w-16 h-16 rounded-full bg-white/5 hover:bg-white/15 border border-white/5 flex flex-col items-center justify-center text-[10px] font-bold text-[#86868b] hover:text-white transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="text-xs">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="text-center text-[10px] text-apple-gray-305/40 font-light mt-4">
        Chapter One Cafe © 2026. All rights reserved.
      </div>
    </div>
  );
};
