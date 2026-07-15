export type UserRole = 'admin' | 'manager' | 'staff';

export interface User {
  id: string;
  username: string;
  pin: string;
  role: UserRole;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  availability: boolean;
  image?: string;
  popularTag?: boolean;
  keywords: string[]; // e.g., ["cold", "coffee", "cc"]
}

export interface OrderedItem {
  id: string; // unique order item link
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
}

export type SeatingLocation = 'Main Hall' | 'Basement' | 'Takeaway';

export type CustomerStatus = 'active' | 'completed' | 'deleted';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  location: SeatingLocation;
  numGuests: number;
  notes: string;
  entryTime: string; // ISO String
  status: CustomerStatus;
  orderedItems: OrderedItem[];
  cashierId?: string;
  cashierName?: string;
  isSynced?: boolean;
}

export interface PaymentDetails {
  cashAmount?: number;
  upiAmount?: number;
  cardAmount?: number;
}

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Split';

export interface Bill {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  location: SeatingLocation;
  billNumber: string;
  date: string; // YYYY-MM-DD
  entryTime: string; // ISO String
  exitTime: string; // ISO String
  timeSpentMinutes: number;
  orderedItems: OrderedItem[];
  foodTotal: number;
  basementCharges: number;
  subtotal: number;
  discount: number;
  extraCharges: number;
  tax: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  paymentDetails?: PaymentDetails;
  status: 'Paid' | 'Pending';
  cashierName: string;
  cashierId?: string;
}

export interface CafeSettings {
  name: string;
  address: string;
  phone: string;
  gstPercentage: number;
  basementHourlyRate: number;
  currency: string;
  receiptFooter: string;
  whatsappTemplate: string;
  googleSheetsUrl?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  crmScriptUrl?: string;
  waAccessToken?: string;
  waPhoneNumberId?: string;
  waWabaId?: string;
  waTemplateName?: string;
  waLanguage?: string;
  waVerifyToken?: string;
  reviewEnableAuto?: boolean;
  reviewDelayMinutes?: number;
  reviewTemplateName?: string;
  reviewSchedulerEnabled?: boolean;
  reviewRetryEnabled?: boolean;
  mobileAccessKey?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string; // ISO String
  userId: string;
  username: string;
  action: string;
  details: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minStock: number;
  lastUpdated: string;
}

export interface InventoryLog {
  id: string;
  itemId: string;
  itemName: string;
  quantityAdjusted: number;
  type: 'restock' | 'consumption' | 'waste' | 'adjustment';
  reason: string;
  timestamp: string;
  user: string;
}

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD
  itemName: string;
  category: string; // e.g. Kitchen, Coffee Bar, Cleaning, Utilities, Other
  quantity: string; // e.g. 5 kg, 2 packets, 10 liters
  price: number;
  purchaser: string;
  notes?: string;
  timestamp: string; // ISO String
}

export interface CRMProfile {
  customerId: string;
  name: string;
  phone: string;
  visitCount: number;
  memberSince: string;
  lastVisit: string;
  totalLifetimeSpend: number;
  averageBill: number;
  favouriteItems: string[];
  favouriteCategory: string;
  recentOrders: string[];
  orderFrequency: string;
  whatsappHistory: any[];
  invoiceHistory: {
    billId: string;
    billNumber: string;
    grandTotal: number;
    date: string;
  }[];
  deliveryStatusHistory: any[];
  readStatus: string;
  googleReviewStatus: string;
  loyaltyPoints: number;
  tags: string[];
  customLabels: string[];
  notes?: string[];
}

export interface TimelineEvent {
  id: string;
  customerId: string;
  timestamp: string;
  type: 'created' | 'visited' | 'invoice_generated';
  description: string;
}

export interface LoyaltyTransaction {
  id: string;
  customerId: string;
  pointsAdded: number;
  pointsSubtracted: number;
  type: 'earn' | 'redeem' | 'birthday_bonus';
  reason: string;
  timestamp: string;
  billId?: string;
}

export interface SyncTask {
  id: string;
  type: 'CHECKIN' | 'CHECKOUT' | 'EXPENSE' | 'AUDIT' | 'CRM_UPSERT' | 'CRM_TIMELINE' | 'WHATSAPP_SEND';
  payload: any;
  timestamp: string;
  status: 'pending' | 'processing' | 'failed' | 'blocked';
  retryCount: number;
  lastError?: string;
}

export interface CampaignRecipient {
  name: string;
  phone: string;
  lifetimeSpend: number;
  visits: number;
  messageId?: string;
  deliveryStatus: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'blocked';
  failureReason?: string;
  timestamp?: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: string; // e.g. 'Marketing' | 'Birthday Offer' | 'Diwali Offer' etc.
  templateName: string; // 'coupon_offer'
  offerImage?: string; // local file blob base64 or URL
  mediaId?: string; // cached Meta media ID
  offerText: string;
  expiryDate: string;
  recipients: CampaignRecipient[];
  status: 'draft' | 'queued' | 'sending' | 'completed' | 'paused' | 'cancelled';
  metrics: {
    queued: number;
    sending: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    blocked: number;
  };
  startTime?: string;
  endTime?: string;
  duration?: number; // duration in seconds
}
