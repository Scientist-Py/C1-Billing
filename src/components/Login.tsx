import React, { useState, useEffect } from 'react';
import { ShieldAlert, Shield, Users, ChevronRight, ArrowLeft, User as UserIcon } from 'lucide-react';
import { getUsers } from '../utils/db';
import type { User } from '../types';
import logo from '../assets/logo.jpg';
import nancyPhoto from './nancy.png';
import raviPhoto from './ravi.png';
import adminPhoto from './admin.png';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [viewState, setViewState] = useState<'role-selection' | 'staff-selection' | 'password-entry'>('role-selection');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const list = await getUsers();
        setUsers(list);
      } catch (err) {
        console.error('Failed to load users', err);
      }
    };
    loadUsers();
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleKeyPress = (digit: string) => {
    setError(null);
    if (!selectedUser) return;
    
    const newPin = password + digit;
    // Limit to the length of the selected user's PIN
    if (newPin.length <= selectedUser.pin.length) {
      setPassword(newPin);
      
      // Auto-submit when length matches
      if (newPin.length === selectedUser.pin.length) {
        if (selectedUser.pin.toLowerCase() === newPin.toLowerCase()) {
          onLoginSuccess(selectedUser);
        } else {
          setError('Incorrect PIN. Please try again.');
          setPassword('');
        }
      }
    }
  };

  const handleBackspace = () => {
    setError(null);
    setPassword(prev => prev.slice(0, -1));
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex flex-col justify-between p-8 relative overflow-hidden select-none">
      {/* Decorative gradient backdrops */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-apple-gray-200/30 blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-apple-gray-100/50 blur-[120px]" />

      {/* Top bar with time and status */}
      <div className="flex justify-between items-center text-apple-gray-305 text-sm font-medium z-10">
        <div>Chapter One Cafe - Billing Portal</div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>Local Server Online</span>
        </div>
      </div>

      {/* Lockscreen body */}
      <div className="flex flex-col items-center justify-center my-auto z-10 w-full max-w-sm mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-light text-apple-gray-800 tracking-tight">{time}</h1>
          <p className="text-apple-gray-300 text-sm mt-1">{date}</p>
        </div>

        {/* Cafe Logo */}
        <div className="w-16 h-16 rounded-2xl bg-white border border-apple-gray-100/80 shadow-apple-card flex items-center justify-center mb-6 overflow-hidden">
          <img src={logo} alt="Chapter One Cafe Logo" className="w-full h-full object-cover" />
        </div>

        {/* Conditional Screen Rendering */}
        {viewState === 'role-selection' && (
          <div className="w-full text-center space-y-5">
            <div>
              <h2 className="text-lg font-bold text-apple-gray-800 mb-1">Select Your Role</h2>
              <p className="text-xs text-[#86868b] font-light">
                Choose Administrator or Staff to proceed to login.
              </p>
            </div>

            <div className="space-y-3 w-full px-4">
              <button
                onClick={() => {
                  const adminUser = users.find(u => u.role === 'admin');
                  if (adminUser) {
                    setSelectedUser(adminUser);
                    setViewState('password-entry');
                  } else {
                    alert('System database is initializing. Please wait.');
                  }
                }}
                className="w-full flex items-center justify-between p-4 bg-white border border-apple-gray-100/80 shadow-apple-card hover:shadow-apple-medium rounded-2xl transition-apple text-left cursor-pointer hover:border-apple-gray-200"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 bg-[#f5f5f7] border border-apple-gray-100/60 rounded-xl flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                    {adminPhoto ? (
                      <img src={adminPhoto} alt="Admin" className="w-full h-full object-cover" />
                    ) : (
                      <Shield className="w-5 h-5 text-[#1d1d1f]" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-apple-gray-800">Administrator</div>
                    <div className="text-[10px] text-[#86868b] font-light">System settings & audits</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-apple-gray-300" />
              </button>

              <button
                onClick={() => setViewState('staff-selection')}
                className="w-full flex items-center justify-between p-4 bg-white border border-apple-gray-100/80 shadow-apple-card hover:shadow-apple-medium rounded-2xl transition-apple text-left cursor-pointer hover:border-apple-gray-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-apple-gray-50 border border-apple-gray-100 rounded-xl flex items-center justify-center text-apple-gray-800">
                    <Users className="w-5 h-5 text-[#1d1d1f]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-apple-gray-800">Cafe Staff</div>
                    <div className="text-[10px] text-[#86868b] font-light">Nancy & Ravi checkout portals</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-apple-gray-300" />
              </button>
            </div>
          </div>
        )}

        {viewState === 'staff-selection' && (
          <div className="w-full text-center space-y-5">
            <div>
              <h2 className="text-lg font-bold text-apple-gray-800 mb-1">Who are you?</h2>
              <p className="text-xs text-[#86868b] font-light">
                Select your staff profile to enter your password.
              </p>
            </div>

            <div className="w-full px-4">
              <div className="grid grid-cols-2 gap-4">
                {users.filter(u => u.role === 'staff').map(u => {
                  const photo = u.username === 'Nancy' ? nancyPhoto : u.username === 'Ravi' ? raviPhoto : null;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedUser(u);
                        setViewState('password-entry');
                      }}
                      className="flex flex-col items-center p-4 bg-white border border-apple-gray-100/80 shadow-apple-card hover:shadow-apple-medium rounded-3xl transition-apple text-center cursor-pointer hover:border-apple-gray-200"
                    >
                      <div className="w-24 h-24 bg-[#f5f5f7] border border-apple-gray-100/60 rounded-2xl flex items-center justify-center overflow-hidden shrink-0 shadow-sm mb-3">
                        {photo ? (
                          <img src={photo} alt={u.username} className="w-full h-full object-cover" />
                        ) : (
                          <UserIcon className="w-8 h-8 text-[#86868b]" />
                        )}
                      </div>
                      <div className="text-sm font-bold text-apple-gray-800">{u.username}</div>
                      <div className="text-[10px] text-[#86868b] font-semibold mt-1">ID: {u.id}</div>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setViewState('role-selection')}
                className="w-full py-2.5 bg-[#f5f5f7] hover:bg-apple-gray-50 border border-apple-gray-100 rounded-xl text-xs font-semibold text-[#86868b] hover:text-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer mt-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Roles</span>
              </button>
            </div>
          </div>
        )}

        {viewState === 'password-entry' && (
          <div className="w-full text-center space-y-5">
            <div className="flex flex-col items-center">
              {/* User Portrait Avatar */}
              <div className="w-48 bg-[#f5f5f7] border-2 border-white shadow-apple-medium rounded-3xl flex items-center justify-center overflow-hidden mb-3">
                {selectedUser?.username === 'Nancy' ? (
                  <img src={nancyPhoto} alt="Nancy" className="w-full h-auto object-contain" />
                ) : selectedUser?.username === 'Ravi' ? (
                  <img src={raviPhoto} alt="Ravi" className="w-full h-auto object-contain" />
                ) : selectedUser?.role === 'admin' ? (
                  <img src={adminPhoto} alt="Admin" className="w-full h-auto object-contain" />
                ) : (
                  <div className="py-16">
                    <Shield className="w-14 h-14 text-[#1d1d1f]" />
                  </div>
                )}
              </div>
              <h2 className="text-lg font-bold text-apple-gray-800 leading-tight">{selectedUser?.username}</h2>
              <p className="text-[10px] text-[#86868b] font-semibold tracking-wider uppercase mt-1">
                {selectedUser?.role === 'admin' ? 'System Administrator' : `Staff ID: ${selectedUser?.id}`}
              </p>
            </div>

            {error && (
              <div className="mx-auto py-2.5 px-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-medium flex items-center gap-2 animate-bounce w-full max-w-[280px]">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* iPhone PIN Dots */}
            <div className="flex justify-center gap-4 my-6">
              {Array.from({ length: selectedUser?.pin.length || 3 }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-155 ${
                    idx < password.length
                      ? 'bg-apple-gray-800 border-apple-gray-800 scale-110 shadow-sm'
                      : 'bg-transparent border-[#86868b]'
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
                    className="w-16 h-16 rounded-full bg-white hover:bg-apple-gray-50 border border-apple-gray-100 shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center justify-center text-xl font-bold text-apple-gray-850 cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                
                {/* Back / Switch User button */}
                <button
                  type="button"
                  onClick={() => {
                    setPassword('');
                    setError(null);
                    setViewState(selectedUser?.role === 'admin' ? 'role-selection' : 'staff-selection');
                  }}
                  className="w-16 h-16 rounded-full bg-[#f5f5f7] hover:bg-apple-gray-50 border border-apple-gray-100/50 flex flex-col items-center justify-center text-[10px] font-bold text-[#86868b] hover:text-black transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4 mb-0.5" />
                  <span>Back</span>
                </button>

                {/* Number 0 */}
                <button
                  type="button"
                  onClick={() => handleKeyPress('0')}
                  className="w-16 h-16 rounded-full bg-white hover:bg-apple-gray-50 border border-apple-gray-100 shadow-sm hover:shadow-md active:scale-95 transition-all flex items-center justify-center text-xl font-bold text-apple-gray-850 cursor-pointer"
                >
                  0
                </button>

                {/* Backspace Button */}
                <button
                  type="button"
                  onClick={handleBackspace}
                  disabled={password.length === 0}
                  className="w-16 h-16 rounded-full bg-[#f5f5f7] hover:bg-apple-gray-50 border border-apple-gray-100/50 flex flex-col items-center justify-center text-[10px] font-bold text-[#86868b] hover:text-black transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="text-xs">Delete</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer / Info */}
      <div className="text-center text-xs text-apple-gray-300 z-10 font-medium">
        <div className="mt-2 text-apple-gray-355/60 font-light">
          Chapter One Cafe © 2026. All rights reserved.
        </div>
      </div>
    </div>
  );
};
