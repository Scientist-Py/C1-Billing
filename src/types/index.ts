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
}

export interface AuditLog {
  id: string;
  timestamp: string; // ISO String
  userId: string;
  username: string;
  action: string;
  details: string;
}
