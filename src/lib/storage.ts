// Storage utility for persisting After Date state with 8-hour expiry

interface StoredData<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

const STORAGE_EXPIRY_HOURS = 8;
const STORAGE_EXPIRY_MS = STORAGE_EXPIRY_HOURS * 60 * 60 * 1000; // 8 hours in milliseconds

export const saveToStorage = <T>(key: string, data: T): void => {
  try {
    const now = Date.now();
    const storedData: StoredData<T> = {
      data,
      timestamp: now,
      expiresAt: now + STORAGE_EXPIRY_MS
    };
    
    localStorage.setItem(key, JSON.stringify(storedData));
  } catch (error) {
    console.warn('Failed to save to localStorage:', error);
  }
};

export const loadFromStorage = <T>(key: string): T | null => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;

    const parsedData: StoredData<T> = JSON.parse(stored);
    const now = Date.now();

    // Check if data has expired
    if (now > parsedData.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }

    return parsedData.data;
  } catch (error) {
    console.warn('Failed to load from localStorage:', error);
    return null;
  }
};

export const clearExpiredStorage = (): void => {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    keys.forEach(key => {
      if (key.startsWith('after-date-')) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsedData: StoredData<any> = JSON.parse(stored);
            if (now > parsedData.expiresAt) {
              localStorage.removeItem(key);
            }
          }
        } catch (error) {
          // If parsing fails, remove the corrupted entry
          localStorage.removeItem(key);
        }
      }
    });
  } catch (error) {
    console.warn('Failed to clear expired storage:', error);
  }
};

// Storage keys
export const STORAGE_KEYS = {
  CURRENT_CARD: 'after-date-current-card',
  PEOPLE: 'after-date-people',
  ANSWERS: 'after-date-answers-v2'
} as const;
