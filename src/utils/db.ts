import type { MenuItem, Customer, Bill, CafeSettings, AuditLog, User, InventoryItem, InventoryLog, Expense, Campaign } from '../types';

const DB_NAME = 'ChapterOneCafeDB';
const DB_VERSION = 9;

let dbInstance: IDBDatabase | null = null;
const localEditTimes = new Map<string, number>();
class PersistedSyncExclusions {
  private key: string;
  private lifetime: number;

  constructor(key: string, lifetime: number = 3600000) {
    this.key = key;
    this.lifetime = lifetime;
  }

  private get(): Record<string, number> {
    try {
      const val = localStorage.getItem(this.key);
      return val ? JSON.parse(val) : {};
    } catch (e) {
      return {};
    }
  }

  private save(exclusions: Record<string, number>) {
    try {
      localStorage.setItem(this.key, JSON.stringify(exclusions));
    } catch (e) {}
  }

  add(id: string) {
    const data = this.get();
    data[id] = Date.now();
    this.save(data);
    return this;
  }

  has(id: string): boolean {
    const data = this.get();
    const timestamp = data[id];
    if (!timestamp) return false;
    if (Date.now() - timestamp > this.lifetime) {
      delete data[id];
      this.save(data);
      return false;
    }
    return true;
  }

  delete(id: string): boolean {
    const data = this.get();
    if (id in data) {
      delete data[id];
      this.save(data);
      return true;
    }
    return false;
  }

  clear() {
    this.save({});
  }

  get size(): number {
    return Array.from(this).length;
  }

  [Symbol.iterator]() {
    const data = this.get();
    const now = Date.now();
    const validIds = Object.entries(data)
      .filter(([_, ts]) => now - ts <= this.lifetime)
      .map(([id]) => id);
    return validIds[Symbol.iterator]();
  }

  values() {
    return this[Symbol.iterator]();
  }
}

const customerSyncExclusions = new PersistedSyncExclusions('pos_customer_exclusions');
const billSyncExclusions = new PersistedSyncExclusions('pos_bill_exclusions');
const inventorySyncExclusions = new PersistedSyncExclusions('pos_inventory_exclusions');
const expenseSyncExclusions = new PersistedSyncExclusions('pos_expense_exclusions');
const menuSyncExclusions = new PersistedSyncExclusions('pos_menu_exclusions');

export const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB database');
      reject(request.error);
    };

    request.onsuccess = () => {
      const db = request.result;
      dbInstance = db;

      // Run one-time migration/purge for a fresh system reset (v3)
      if (typeof window !== 'undefined' && !localStorage.getItem('pos_fresh_system_reset_v3')) {
        try {
          const transaction = db.transaction(['bills', 'customers', 'auditLogs'], 'readwrite');
          transaction.objectStore('bills').clear();
          transaction.objectStore('customers').clear();
          transaction.objectStore('auditLogs').clear();
          
          transaction.oncomplete = () => {
            localStorage.setItem('pos_fresh_system_reset_v3', 'true');
            console.log('POS system reset: cleared all test bills and transactions.');
            resolve(db);
          };
          transaction.onerror = () => {
            console.error('Failed to clear stores:', transaction.error);
            resolve(db);
          };
        } catch (err) {
          console.error('Failed to perform system reset:', err);
          resolve(db);
        }
      } else {
        resolve(db);
      }
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      // Create Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      // Create Menu store
      if (!db.objectStoreNames.contains('menu')) {
        db.createObjectStore('menu', { keyPath: 'id' });
      }

      // Create Customers (Active) store
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }

      // Create Bills (Checked out) store
      if (!db.objectStoreNames.contains('bills')) {
        const billStore = db.createObjectStore('bills', { keyPath: 'id' });
        billStore.createIndex('date', 'date', { unique: false });
        billStore.createIndex('customerPhone', 'customerPhone', { unique: false });
        billStore.createIndex('billNumber', 'billNumber', { unique: true });
      }

      // Create Audit Logs store
      if (!db.objectStoreNames.contains('auditLogs')) {
        db.createObjectStore('auditLogs', { keyPath: 'id' });
      }

      // Create Users store
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }

      // Create Inventory store
      if (!db.objectStoreNames.contains('inventory')) {
        db.createObjectStore('inventory', { keyPath: 'id' });
      }

      // Create Inventory Logs store
      if (!db.objectStoreNames.contains('inventoryLogs')) {
        db.createObjectStore('inventoryLogs', { keyPath: 'id' });
      }

      // Create Expenses store
      if (!db.objectStoreNames.contains('expenses')) {
        db.createObjectStore('expenses', { keyPath: 'id' });
      }

      // Create Sync Tasks store
      if (!db.objectStoreNames.contains('syncTasks')) {
        db.createObjectStore('syncTasks', { keyPath: 'id' });
      }

      // Create Scheduled Jobs store
      if (!db.objectStoreNames.contains('scheduledJobs')) {
        db.createObjectStore('scheduledJobs', { keyPath: 'id' });
      }

      // Create Campaigns store
      if (!db.objectStoreNames.contains('campaigns')) {
        db.createObjectStore('campaigns', { keyPath: 'id' });
      }
    };
  });
};

// Generic store operations helper
const getStore = (
  storeName: string,
  mode: IDBTransactionMode = 'readonly'
): Promise<{ store: IDBObjectStore; transaction: IDBTransaction }> => {
  return initDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return { store, transaction };
  });
};

