import { useState, useEffect, useCallback } from 'react';

export function useLocalStorage(key, initialValue) {
  const readValue = useCallback(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`useLocalStorage: failed to read "${key}"`, error);
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState(readValue);

  const setValue = useCallback((value) => {
    setStoredValue((prev) => {
      const valueToStore = value instanceof Function ? value(prev) : value;
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`useLocalStorage: failed to write "${key}"`, error);
      }
      return valueToStore;
    });
  }, [key]);

  // Keep state in sync when the same key changes in another tab/window.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (e) => {
      if (e.key !== key) return;
      try {
        setStoredValue(e.newValue ? JSON.parse(e.newValue) : initialValue);
      } catch {
        setStoredValue(initialValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, initialValue]);

  return [storedValue, setValue];
}
