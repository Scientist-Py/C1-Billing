import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, UserPlus, MapPin, Users, FileText } from 'lucide-react';
import type { Customer, SeatingLocation, Bill, OrderedItem } from '../types';
import { saveCustomer, saveAuditLog, syncToGoogleSheets, getBills, getActiveCustomers } from '../utils/db';

interface NewCustomerModalProps {
  onClose: () => void;
  onSuccess: (newCustomer: Customer) => void;
  currentUser: { id: string; username: string; role: string };
  preorderedItems?: OrderedItem[];
}

export const NewCustomerModal: React.FC<NewCustomerModalProps> = ({
  onClose,
  onSuccess,
  currentUser,
  preorderedItems
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState<SeatingLocation>('Main Hall');
  const [guests, setGuests] = useState<number>(1);
  const [notes, setNotes] = useState('');

  const [pastBills, setPastBills] = useState<Bill[]>([]);
  const [suggestions, setSuggestions] = useState<{ name: string; phone: string; visits: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getBills().then(setPastBills).catch(console.error);
  }, []);

  // Compute unique customer records from past bills
  const uniqueCustomers = useMemo(() => {
    const map = new Map<string, { name: string; phone: string; visits: number; latestExitTime: string }>();
    pastBills.forEach(b => {
      const key = b.customerPhone.trim();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.visits += 1;
        // Keep the name from the most recent visit
        if (new Date(b.exitTime).getTime() > new Date(existing.latestExitTime).getTime()) {
          existing.name = b.customerName;
          existing.latestExitTime = b.exitTime;
        }
      } else {
        map.set(key, { 
          name: b.customerName, 
          phone: b.customerPhone, 
          visits: 1, 
          latestExitTime: b.exitTime 
        });
      }
    });
    return Array.from(map.values()).map(({ name, phone, visits }) => ({ name, phone, visits }));
  }, [pastBills]);

  // Click outside suggestions list to close it
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handlePhoneChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    setPhone(cleaned);
    if (cleaned.trim().length >= 3) {
      const query = cleaned.toLowerCase();
      const filtered = uniqueCustomers.filter(
        c => c.phone.includes(query) || c.name.toLowerCase().includes(query)
      );
      setSuggestions(filtered.slice(0, 5));
      setShowSuggestions(true);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (cust: { name: string; phone: string }) => {
    setName(cust.name);
    setPhone(cust.phone);
    setShowSuggestions(false);
  };

  const matchedCustomer = useMemo(() => {
    if (!phone.trim()) return null;
    return uniqueCustomers.find(c => c.phone.trim() === phone.trim());
  }, [phone, uniqueCustomers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert('Please fill out Name and Phone fields.');
      return;
    }

    if (phone.trim().length < 10) {
      alert('Please enter a valid 10-digit phone number.');
      return;
    }

    // Check if customer with this phone number is already active
    try {
      const active = await getActiveCustomers();
      const duplicateActive = active.find(c => c.phone.trim() === phone.trim());
      if (duplicateActive) {
        alert(`Customer with phone number "${phone}" is already checked in (Sitting in ${duplicateActive.location}). Please check them out before checking them in again.`);
        return;
      }
    } catch (err) {
      console.warn('Failed to verify check-in collisions', err);
    }

    // Generate unique customer ID (C-#### format) avoiding active list collisions
    let randomId = Math.floor(1000 + Math.random() * 9000);
    try {
      const active = await getActiveCustomers();
      const activeIds = new Set(active.map(c => c.id));
      while (activeIds.has(`C-${randomId}`)) {
        randomId = Math.floor(1000 + Math.random() * 9000);
      }
    } catch (err) {
      console.warn('Failed to retrieve active customer list, using fallback collision check.', err);
    }

    const newCustomer: Customer = {
      id: `C-${randomId}`,
      name: name.trim(),
      phone: phone.trim(),
      location,
      numGuests: guests,
      notes: notes.trim(),
      entryTime: new Date().toISOString(),
      status: 'active',
      orderedItems: preorderedItems || [],
      cashierId: currentUser.id,
      cashierName: currentUser.username
    };

    try {
      await saveCustomer(newCustomer);
      // Synchronize in background to Google Sheets
      syncToGoogleSheets('CHECKIN', newCustomer);
      
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'CHECKIN_CUSTOMER',
        `Checked in customer: ${newCustomer.name} (ID: ${newCustomer.id}, Location: ${location}, Guests: ${guests})`
      );
      onSuccess(newCustomer);
    } catch (err) {
      alert('Failed to register customer entry.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm select-none">
      <div className="bg-white rounded-3xl border border-apple-gray-100 shadow-apple-medium w-full max-w-sm overflow-hidden animate-fade-in">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-apple-gray-50 border-b border-apple-gray-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-apple-gray-800 font-bold">
            <UserPlus className="w-4 h-4 text-apple-gray-800" />
            <h3 className="text-sm">Seating Check-in</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#86868b] hover:text-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Customer Phone */}
          <div className="flex flex-col gap-1.5 relative" ref={suggestionsRef}>
            <label className="font-bold text-[#86868b]">Phone Number *</label>
            <input
              type="tel"
              required
              placeholder="e.g. 9876543210"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className="apple-input font-mono"
              autoComplete="off"
            />
            {/* Suggestions list overlay */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-[52px] left-0 right-0 bg-white border border-apple-gray-100 rounded-xl shadow-apple-medium overflow-hidden z-20 p-1">
                {suggestions.map((s) => (
                  <button
                    key={s.phone}
                    type="button"
                    onClick={() => handleSelectSuggestion(s)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-apple-gray-50 flex justify-between items-center text-xs text-apple-gray-800 cursor-pointer transition-colors"
                  >
                    <div>
                      <span className="font-semibold block">{s.name}</span>
                      <span className="text-[10px] text-apple-gray-300 font-mono mt-0.5">{s.phone}</span>
                    </div>
                    <span className="text-[9px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      {s.visits} visits
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer Name */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-[#86868b]">Customer Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="apple-input"
            />
          </div>

          {/* Repeat Customer Status indicator */}
          {matchedCustomer && (
            <div className="text-[10px] text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-xl border border-green-100/80 flex items-center gap-1.5 animate-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              <span>Repeat Customer ({matchedCustomer.visits} visits)</span>
            </div>
          )}

          {/* Seating Location & Guests */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-[#86868b] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>Seating Area</span>
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value as SeatingLocation)}
                className="apple-input bg-apple-gray-50 text-apple-gray-800 font-semibold cursor-pointer"
              >
                <option value="Main Hall">Main Hall (No fee)</option>
                <option value="Basement">Basement (Timer)</option>
                <option value="Takeaway">Takeaway (No fee)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-[#86868b] flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>Guest Count</span>
              </label>
              <input
                type="number"
                min="1"
                required
                value={guests}
                onChange={(e) => setGuests(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="apple-input font-mono text-center"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="font-bold text-[#86868b] flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              <span>Notes (Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Needs window seat"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="apple-input"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full apple-btn-primary py-2.5 text-center mt-4"
          >
            Register Entry
          </button>
        </form>
      </div>
    </div>
  );
};
