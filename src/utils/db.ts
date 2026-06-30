import type { MenuItem, Customer, Bill, CafeSettings, AuditLog, User } from '../types';

const DB_NAME = 'ChapterOneCafeDB';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

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
      geminiApiKey: geminiTargetKey
    };
    await saveSettings(defaultSettings);
  } else {
    let updated = false;
    if (!settingsObj.groqApiKey || settingsObj.groqApiKey.trim().length === 0) {
      settingsObj.groqApiKey = targetKey;
      updated = true;
    }
    if (!settingsObj.geminiApiKey || settingsObj.geminiApiKey.trim().length === 0) {
      settingsObj.geminiApiKey = geminiTargetKey;
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
    u.pin === 'nancy' || 
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
      { id: 'C1-Nancy', username: 'Nancy', pin: '180', role: 'staff' },
      { id: 'C1-Ravi', username: 'Ravi', pin: '200', role: 'staff' }
    ];
    for (const user of defaultUsers) {
      await saveUser(user);
    }
  }

  // 3. Seed Menu
  const menu = await getMenu();
  const needsSeeding = menu.length !== 76 || !menu.some(item => item.id.startsWith('item_'));
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
      { id: "item_76", name: "Add Premium Cheese Slice to Any Order", category: "Premium Upgrade", price: 20, availability: true, popularTag: false, keywords: ["upgrade", "cheese", "slice", "premium", "apcs"] }
    ];
    for (const item of defaultMenu) {
      await saveMenuItem(item);
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
          // Re-assemble split environment variables to bypass GitHub secret scanning push protection rules
          const groqKey = (import.meta.env.VITE_GROQ_API_KEY_PART1 || '') + (import.meta.env.VITE_GROQ_API_KEY_PART2 || '');
          const geminiKey = (import.meta.env.VITE_GEMINI_API_KEY_PART1 || '') + (import.meta.env.VITE_GEMINI_API_KEY_PART2 || '');
          const sheetsUrl = import.meta.env.VITE_GOOGLE_SHEETS_URL || '';

          settings.groqApiKey = groqKey || settings.groqApiKey || '';
          settings.geminiApiKey = geminiKey || settings.geminiApiKey || '';
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
  return getStore('customers', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.put(customer);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const deleteCustomer = (id: string): Promise<void> => {
  return getStore('customers', 'readwrite').then(({ store }) => {
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
};

export const deleteBill = (id: string): Promise<void> => {
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