// Seed Defaults
export const seedDefaultData = async () => {
  // 1. Seed Settings
  const settingsObj = await getSettings();
  const targetKey = '';
  // Safe base64 encoded API key configuration
  const geminiTargetKey = typeof window !== 'undefined' ? window.atob('QVEuQWI4Uk42SlRPSS1HSGFmaVVLeUdXNG84M296RGt4dDE0ajg2bWRQcmMxUnc1STcwWHc=') : '';

  if (!settingsObj) {
    const defaultSettings: CafeSettings = {
      name: 'Chapter One Cafe',
      address: '1st Floor, Near Central Park, Metro Lane, New Delhi',
      phone: '+91 98765 43210',
      gstPercentage: 5,
      basementHourlyRate: 200,
      currency: '₹',
      receiptFooter: 'Thank you for visiting Chapter One Cafe! Please come again.',
      whatsappTemplate: 'Hello {name}, thank you for dining with us! Your total bill is {amount}. Download details here: {link}',
      groqApiKey: targetKey,
      geminiApiKey: geminiTargetKey,
      reviewEnableAuto: false,
      reviewDelayMinutes: 10,
      reviewTemplateName: 'google_review_request',
      reviewSchedulerEnabled: true,
      reviewRetryEnabled: true,
      mobileAccessKey: '7770'
    };
    await saveSettings(defaultSettings);
  } else {
    let updated = false;
    if (!settingsObj.mobileAccessKey || settingsObj.mobileAccessKey === 'Ch1Pos@2026_SecureAccessKey!' || settingsObj.mobileAccessKey === 'C1Pos@2026_SecureKey24Ch') {
      settingsObj.mobileAccessKey = '7770';
      updated = true;
    }
    if (!settingsObj.groqApiKey || settingsObj.groqApiKey.trim().length === 0) {
      settingsObj.groqApiKey = targetKey;
      updated = true;
    }
    if (!settingsObj.geminiApiKey || settingsObj.geminiApiKey.trim().length === 0) {
      settingsObj.geminiApiKey = geminiTargetKey;
      updated = true;
    }
    if (settingsObj.reviewEnableAuto === undefined) {
      settingsObj.reviewEnableAuto = false;
      updated = true;
    }
    if (settingsObj.reviewDelayMinutes === undefined) {
      settingsObj.reviewDelayMinutes = 10;
      updated = true;
    }
    if (settingsObj.reviewTemplateName === undefined) {
      settingsObj.reviewTemplateName = 'google_review_request';
      updated = true;
    }
    if (settingsObj.reviewSchedulerEnabled === undefined) {
      settingsObj.reviewSchedulerEnabled = true;
      updated = true;
    }
    if (settingsObj.reviewRetryEnabled === undefined) {
      settingsObj.reviewRetryEnabled = true;
      updated = true;
    }
    if (updated) {
      await saveSettings(settingsObj);
    }
  }

  // 2. Seed Users
  const users = await getUsers();
  const hasOldUsers = users.some(u => 
    u.pin === '1111' || 
    u.username === 'Manager' || 
    u.id === 'u2' || 
    u.id === 'u1' || 
    u.pin === 'beer' || 
    u.pin === 'ravi'
  );
  if (users.length === 0 || hasOldUsers) {
    // Clear existing users first to ensure clean seed
    const { store } = await getStore('users', 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    const defaultUsers: User[] = [
      { id: 'ADMIN', username: 'Administrator', pin: '160', role: 'admin' },
      { id: 'C1-Ravi', username: 'Ravi', pin: '200', role: 'staff' }
    ];
    for (const user of defaultUsers) {
      await saveUser(user);
    }
  }

  // 3. Seed Menu
  const menu = await getMenu();
  const needsSeeding = menu.length < 77 || !menu.some(item => item.id.startsWith('item_'));
  if (needsSeeding) {
    // Clear existing menu items first
    const { store } = await getStore('menu', 'readwrite');
    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const defaultMenu: MenuItem[] = [
      { id: "item_1", name: "Chapter One Special Burger", category: "Chef's Express", price: 149, availability: true, popularTag: true, keywords: ["burger", "special", "chapter", "one", "express", "cosb"] },
      { id: "item_2", name: "Cheesy Paneer Sub", category: "Chef's Express", price: 149, availability: true, popularTag: false, keywords: ["sub", "paneer", "cheesy", "express", "cps"] },
      { id: "item_3", name: "Classic Cold Coffee", category: "Chef's Express", price: 99, availability: true, popularTag: true, keywords: ["coffee", "cold", "classic", "express", "ccc"] },
      { id: "item_4", name: "17-Inch Giant Pizza", category: "Grand Master Pizza", price: 900, availability: true, popularTag: true, keywords: ["pizza", "giant", "17", "inch", "grand", "master", "gmp"] },
      { id: "item_5", name: "Chapter One Special (SIG) - Regular", category: "Gourmet Crafted Pizzas", price: 229, availability: true, popularTag: true, keywords: ["pizza", "special", "chapter", "one", "sig", "regular"] },
      { id: "item_6", name: "Chapter One Special (SIG) - Medium", category: "Gourmet Crafted Pizzas", price: 379, availability: true, popularTag: true, keywords: ["pizza", "special", "chapter", "one", "sig", "medium"] },
      { id: "item_7", name: "Chapter One Special (SIG) - Large", category: "Gourmet Crafted Pizzas", price: 539, availability: true, popularTag: true, keywords: ["pizza", "special", "chapter", "one", "sig", "large"] },
      { id: "item_8", name: "Tandoori Paneer (POP) - Regular", category: "Gourmet Crafted Pizzas", price: 199, availability: true, popularTag: true, keywords: ["pizza", "tandoori", "paneer", "pop", "regular"] },
      { id: "item_9", name: "Tandoori Paneer (POP) - Medium", category: "Gourmet Crafted Pizzas", price: 349, availability: true, popularTag: true, keywords: ["pizza", "tandoori", "paneer", "pop", "medium"] },
      { id: "item_10", name: "Tandoori Paneer (POP) - Large", category: "Gourmet Crafted Pizzas", price: 519, availability: true, popularTag: true, keywords: ["pizza", "tandoori", "paneer", "pop", "large"] },
      { id: "item_11", name: "Farmhouse - Regular", category: "Gourmet Crafted Pizzas", price: 199, availability: true, popularTag: false, keywords: ["pizza", "farmhouse", "regular", "fh"] },
      { id: "item_12", name: "Farmhouse - Medium", category: "Gourmet Crafted Pizzas", price: 359, availability: true, popularTag: false, keywords: ["pizza", "farmhouse", "medium", "fh"] },
      { id: "item_13", name: "Farmhouse - Large", category: "Gourmet Crafted Pizzas", price: 529, availability: true, popularTag: false, keywords: ["pizza", "farmhouse", "large", "fh"] },
      { id: "item_14", name: "Mix Topping - Regular", category: "Gourmet Crafted Pizzas", price: 149, availability: true, popularTag: false, keywords: ["pizza", "mix", "topping", "regular", "mt"] },
      { id: "item_15", name: "Mix Topping - Medium", category: "Gourmet Crafted Pizzas", price: 249, availability: true, popularTag: false, keywords: ["pizza", "mix", "topping", "medium", "mt"] },
      { id: "item_16", name: "Mix Topping - Large", category: "Gourmet Crafted Pizzas", price: 389, availability: true, popularTag: false, keywords: ["pizza", "mix", "topping", "large", "mt"] },
      { id: "item_17", name: "Choice of Any Topping Pizza - Regular", category: "Gourmet Crafted Pizzas", price: 129, availability: true, popularTag: false, keywords: ["pizza", "choice", "topping", "regular", "cot"] },
      { id: "item_18", name: "Choice of Any Topping Pizza - Medium", category: "Gourmet Crafted Pizzas", price: 229, availability: true, popularTag: false, keywords: ["pizza", "choice", "topping", "medium", "cot"] },
      { id: "item_19", name: "Choice of Any Topping Pizza - Large", category: "Gourmet Crafted Pizzas", price: 389, availability: true, popularTag: false, keywords: ["pizza", "choice", "topping", "large", "cot"] },
      { id: "item_20", name: "Margherita - Regular", category: "Gourmet Crafted Pizzas", price: 109, availability: true, popularTag: false, keywords: ["pizza", "margherita", "regular", "marg"] },
      { id: "item_21", name: "Margherita - Medium", category: "Gourmet Crafted Pizzas", price: 229, availability: true, popularTag: false, keywords: ["pizza", "margherita", "medium", "marg"] },
      { id: "item_22", name: "Margherita - Large", category: "Gourmet Crafted Pizzas", price: 359, availability: true, popularTag: false, keywords: ["pizza", "margherita", "large", "marg"] },
      { id: "item_23", name: "Extra Cheese (Regular)", category: "Pizza Crust Upgrades", price: 40, availability: true, popularTag: false, keywords: ["upgrade", "cheese", "extra", "regular"] },
      { id: "item_24", name: "Extra Cheese (Medium)", category: "Pizza Crust Upgrades", price: 60, availability: true, popularTag: false, keywords: ["upgrade", "cheese", "extra", "medium"] },
      { id: "item_25", name: "Extra Cheese (Large)", category: "Pizza Crust Upgrades", price: 80, availability: true, popularTag: false, keywords: ["upgrade", "cheese", "extra", "large"] },
      { id: "item_26", name: "Chapter One Special Wheat Burger (SIG)", category: "Wheat Burgers", price: 149, availability: true, popularTag: true, keywords: ["burger", "wheat", "special", "chapter", "one", "sig"] },
      { id: "item_27", name: "Double Decker Wheat Burger (POP)", category: "Wheat Burgers", price: 139, availability: true, popularTag: true, keywords: ["burger", "wheat", "double", "decker", "pop"] },
      { id: "item_28", name: "Paneer Tikka Wheat Burger", category: "Wheat Burgers", price: 99, availability: true, popularTag: false, keywords: ["burger", "wheat", "paneer", "tikka"] },
      { id: "item_29", name: "Aloo Tikki Wheat Burger", category: "Wheat Burgers", price: 49, availability: true, popularTag: false, keywords: ["burger", "wheat", "aloo", "tikki"] },
      { id: "item_30", name: "Cheese Corn Wheat Burger", category: "Wheat Burgers", price: 79, availability: true, popularTag: false, keywords: ["burger", "wheat", "cheese", "corn"] },
      { id: "item_31", name: "Cheesy Paneer Sub (HIGH-T)", category: "Artisan Subs", price: 149, availability: true, popularTag: true, keywords: ["sub", "paneer", "cheesy", "high-t"] },
      { id: "item_32", name: "Cheesy American BBQ Sub", category: "Artisan Subs", price: 139, availability: true, popularTag: false, keywords: ["sub", "barbecue", "bbq", "american", "cheesy"] },
      { id: "item_33", name: "Potato Chilli Cheese Sub", category: "Artisan Subs", price: 99, availability: true, popularTag: false, keywords: ["sub", "potato", "chilli", "cheese"] },
      { id: "item_34", name: "Wheat Kurkure Paneer Momos (VIRAL)", category: "Wheat Momos (8 PCS)", price: 179, availability: true, popularTag: true, keywords: ["momos", "momo", "wheat", "kurkure", "paneer", "viral"] },
      { id: "item_35", name: "Wheat Paneer Steamed Momos", category: "Wheat Momos (8 PCS)", price: 139, availability: true, popularTag: false, keywords: ["momos", "momo", "wheat", "paneer", "steamed"] },
      { id: "item_36", name: "Wheat Veg Kurkure Momos", category: "Wheat Momos (8 PCS)", price: 139, availability: true, popularTag: false, keywords: ["momos", "momo", "wheat", "veg", "kurkure"] },
      { id: "item_37", name: "Wheat Veg Steamed Momos", category: "Wheat Momos (8 PCS)", price: 109, availability: true, popularTag: false, keywords: ["momos", "momo", "wheat", "veg", "steamed"] },
      { id: "item_38", name: "Alfredo White Sauce Pasta", category: "Italian Pasta Bowls", price: 139, availability: true, popularTag: true, keywords: ["pasta", "alfredo", "white", "sauce"] },
      { id: "item_39", name: "Mama Rosa Mixed Sauce Pasta", category: "Italian Pasta Bowls", price: 139, availability: true, popularTag: false, keywords: ["pasta", "mama", "rosa", "mixed", "sauce"] },
      { id: "item_40", name: "Arrabiata Red Sauce Pasta", category: "Italian Pasta Bowls", price: 129, availability: true, popularTag: false, keywords: ["pasta", "arrabiata", "arabita", "red", "sauce"] },
      { id: "item_41", name: "Paneer Garlic Bread", category: "Garlic Breads & Pockets", price: 130, availability: true, popularTag: true, keywords: ["bread", "garlic", "paneer"] },
      { id: "item_42", name: "Calzone Pocket", category: "Garlic Breads & Pockets", price: 120, availability: true, popularTag: false, keywords: ["calzone", "pocket", "garlic"] },
      { id: "item_43", name: "Exotic Garlic Bread", category: "Garlic Breads & Pockets", price: 120, availability: true, popularTag: false, keywords: ["bread", "garlic", "exotic"] },
      { id: "item_44", name: "Cheese Garlic Bread", category: "Garlic Breads & Pockets", price: 110, availability: true, popularTag: false, keywords: ["bread", "garlic", "cheese"] },
      { id: "item_45", name: "Stuffed Garlic Bread", category: "Garlic Breads & Pockets", price: 110, availability: true, popularTag: false, keywords: ["bread", "garlic", "stuffed"] },
      { id: "item_46", name: "Tandoori Paneer Wrap", category: "Delicious Wraps", price: 129, availability: true, popularTag: true, keywords: ["wrap", "tandoori", "paneer"] },
      { id: "item_47", name: "Cheese Wrap", category: "Delicious Wraps", price: 99, availability: true, popularTag: false, keywords: ["wrap", "cheese"] },
      { id: "item_48", name: "Veg Wrap", category: "Delicious Wraps", price: 89, availability: true, popularTag: false, keywords: ["wrap", "veg"] },
      { id: "item_49", name: "Aloo Tikki Wrap", category: "Delicious Wraps", price: 70, availability: true, popularTag: false, keywords: ["wrap", "aloo", "tikki"] },
      { id: "item_50", name: "Banana Honey Peanut Sandwich (ELITE)", category: "Gourmet Sandwiches", price: 130, availability: true, popularTag: true, keywords: ["sandwich", "banana", "honey", "peanut", "elite", "bhp"] },
      { id: "item_51", name: "Tandoori Paneer Sandwich", category: "Gourmet Sandwiches", price: 120, availability: true, popularTag: false, keywords: ["sandwich", "tandoori", "paneer"] },
      { id: "item_52", name: "Cheese Corn Sandwich", category: "Gourmet Sandwiches", price: 99, availability: true, popularTag: false, keywords: ["sandwich", "cheese", "corn"] },
      { id: "item_53", name: "Green Apple Mojito", category: "Artisan Mocktails", price: 99, availability: true, popularTag: false, keywords: ["mojito", "mocktail", "green", "apple", "gam"] },
      { id: "item_54", name: "Blue Mojito", category: "Artisan Mocktails", price: 99, availability: true, popularTag: false, keywords: ["mojito", "mocktail", "blue", "bm"] },
      { id: "item_55", name: "Blueberry Mint Mojito", category: "Artisan Mocktails", price: 99, availability: true, popularTag: false, keywords: ["mojito", "mocktail", "blueberry", "mint", "bbm"] },
      { id: "item_56", name: "Double Colour Mojito", category: "Artisan Mocktails", price: 119, availability: true, popularTag: false, keywords: ["mojito", "mocktail", "double", "colour", "dcm"] },
      { id: "item_57", name: "Rainbow Fusion Mojito", category: "Artisan Mocktails", price: 129, availability: true, popularTag: false, keywords: ["mojito", "mocktail", "rainbow", "fusion", "rfm"] },
      { id: "item_58", name: "Chapter One Signature Mojito", category: "Artisan Mocktails", price: 149, availability: true, popularTag: true, keywords: ["mojito", "mocktail", "chapter", "one", "signature", "cosm"] },
      { id: "item_59", name: "KitKat Shake", category: "Ice Cream Shakes", price: 110, availability: true, popularTag: true, keywords: ["shake", "kitkat", "kks"] },
      { id: "item_60", name: "Strawberry Shake", category: "Ice Cream Shakes", price: 99, availability: true, popularTag: false, keywords: ["shake", "strawberry", "ss"] },
      { id: "item_61", name: "Oreo Shake", category: "Ice Cream Shakes", price: 99, availability: true, popularTag: false, keywords: ["shake", "oreo", "os"] },
      { id: "item_62", name: "Vanilla Shake", category: "Ice Cream Shakes", price: 99, availability: true, popularTag: false, keywords: ["shake", "vanilla", "vs"] },
      { id: "item_63", name: "Butterscotch Shake", category: "Ice Cream Shakes", price: 89, availability: true, popularTag: false, keywords: ["shake", "butterscotch", "bs"] },
      { id: "item_64", name: "Hazelnut Cold Coffee", category: "Cold Coffees & Sundaes", price: 110, availability: true, popularTag: false, keywords: ["coffee", "cold", "hazelnut", "hcc"] },
      { id: "item_65", name: "Classic Cold Coffee", category: "Cold Coffees & Sundaes", price: 99, availability: true, popularTag: true, keywords: ["coffee", "cold", "classic", "ccc"] },
      { id: "item_66", name: "Choco Brownie Sundae", category: "Cold Coffees & Sundaes", price: 99, availability: true, popularTag: false, keywords: ["sundae", "choco", "brownie", "cbs"] },
      { id: "item_67", name: "Chapter One Special Fries", category: "Crisp Fries", price: 99, availability: true, popularTag: true, keywords: ["fries", "french", "special", "chapter", "one", "cosf"] },
      { id: "item_68", name: "Peri Peri Fries", category: "Crisp Fries", price: 79, availability: true, popularTag: false, keywords: ["fries", "french", "peri", "ppf"] },
      { id: "item_69", name: "Salted French Fries", category: "Crisp Fries", price: 69, availability: true, popularTag: false, keywords: ["fries", "french", "salted", "sff"] },
      { id: "item_70", name: "Peri Peri Potato Tornado", category: "Potato Tornadoes", price: 89, availability: true, popularTag: false, keywords: ["tornado", "potato", "peri", "ppt"] },
      { id: "item_71", name: "Cheesy Potato Tornado", category: "Potato Tornadoes", price: 109, availability: true, popularTag: true, keywords: ["tornado", "potato", "cheesy", "cpt"] },
      { id: "item_72", name: "Snack Attack Bundle", category: "Curated Group Feasts", price: 239, availability: true, popularTag: false, keywords: ["feast", "bundle", "combo", "snack", "attack", "sab"] },
      { id: "item_73", name: "The Daily Crave Combo", category: "Curated Group Feasts", price: 189, availability: true, popularTag: false, keywords: ["feast", "bundle", "combo", "daily", "crave", "tdcc"] },
      { id: "item_74", name: "The Grand Family Box", category: "Curated Group Feasts", price: 449, availability: true, popularTag: false, keywords: ["feast", "bundle", "combo", "grand", "family", "tgfb"] },
      { id: "item_75", name: "Birthday Celebration Feast", category: "Curated Group Feasts", price: 1049, availability: true, popularTag: false, keywords: ["feast", "bundle", "combo", "birthday", "celebration", "bcf"] },
      { id: "item_76", name: "Add Premium Cheese Slice to Any Order", category: "Premium Upgrade", price: 20, availability: true, popularTag: false, keywords: ["upgrade", "cheese", "slice", "premium", "apcs"] },
      { id: "item_77", name: "Water Bottle", category: "Beverages", price: 20, availability: true, popularTag: false, keywords: ["water", "bottle", "beverages", "wb"] }
    ];
    for (const item of defaultMenu) {
      await saveMenuItem(item);
    }
  }

  // 4. Seed Inventory
  const currentInv = await getInventory();
  if (currentInv.length === 0) {
    const defaultInventory: InventoryItem[] = [
      { id: "inv_1", name: "Water Bottle", quantity: 50, unit: "Pcs", minStock: 10, lastUpdated: new Date().toISOString() },
      { id: "inv_2", name: "Cheese Slice", quantity: 120, unit: "Pcs", minStock: 20, lastUpdated: new Date().toISOString() },
      { id: "inv_3", name: "Pizza Cheese Pack", quantity: 30, unit: "Pcs", minStock: 5, lastUpdated: new Date().toISOString() },
      { id: "inv_4", name: "Burger Bun", quantity: 80, unit: "Pcs", minStock: 15, lastUpdated: new Date().toISOString() },
      { id: "inv_5", name: "Coffee Beans", quantity: 10, unit: "Kg", minStock: 2, lastUpdated: new Date().toISOString() }
    ];
    for (const item of defaultInventory) {
      await saveInventoryItem(item);
      await addInventoryLog({
        id: `invlog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        itemId: item.id,
        itemName: item.name,
        quantityAdjusted: item.quantity,
        type: 'restock',
        reason: 'Initial Seeding Stock',
        timestamp: new Date().toISOString(),
        user: 'System'
      });
    }
  }
};

// === SETTINGS ACTIONS ===
export const getSettings = (): Promise<CafeSettings | null> => {
  return getStore('settings').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.get('cafe_settings');
      request.onsuccess = () => {
        if (request.result && request.result.value) {
          const settings = request.result.value;
          const groqKey = import.meta.env.VITE_GROQ_API_KEY || '';
          const sheetsUrl = import.meta.env.VITE_GOOGLE_SHEETS_URL || '';

          settings.groqApiKey = groqKey || settings.groqApiKey || '';
          settings.geminiApiKey = ''; // Disabled voice API keys
          settings.googleSheetsUrl = sheetsUrl || settings.googleSheetsUrl || '';
          resolve(settings);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveSettings = (settings: CafeSettings): Promise<void> => {
  return getStore('settings', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put({ key: 'cafe_settings', value: settings });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

// === USERS ACTIONS ===
export const getUsers = (): Promise<User[]> => {
  return getStore('users').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveUser = (user: User): Promise<void> => {
  return getStore('users', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(user);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const authenticatePin = async (pin: string): Promise<User | null> => {
  const users = await getUsers();
  const matched = users.find((u) => u.pin === pin);
  return matched || null;
};

// === INVENTORY ACTIONS ===
export const getInventory = (): Promise<InventoryItem[]> => {
  return getStore('inventory').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
};

export const getInventoryItem = (id: string): Promise<InventoryItem | null> => {
  return getStore('inventory').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveInventoryItem = (item: InventoryItem): Promise<void> => {
  localEditTimes.set(item.id, Date.now());
  return getStore('inventory', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const deleteInventoryItem = (id: string): Promise<void> => {
  inventorySyncExclusions.add(id);
  return getStore('inventory', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const getInventoryLogs = (): Promise<InventoryLog[]> => {
  return getStore('inventoryLogs').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const logs = request.result || [];
        // Sort newest logs first
        logs.sort((a: InventoryLog, b: InventoryLog) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(logs);
      };
      request.onerror = () => reject(request.error);
    });
  });
};

export const addInventoryLog = (log: InventoryLog): Promise<void> => {
  return getStore('inventoryLogs', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(log);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const adjustStock = async (
  itemId: string,
  quantityAdjusted: number,
  type: InventoryLog['type'],
  reason: string,
  user: string
): Promise<void> => {
  const item = await getInventoryItem(itemId);
  if (!item) throw new Error('Inventory item not found');

  item.quantity = Math.max(0, item.quantity + quantityAdjusted);
  item.lastUpdated = new Date().toISOString();
  await saveInventoryItem(item);

  const log: InventoryLog = {
    id: `invlog_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    itemId,
    itemName: item.name,
    quantityAdjusted,
    type,
    reason,
    timestamp: new Date().toISOString(),
    user
  };
  await addInventoryLog(log);

  // Sync state in background to Google Sheets
  syncToGoogleSheets('SAVE_INVENTORY', item);
  syncToGoogleSheets('LOG_INVENTORY', log);
};

// === EXPENSE ACTIONS ===
export const getExpenses = (): Promise<Expense[]> => {
  return getStore('expenses').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const list = request.result || [];
        // Sort newest first
        list.sort((a: Expense, b: Expense) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(list);
      };
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveExpense = (expense: Expense, localOnly = false): Promise<void> => {
  return getStore('expenses', 'readwrite').then(({ store, transaction }) => {
    return new Promise((resolve, reject) => {
      store.put(expense);
      transaction.oncomplete = () => {
        if (!localOnly) {
          localEditTimes.set(`expense_${expense.id}`, Date.now());
          syncToGoogleSheets('SAVE_EXPENSE', expense).catch(console.error);
        }
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  });
};

export const deleteExpense = (id: string): Promise<void> => {
  expenseSyncExclusions.add(id);
  return getStore('expenses', 'readwrite').then(({ store, transaction }) => {
    return new Promise((resolve, reject) => {
      store.delete(id);
      transaction.oncomplete = () => {
        syncToGoogleSheets('DELETE_EXPENSE', { id }).catch(console.error);
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  });
};

// === MENU ACTIONS ===
export const getMenu = (): Promise<MenuItem[]> => {
  return getStore('menu').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveMenuItem = (item: MenuItem): Promise<void> => {
  return getStore('menu', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const deleteMenuItem = (id: string): Promise<void> => {
  menuSyncExclusions.add(id);
  return getStore('menu', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

// === ACTIVE CUSTOMERS ACTIONS ===
export const getActiveCustomers = (): Promise<Customer[]> => {
  return getStore('customers').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const list = (request.result || []) as Customer[];
        resolve(list.filter((c) => c.status === 'active'));
      };
      request.onerror = () => reject(request.error);
    });
  });
};

export const getCustomer = (id: string): Promise<Customer | null> => {
  return getStore('customers').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveCustomer = (customer: Customer): Promise<void> => {
  localEditTimes.set(customer.id, Date.now());
  return getStore('customers', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(customer);
      request.onsuccess = () => {
        // Sync active customer orders and detail edits immediately to Google Sheets
        syncToGoogleSheets('CHECKIN', customer);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
};



export const deleteCustomer = async (id: string): Promise<void> => {
  // Immediately block this ID from being re-synced from remote
  customerSyncExclusions.add(id);

  try {
    const customer = await getCustomer(id);
    if (customer) {
      customer.status = 'deleted';
      await syncToGoogleSheets('DELETE_CUSTOMER', customer);
    }
  } catch (err) {
    console.warn('Failed to sync deleted customer state:', err);
  }

  return getStore('customers', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const deleteBill = (id: string): Promise<void> => {
  billSyncExclusions.add(id);
  return getStore('bills', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

// === BILLS ACTIONS ===
export const getBills = (): Promise<Bill[]> => {
  return getStore('bills').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
};

export const getBill = (id: string): Promise<Bill | null> => {
  return getStore('bills').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  });
};

// Shared Basement seating charge calculation helper
export const calculateBasementCharge = (
  entryTime: string | Date,
  exitTime: string | Date | number,
  hourlyRate: number
): number => {
  const exitMs = typeof exitTime === 'number' ? exitTime : new Date(exitTime).getTime();
  const elapsedMs = exitMs - new Date(entryTime).getTime();
  const elapsedMins = elapsedMs / (1000 * 60);
  if (elapsedMins <= 0) return 0;
  if (elapsedMins <= 60) {
    return hourlyRate;
  } else {
    const extraMins = elapsedMins - 60;
    const perMinRate = hourlyRate / 60;
    return hourlyRate + (extraMins * perMinRate);
  }
};

export const saveBill = (bill: Bill): Promise<string> => {
  return getStore('bills', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      // If it doesn't already have a valid bill number starting with 'B-', generate one atomically
      if (!bill.billNumber || !bill.billNumber.startsWith('B-')) {
        const getAllRequest = store.getAll();
        getAllRequest.onerror = () => reject(getAllRequest.error);
        getAllRequest.onsuccess = () => {
          const bills = getAllRequest.result || [];
          let maxNum = 1000;
          for (const b of bills) {
            const parts = b.billNumber.split('-');
            if (parts.length > 1) {
              const num = parseInt(parts[1], 10);
              if (!isNaN(num) && num > maxNum) {
                maxNum = num;
              }
            }
          }
          const nextNum = `B-${maxNum + 1}`;
          bill.billNumber = nextNum;
          
          const putRequest = store.put(bill);
          putRequest.onsuccess = () => resolve(nextNum);
          putRequest.onerror = () => reject(putRequest.error);
        };
      } else {
        const putRequest = store.put(bill);
        putRequest.onsuccess = () => resolve(bill.billNumber);
        putRequest.onerror = () => reject(putRequest.error);
      }
    });
  });
};

// Get next bill number (primarily for UI preview)
export const getNextBillNumber = async (): Promise<string> => {
  const bills = await getBills();
  if (bills.length === 0) return 'B-1001';
  
  // Find highest numerical suffix
  let maxNum = 1000;
  for (const b of bills) {
    const parts = b.billNumber.split('-');
    if (parts.length > 1) {
      const num = parseInt(parts[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `B-${maxNum + 1}`;
};

// === AUDIT LOG ACTIONS ===
export const getAuditLogs = (): Promise<AuditLog[]> => {
  return getStore('auditLogs').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const logs = request.result || [];
        // Sort descending by timestamp
        logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        resolve(logs);
      };
      request.onerror = () => reject(request.error);
    });
  });
};

export const saveAuditLog = (userId: string, username: string, action: string, details: string): Promise<void> => {
  const newLog: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    userId,
    username,
    action,
    details
  };
  // Asynchronously sync to Google Sheets
  syncToGoogleSheets('AUDIT', newLog);

  return getStore('auditLogs', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(newLog);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const clearAuditLogs = (): Promise<void> => {
  return getStore('auditLogs', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

// Backup Database
export const exportBackupJSON = async (): Promise<string> => {
  const settings = await getSettings();
  const menu = await getMenu();
  const customers = await getActiveCustomers();
  const bills = await getBills();
  const auditLogs = await getAuditLogs();
  const users = await getUsers();

  const backupData = {
    exportDate: new Date().toISOString(),
    settings,
    menu,
    customers,
    bills,
    auditLogs,
    users
  };

  return JSON.stringify(backupData, null, 2);
};

// Restore Database
export const importBackupJSON = async (jsonString: string): Promise<void> => {
  const data = JSON.parse(jsonString);
  
  if (data.settings) {
    await saveSettings(data.settings);
  }
  
  if (data.users && Array.isArray(data.users)) {
    const { store, transaction } = await getStore('users', 'readwrite');
    store.clear();
    for (const u of data.users) {
      store.put(u);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  if (data.menu && Array.isArray(data.menu)) {
    const { store, transaction } = await getStore('menu', 'readwrite');
    store.clear();
    for (const m of data.menu) {
      store.put(m);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  if (data.customers && Array.isArray(data.customers)) {
    const { store, transaction } = await getStore('customers', 'readwrite');
    store.clear();
    for (const c of data.customers) {
      store.put(c);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  if (data.bills && Array.isArray(data.bills)) {
    const { store, transaction } = await getStore('bills', 'readwrite');
    store.clear();
    for (const b of data.bills) {
      store.put(b);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  if (data.auditLogs && Array.isArray(data.auditLogs)) {
    const { store, transaction } = await getStore('auditLogs', 'readwrite');
    store.clear();
    for (const l of data.auditLogs) {
      store.put(l);
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
};


// Google Sheets Sync Helper
export const syncToGoogleSheets = async (action: string, payload: any): Promise<void> => {
  try {
    const settings = await getSettings();
    if (!settings || !settings.googleSheetsUrl) return;

    fetch(settings.googleSheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, payload }),
      keepalive: true
    }).catch((err) => {
      console.warn('Google Sheets background sync failed:', err);
    });
  } catch (err) {
    console.warn('Error in syncToGoogleSheets wrapper:', err);
  }
};

export const pullAndMergeFromGoogleSheets = async (selectedCustomerId?: string | null): Promise<{ success: boolean; message?: string }> => {
  const settings = await getSettings();
  if (!settings || !settings.googleSheetsUrl) {
    return { success: false, message: 'Google Sheets URL not configured' };
  }

  try {
    const sheetsUrl = settings.googleSheetsUrl;
    const separator = sheetsUrl.includes('?') ? '&' : '?';
    const cacheBusterUrl = `${sheetsUrl}${separator}_t=${Date.now()}`;
    const response = await fetch(cacheBusterUrl, {
      method: 'GET'
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || 'Sync failed on server');
    }

    const remoteCustomers = (result.customers || []) as Customer[];
    const remoteBills = (result.bills || []) as Bill[];

    // Filter out remote customers that are in the customerSyncExclusions set
    const filteredRemoteCustomers = remoteCustomers.filter(c => {
      if (customerSyncExclusions.has(c.id)) {
        return false;
      }
      return true;
    });

    // Clean up customerSyncExclusions for IDs that are no longer returned by the server
    const remoteCustomerIds = new Set(remoteCustomers.map(c => c.id));
    for (const excludedId of Array.from(customerSyncExclusions)) {
      if (!remoteCustomerIds.has(excludedId)) {
        customerSyncExclusions.delete(excludedId);
      }
    }

    // 1. Smart diff merge Active Customers (prevents overwriting pending local edits)
    await getStore('customers', 'readwrite').then(({ store }) => {
      return new Promise<void>((resolve, reject) => {
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const localCustomers = (getAllReq.result || []) as Customer[];
          
          // Build a map of remote customers by ID
          const remoteMap = new Map<string, Customer>();
          for (const c of filteredRemoteCustomers) {
            remoteMap.set(c.id, c);
          }
          
          const now = Date.now();
          const lockDuration = 120000; // 120 seconds (2 minutes) cooldown lock
          
          const toDelete: string[] = [];
          const toPut: Customer[] = [];
          
          for (const localCust of localCustomers) {
            const lastEdit = localEditTimes.get(localCust.id) || 0;
            const isLocked = ((now - lastEdit) < lockDuration) || (selectedCustomerId !== undefined && selectedCustomerId !== null && localCust.id === selectedCustomerId);
            
            if (isLocked) {
              // Local changes are locked; do not overwrite or delete
              remoteMap.delete(localCust.id);
              continue;
            }
            
            const remoteCust = remoteMap.get(localCust.id);
            if (!remoteCust) {
              // Not present on remote server and not locked locally
              // Only delete locally if it has already synced to Google Sheets in the past!
              // Otherwise, it's a new local check-in that hasn't synced yet; do not delete it!
              if (localCust.isSynced) {
                toDelete.push(localCust.id);
              }
            } else {
              // Present on remote server and not locked locally -> update with remote data
              // Mark as synced since it exists on the remote sheet
              remoteCust.isSynced = true;
              toPut.push(remoteCust);
              // Remove from remoteMap so we don't process it again
              remoteMap.delete(localCust.id);
            }
          }
          
          // Any remaining remote customers in remoteMap are new -> add them
          for (const remoteCust of remoteMap.values()) {
            remoteCust.isSynced = true; // since it comes from remote sheet
            toPut.push(remoteCust);
          }
          
          // Execute database updates
          let pendingOps = toDelete.length + toPut.length;
          if (pendingOps === 0) {
            resolve();
            return;
          }
          
          let hasFailed = false;
          const checkDone = () => {
            pendingOps--;
            if (pendingOps === 0 && !hasFailed) resolve();
          };
          
          for (const id of toDelete) {
            const delReq = store.delete(id);
            delReq.onsuccess = checkDone;
            delReq.onerror = () => {
              hasFailed = true;
              reject(delReq.error);
            };
          }
          
          for (const c of toPut) {
            const putReq = store.put(c);
            putReq.onsuccess = checkDone;
            putReq.onerror = () => {
              hasFailed = true;
              reject(putReq.error);
            };
          }
        };
        getAllReq.onerror = () => reject(getAllReq.error);
      });
    });

    // 2. Clear and merge Bills
    await getStore('bills', 'readwrite').then(({ store }) => {
      return new Promise<void>((resolve, reject) => {
        const clearReq = store.clear();
        clearReq.onsuccess = () => {
          // Clean up billSyncExclusions for IDs that are no longer returned by the server
          const remoteBillIds = new Set(remoteBills.map(b => b.id));
          for (const excludedId of Array.from(billSyncExclusions)) {
            if (!remoteBillIds.has(excludedId)) {
              billSyncExclusions.delete(excludedId);
            }
          }

          const filteredRemoteBills = remoteBills.filter(b => !billSyncExclusions.has(b.id));
          if (filteredRemoteBills.length === 0) {
            resolve();
            return;
          }
          let count = 0;
          let hasFailed = false;
          for (const b of filteredRemoteBills) {
            const req = store.put(b);
            req.onsuccess = () => {
              count++;
              if (count === filteredRemoteBills.length && !hasFailed) resolve();
            };
            req.onerror = () => {
              hasFailed = true;
              reject(req.error);
            };
          }
        };
        clearReq.onerror = () => reject(clearReq.error);
      });
    });

    // 3. Smart diff merge Inventory Items (prevents overwriting pending local edits)
    if (result.inventory && Array.isArray(result.inventory)) {
      const rawInventory = result.inventory as InventoryItem[];
      const remoteInventoryIds = new Set(rawInventory.map(item => item.id));
      for (const excludedId of Array.from(inventorySyncExclusions)) {
        if (!remoteInventoryIds.has(excludedId)) {
          inventorySyncExclusions.delete(excludedId);
        }
      }
      const remoteInventory = rawInventory.filter(item => !inventorySyncExclusions.has(item.id));
      await getStore('inventory', 'readwrite').then(({ store }) => {
        return new Promise<void>((resolve, reject) => {
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const localInventory = (getAllReq.result || []) as InventoryItem[];
            
            const remoteMap = new Map<string, InventoryItem>();
            for (const item of remoteInventory) {
              remoteMap.set(item.id, item);
            }
            
            const now = Date.now();
            const lockDuration = 20000; // 20 seconds cooldown lock
            
            const toDelete: string[] = [];
            const toPut: InventoryItem[] = [];
            
            for (const localItem of localInventory) {
              const lastEdit = localEditTimes.get(localItem.id) || 0;
              const isLocked = (now - lastEdit) < lockDuration;
              
              if (isLocked) {
                // Local changes are locked; do not overwrite or delete
                remoteMap.delete(localItem.id);
                continue;
              }
              
              const remoteItem = remoteMap.get(localItem.id);
              if (!remoteItem) {
                toDelete.push(localItem.id);
              } else {
                toPut.push(remoteItem);
                remoteMap.delete(localItem.id);
              }
            }
            
            for (const remoteItem of remoteMap.values()) {
              toPut.push(remoteItem);
            }
            
            let pendingOps = toDelete.length + toPut.length;
            if (pendingOps === 0) {
              resolve();
              return;
            }
            
            let hasFailed = false;
            const checkDone = () => {
              pendingOps--;
              if (pendingOps === 0 && !hasFailed) resolve();
            };
            
            for (const id of toDelete) {
              const delReq = store.delete(id);
              delReq.onsuccess = checkDone;
              delReq.onerror = () => {
                hasFailed = true;
                reject(delReq.error);
              };
            }
            
            for (const item of toPut) {
              const putReq = store.put(item);
              putReq.onsuccess = checkDone;
              putReq.onerror = () => {
                hasFailed = true;
                reject(putReq.error);
              };
            }
          };
          getAllReq.onerror = () => reject(getAllReq.error);
        });
      });
    }

    // 4. Clear and merge Inventory Logs
    if (result.inventoryLogs && Array.isArray(result.inventoryLogs)) {
      const remoteInventoryLogs = (result.inventoryLogs as InventoryLog[]).filter(log => !inventorySyncExclusions.has(log.id));
      await getStore('inventoryLogs', 'readwrite').then(({ store }) => {
        return new Promise<void>((resolve, reject) => {
          const clearReq = store.clear();
          clearReq.onsuccess = () => {
            if (remoteInventoryLogs.length === 0) {
              resolve();
              return;
            }
            let count = 0;
            let hasFailed = false;
            for (const log of remoteInventoryLogs) {
              const req = store.put(log);
              req.onsuccess = () => {
                count++;
                if (count === remoteInventoryLogs.length && !hasFailed) resolve();
              };
              req.onerror = () => {
                hasFailed = true;
                reject(req.error);
              };
            }
          };
          clearReq.onerror = () => reject(clearReq.error);
        });
      });
    }

    // 5. Smart diff merge Expenses (prevents overwriting pending local edits)
    if (result.expenses && Array.isArray(result.expenses)) {
      const rawExpenses = result.expenses as Expense[];
      const remoteExpenseIds = new Set(rawExpenses.map(item => item.id));
      for (const excludedId of Array.from(expenseSyncExclusions)) {
        if (!remoteExpenseIds.has(excludedId)) {
          expenseSyncExclusions.delete(excludedId);
        }
      }
      const remoteExpenses = rawExpenses.filter(item => !expenseSyncExclusions.has(item.id));
      await getStore('expenses', 'readwrite').then(({ store }) => {
        return new Promise<void>((resolve, reject) => {
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => {
            const localExpenses = (getAllReq.result || []) as Expense[];
            
            const remoteMap = new Map<string, Expense>();
            for (const item of remoteExpenses) {
              remoteMap.set(item.id, item);
            }
            
            const now = Date.now();
            const lockDuration = 20000; // 20 seconds cooldown lock
            
            const toDelete: string[] = [];
            const toPut: Expense[] = [];
            
            for (const localItem of localExpenses) {
              const lastEdit = localEditTimes.get(`expense_${localItem.id}`) || 0;
              const isLocked = (now - lastEdit) < lockDuration;
              
              if (isLocked) {
                remoteMap.delete(localItem.id);
                continue;
              }
              
              const remoteItem = remoteMap.get(localItem.id);
              if (!remoteItem) {
                toDelete.push(localItem.id);
              } else {
                toPut.push(remoteItem);
                remoteMap.delete(localItem.id);
              }
            }
            
            for (const remoteItem of remoteMap.values()) {
              toPut.push(remoteItem);
            }
            
            let pendingOps = toDelete.length + toPut.length;
            if (pendingOps === 0) {
              resolve();
              return;
            }
            
            let hasFailed = false;
            const checkDone = () => {
              pendingOps--;
              if (pendingOps === 0 && !hasFailed) resolve();
            };
            
            for (const id of toDelete) {
              const delReq = store.delete(id);
              delReq.onsuccess = checkDone;
              delReq.onerror = () => {
                hasFailed = true;
                reject(delReq.error);
              };
            }
            
            for (const item of toPut) {
              const putReq = store.put(item);
              putReq.onsuccess = checkDone;
              putReq.onerror = () => {
                hasFailed = true;
                reject(putReq.error);
              };
            }
          };
          getAllReq.onerror = () => reject(getAllReq.error);
        });
      });
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to pull and merge from Google Sheets:', err);
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
};

export const purgeAllData = async (): Promise<void> => {
  const storesToClear = ['customers', 'bills', 'auditLogs', 'inventory', 'inventoryLogs', 'expenses'];
  for (const storeName of storesToClear) {
    await new Promise<void>(async (resolveStore) => {
      try {
        const { store } = await getStore(storeName, 'readwrite');
        const req = store.clear();
        req.onsuccess = () => resolveStore();
        req.onerror = () => resolveStore();
      } catch {
        resolveStore();
      }
    });
  }

  // Trigger Google Sheets remote clear
  try {
    const settings = await getSettings();
    if (settings && settings.googleSheetsUrl) {
      await fetch(settings.googleSheetsUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'CLEAR_DATABASE', payload: {} }),
        keepalive: true
      });
    }
  } catch (err) {
    console.warn('Failed to clear remote Google Sheet:', err);
  }
};

export const getCampaigns = async (): Promise<Campaign[]> => {
  try {
    const { store } = await getStore('campaigns', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to get campaigns:', err);
    return [];
  }
};

export const saveCampaign = async (campaign: Campaign): Promise<void> => {
  const { store } = await getStore('campaigns', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.put(campaign);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteCampaign = async (id: string): Promise<void> => {
  const { store } = await getStore('campaigns', 'readwrite');
  return new Promise((resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};
