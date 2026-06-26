import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, 
  Download, 
  Upload, 
  History, 
  Trash2, 
  Check, 
  Sliders,
  DollarSign
} from 'lucide-react';
import type { CafeSettings, AuditLog, User } from '../types';
import { 
  getSettings, 
  saveSettings, 
  getAuditLogs, 
  clearAuditLogs, 
  exportBackupJSON, 
  importBackupJSON,
  saveAuditLog
} from '../utils/db';

interface SettingsProps {
  currentUser: User;
  onSettingsUpdate: (newSettings: CafeSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({
  currentUser,
  onSettingsUpdate
}) => {
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSettingsAndLogs = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      const logs = await getAuditLogs();
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  };

  useEffect(() => {
    loadSettingsAndLogs();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    try {
      await saveSettings(settings);
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'UPDATE_SETTINGS',
        `Updated cafe settings (GST: ${settings.gstPercentage}%, Basement hourly charge: ${settings.currency}${settings.basementHourlyRate})`
      );
      onSettingsUpdate(settings);
      showNotification('System settings updated successfully.');
      loadSettingsAndLogs();
    } catch (err) {
      alert('Failed to save settings.');
    }
  };

  const handleBackup = async () => {
    try {
      const backupStr = await exportBackupJSON();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(backupStr);
      const link = document.createElement('a');
      link.setAttribute('href', dataStr);
      link.setAttribute('download', `ChapterOneCafe_Backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'BACKUP_DATABASE',
        `Generated database backup JSON file.`
      );
      showNotification('JSON database backup exported.');
    } catch (err) {
      alert('Failed to generate backup.');
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm('Are you sure you want to restore the database from this backup? It will overwrite all current menu items, customer logs, settings, and transaction history.')) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonString = event.target?.result as string;
        await importBackupJSON(jsonString);
        
        await saveAuditLog(
          currentUser.id,
          currentUser.username,
          'RESTORE_DATABASE',
          `Restored database tables from backup file.`
        );
        showNotification('Database restored successfully! Reloading...');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        alert('Failed to restore database. Ensure the JSON file is valid.');
      }
    };
    reader.readAsText(file);
  };

  const handleClearAudits = async () => {
    if (!confirm('Are you sure you want to purge all system audit logs? This action is permanent.')) return;

    try {
      await clearAuditLogs();
      await saveAuditLog(
        currentUser.id,
        currentUser.username,
        'PURGE_AUDITS',
        `Purged audit log records.`
      );
      showNotification('Audit log database purged.');
      loadSettingsAndLogs();
    } catch (err) {
      alert('Failed to purge audit records.');
    }
  };

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  if (!settings) return null;

  return (
    <div className="space-y-6 select-none animate-fade-in">
      {/* Save Success overlay indicator */}
      {successMsg && (
        <div className="fixed top-24 right-8 bg-apple-gray-800 text-white text-xs font-semibold py-3 px-5 rounded-2xl shadow-apple-medium flex items-center gap-2.5 z-50 animate-bounce">
          <Check className="w-4 h-4 text-green-400" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid split */}
      <div className="grid grid-cols-3 gap-6 items-start">
        
        {/* Forms configuration (Left Col 2-span) */}
        <form onSubmit={handleSaveSettings} className="col-span-2 space-y-6">
          {/* Cafe Config details */}
          <div className="apple-card">
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#86868b]" />
              <span>Cafe Profile Parameters</span>
            </h4>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Cafe Name *</label>
                <input
                  type="text"
                  required
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  className="apple-input font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Contact Phone *</label>
                <input
                  type="text"
                  required
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="apple-input font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="font-bold text-[#86868b]">Physical Address *</label>
                <input
                  type="text"
                  required
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  className="apple-input font-medium"
                />
              </div>
            </div>
          </div>

          {/* Billing parameters configuration */}
          <div className="apple-card">
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#86868b]" />
              <span>Billing Rules & Rates</span>
            </h4>

            <div className="grid grid-cols-3 gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Basement Rate (₹/hr) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  value={settings.basementHourlyRate}
                  onChange={(e) => setSettings({ ...settings, basementHourlyRate: parseInt(e.target.value, 10) || 0 })}
                  className="apple-input font-mono font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">GST Tax Rate (%) *</label>
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  value={settings.gstPercentage}
                  onChange={(e) => setSettings({ ...settings, gstPercentage: parseFloat(e.target.value) || 0 })}
                  className="apple-input font-mono font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Currency Symbol *</label>
                <input
                  type="text"
                  required
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="apple-input text-center font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 text-xs mt-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Thermal Receipt Footer</label>
                <input
                  type="text"
                  value={settings.receiptFooter}
                  onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
                  className="apple-input font-medium"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Google Sheets Web App Sync URL</label>
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={settings.googleSheetsUrl || ''}
                  onChange={(e) => setSettings({ ...settings, googleSheetsUrl: e.target.value })}
                  className="apple-input font-medium"
                />
                <span className="text-[10px] text-[#86868b] font-light leading-relaxed">
                  Enter your Google Apps Script Web App Deployment URL. All Check-ins, Check-outs, and Audits will sync automatically in the background.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Groq Cloud API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder="gsk_..."
                    value={settings.groqApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, groqApiKey: e.target.value })}
                    className="apple-input font-mono w-full pr-12 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#86868b] hover:text-black cursor-pointer"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
                <span className="text-[10px] text-[#86868b] font-light leading-relaxed">
                  Enter your Groq Cloud API Key to enable AI-personalized WhatsApp receipt messages. Leave blank to use static receipts.
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="apple-btn-primary py-3 w-full flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Commit System Configurations</span>
          </button>
        </form>

        {/* Database backup logs & audits panel (Right Col) */}
        <div className="space-y-6">
          {/* Backup Restore Panel */}
          <div className="apple-card">
            <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Download className="w-4 h-4 text-[#86868b]" />
              <span>Database Operations</span>
            </h4>

            <p className="text-[10px] text-apple-gray-300 font-light leading-relaxed mb-4">
              Export copy backups to JSON files or restore previous catalog logs and invoice archives.
            </p>

            <div className="space-y-3.5">
              <button
                type="button"
                onClick={handleBackup}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-apple-gray-50 hover:bg-apple-gray-100/60 text-apple-gray-800 font-semibold border border-apple-gray-100 rounded-xl transition-apple text-xs cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-apple-gray-800" />
                  <span>Download Backup File</span>
                </div>
                <span className="text-[9px] text-[#86868b] font-mono">.json</span>
              </button>

              <button
                type="button"
                onClick={handleRestoreClick}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-apple-gray-50 hover:bg-apple-gray-100/60 text-apple-gray-800 font-semibold border border-apple-gray-100 rounded-xl transition-apple text-xs cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-apple-gray-800" />
                  <span>Restore Data from Backup</span>
                </div>
                <span className="text-[9px] text-[#86868b] font-mono">Upload</span>
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestoreFile}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>

          {/* Audit Trail quick snapshot */}
          <div className="apple-card">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider flex items-center gap-2">
                <History className="w-4 h-4 text-[#86868b]" />
                <span>Audit Logs Trail</span>
              </h4>

              {auditLogs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAudits}
                  className="p-1 rounded text-red-500 hover:bg-red-50 hover:border-red-100 cursor-pointer"
                  title="Clear All Audit Trail Records"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-3.5 overflow-y-auto max-h-[160px] pr-1 no-scrollbar">
              {auditLogs.length === 0 ? (
                <div className="text-[10px] text-center text-apple-gray-300 py-10 font-light italic">
                  No system audits logged.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="text-[10px] leading-relaxed pb-2.5 border-b border-apple-gray-50 last:border-0 last:pb-0">
                    <div className="flex justify-between text-apple-gray-300 font-semibold">
                      <span>{log.username} ({log.action})</span>
                      <span className="font-mono text-[9px]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-apple-gray-800 mt-1 font-light">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
