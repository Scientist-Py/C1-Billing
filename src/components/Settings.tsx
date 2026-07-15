import React, { useState, useEffect, useRef } from 'react';
import { 
  Save, 
  Download, 
  Upload, 
  History, 
  Trash2, 
  Check, 
  Sliders,
  DollarSign,
  MessageCircle,
  Wifi,
  WifiOff,
  Send,
  ShieldCheck,
  Clipboard
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [waTestPhone, setWaTestPhone] = useState('');
  const [waConnStatus, setWaConnStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [waConnMsg, setWaConnMsg] = useState('');

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

  const handleTestCRMConnection = async () => {
    if (!settings) return;
    const url = settings.crmScriptUrl?.trim();
    if (!url) {
      setWaConnStatus('error');
      setWaConnMsg('CRM Script URL is empty. Please paste your Google Apps Script Web App URL.');
      return;
    }
    setWaConnStatus('loading');
    setWaConnMsg('Connecting to CRM Spreadsheet...');
    try {
      const res = await fetch(`${url}?action=GET_PROFILES`);
      if (res.ok) {
        setWaConnStatus('ok');
        setWaConnMsg('CRM Spreadsheet connected successfully!');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setWaConnStatus('error');
      setWaConnMsg(`Connection failed: ${err.message}`);
    }
  };

  const handleSendTestInvoice = async () => {
    if (!settings) return;
    const phone = waTestPhone.trim();
    if (!phone) {
      alert('Please enter a phone number to send the test invoice to.');
      return;
    }
    const token = settings.waAccessToken?.trim();
    const phoneId = settings.waPhoneNumberId?.trim();
    const template = settings.waTemplateName?.trim() || 'invoice_receipt';
    const lang = settings.waLanguage?.trim() || 'en';
    if (!token || !phoneId) {
      alert('Please fill in the Access Token and Phone Number ID before sending a test.');
      return;
    }
    try {
      const { generateReceiptPDFBlob } = await import('../utils/pdfGenerator');
      const { uploadPDFToMeta, sendWhatsAppTemplate } = await import('../utils/whatsappCloud');

      // Create a mockup bill to generate a valid PDF
      const dummyBill = {
        id: 'test_invoice_id',
        billNumber: 'TEST-001',
        date: new Date().toISOString(),
        entryTime: new Date().toISOString(),
        exitTime: new Date().toISOString(),
        customerName: 'Test Customer',
        customerPhone: phone,
        location: 'Test Section',
        orderedItems: [
          { name: 'Delicious Coffee', price: 100, quantity: 2, category: 'Beverages' }
        ],
        subtotal: 200,
        discount: 0,
        extraCharges: 0,
        tax: 10,
        grandTotal: 210,
        paymentMethod: 'Cash',
        status: 'Paid',
        cashierName: 'Admin',
        cashierId: 'admin_id'
      };

      // 1. Generate test PDF Blob
      const pdfBlob = await generateReceiptPDFBlob(dummyBill as any, settings);

      // 2. Upload PDF to Meta to get the media ID
      const mediaId = await uploadPDFToMeta(pdfBlob, token, phoneId);

      // 3. Send WhatsApp Template with the media ID included
      const res = await sendWhatsAppTemplate({
        phoneNumberId: phoneId,
        accessToken: token,
        to: phone,
        templateName: template,
        languageCode: lang,
        mediaId,
        bodyParams: [
          { type: 'text', text: 'Test Customer' },
          { type: 'text', text: 'TEST-001' },
          { type: 'text', text: '₹210.00' },
        ],
      });
      alert(`✅ Test invoice sent successfully with PDF! Message ID: ${res.messageId}`);
    } catch (err: any) {
      alert(`❌ Failed to send test invoice: ${err.message}`);
    }
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

              <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-start gap-3 mt-2">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 shrink-0 text-sm font-bold">
                  ✓
                </div>
                <div>
                  <h4 className="text-xs font-bold text-green-800">System Credentials Locked</h4>
                  <p className="text-[10px] text-green-600 mt-0.5 leading-relaxed">
                    Google Sheets sync endpoints, Groq LLM API authorization keys, and Gemini Audio voice engines are locked and running securely from server environment variables.
                  </p>
                </div>
              </div>
            </div>
          </div>

        {/* WhatsApp Cloud API & CRM Section */}
        <div className="apple-card space-y-5">
          <h4 className="text-xs font-bold text-apple-gray-300 uppercase tracking-wider flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-green-500" />
            <span>WhatsApp Cloud API &amp; CRM</span>
          </h4>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="font-bold text-[#86868b]">CRM Spreadsheet Web App URL</label>
              <input
                type="url"
                placeholder="https://script.google.com/macros/s/YOUR_CRM_SCRIPT_ID/exec"
                value={settings.crmScriptUrl || ''}
                onChange={(e) => setSettings({ ...settings, crmScriptUrl: e.target.value })}
                className="apple-input font-mono text-[10px]"
              />
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleTestCRMConnection}
                  disabled={waConnStatus === 'loading'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-apple-gray-50 hover:bg-apple-gray-100 border border-apple-gray-200 rounded-lg text-[10px] font-bold text-apple-gray-800 transition-apple cursor-pointer disabled:opacity-50"
                >
                  {waConnStatus === 'loading' ? (
                    <span className="animate-spin">⟳</span>
                  ) : waConnStatus === 'ok' ? (
                    <Wifi className="w-3 h-3 text-green-500" />
                  ) : waConnStatus === 'error' ? (
                    <WifiOff className="w-3 h-3 text-red-500" />
                  ) : (
                    <Wifi className="w-3 h-3" />
                  )}
                  Test CRM Connection
                </button>
                {waConnMsg && (
                  <span className={`text-[9px] font-medium ${waConnStatus === 'ok' ? 'text-green-600' : 'text-red-500'}`}>
                    {waConnMsg}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="font-bold text-[#86868b]">WhatsApp Access Token</label>
              <input
                type="password"
                placeholder="Your Meta permanent/temporary access token"
                value={settings.waAccessToken || ''}
                onChange={(e) => setSettings({ ...settings, waAccessToken: e.target.value })}
                className="apple-input font-mono text-[10px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-[#86868b]">Phone Number ID</label>
              <input
                type="text"
                placeholder="e.g. 123456789012345"
                value={settings.waPhoneNumberId || ''}
                onChange={(e) => setSettings({ ...settings, waPhoneNumberId: e.target.value })}
                className="apple-input font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-[#86868b]">WABA ID</label>
              <input
                type="text"
                placeholder="e.g. 987654321098765"
                value={settings.waWabaId || ''}
                onChange={(e) => setSettings({ ...settings, waWabaId: e.target.value })}
                className="apple-input font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-[#86868b]">Template Name</label>
              <input
                type="text"
                placeholder="invoice_receipt"
                value={settings.waTemplateName || ''}
                onChange={(e) => setSettings({ ...settings, waTemplateName: e.target.value })}
                className="apple-input font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-bold text-[#86868b]">Language Code</label>
              <input
                type="text"
                placeholder="en"
                value={settings.waLanguage || ''}
                onChange={(e) => setSettings({ ...settings, waLanguage: e.target.value })}
                className="apple-input font-mono"
              />
            </div>
          </div>

          {/* Review Automation Section */}
          <div className="border-t border-apple-gray-100/60 pt-4 mt-1 space-y-4">
            <h5 className="text-[10px] font-bold text-apple-gray-300 uppercase tracking-wider">
              Review Automation
            </h5>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="flex justify-between items-center bg-[#f5f5f7] p-2.5 rounded-2xl border border-apple-gray-100 col-span-2">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-apple-gray-800 text-xs">Enable Automatic Review</span>
                  <span className="text-[9px] text-[#86868b]">Send review template automatically after checkout</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, reviewEnableAuto: !settings.reviewEnableAuto })}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.reviewEnableAuto ? 'bg-green-500' : 'bg-apple-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.reviewEnableAuto ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Delay Before Sending (Minutes)</label>
                <input
                  type="number"
                  min="1"
                  value={settings.reviewDelayMinutes ?? 10}
                  onChange={(e) => setSettings({ ...settings, reviewDelayMinutes: parseInt(e.target.value, 10) || 10 })}
                  className="apple-input font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-bold text-[#86868b]">Review Template Name</label>
                <input
                  type="text"
                  placeholder="google_review_request"
                  value={settings.reviewTemplateName || 'google_review_request'}
                  onChange={(e) => setSettings({ ...settings, reviewTemplateName: e.target.value })}
                  className="apple-input font-mono"
                />
              </div>

              <div className="flex justify-between items-center bg-[#f5f5f7] p-2.5 rounded-2xl border border-apple-gray-100">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-apple-gray-800 text-[10px]">Review Scheduler Enabled</span>
                  <span className="text-[9px] text-[#86868b]">Run scheduler background job</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, reviewSchedulerEnabled: settings.reviewSchedulerEnabled === false ? true : false })}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.reviewSchedulerEnabled !== false ? 'bg-green-500' : 'bg-apple-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.reviewSchedulerEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-between items-center bg-[#f5f5f7] p-2.5 rounded-2xl border border-apple-gray-100">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-apple-gray-800 text-[10px]">Review Retry Enabled</span>
                  <span className="text-[9px] text-[#86868b]">Auto retry failed reviews</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, reviewRetryEnabled: settings.reviewRetryEnabled === false ? true : false })}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    settings.reviewRetryEnabled !== false ? 'bg-green-500' : 'bg-apple-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      settings.reviewRetryEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Webhook verify token */}
          <div className="p-3 bg-[#f5f5f7] rounded-2xl border border-apple-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-apple-blue-500" />
              <span className="text-[10px] font-bold text-apple-gray-800">Meta Webhook Verify Token</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[9px] font-mono bg-white border border-apple-gray-200 rounded-lg px-2 py-1.5 text-apple-gray-800 select-all">
                chapterone_crm_webhook_token
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText('chapterone_crm_webhook_token').then(() => showNotification('Token copied!'))}
                className="p-1.5 hover:bg-apple-gray-200 rounded-lg transition-apple cursor-pointer"
                title="Copy token"
              >
                <Clipboard className="w-3.5 h-3.5 text-[#86868b]" />
              </button>
            </div>
            <p className="text-[9px] text-[#86868b] leading-relaxed">
              Configure this exact token in your Meta Developer Console webhook settings. Point the callback URL to your CRM Script URL.
            </p>
          </div>

          {/* Send test invoice */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">Send Test Invoice</label>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="Enter phone number (e.g. 9876543210)"
                value={waTestPhone}
                onChange={(e) => setWaTestPhone(e.target.value)}
                className="apple-input flex-1 text-xs"
              />
              <button
                type="button"
                onClick={handleSendTestInvoice}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl text-[10px] font-bold shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <Send className="w-3 h-3" />
                Send Test
              </button>
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
