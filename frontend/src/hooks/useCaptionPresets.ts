import { useState, useEffect, useCallback } from 'react';
import { CustomPreset, CaptionOverrides } from '../types/caption';

const STORAGE_KEY = 'syncframe_custom_caption_presets';

function getStoredPresets(): CustomPreset[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to load custom presets from localStorage', e);
    return [];
  }
}

function setStoredPresets(presets: CustomPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    // Dispatch a custom event so other components can sync
    window.dispatchEvent(new Event('syncframe:presets:changed'));
  } catch (e) {
    console.error('Failed to save custom presets to localStorage', e);
  }
}

export function useCaptionPresets() {
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>(getStoredPresets);

  useEffect(() => {
    const handleSync = () => {
      setCustomPresets(getStoredPresets());
    };
    window.addEventListener('syncframe:presets:changed', handleSync);
    return () => window.removeEventListener('syncframe:presets:changed', handleSync);
  }, []);

  const saveAsNew = useCallback((
    name: string,
    category: string,
    basePreset: string,
    overrides: CaptionOverrides
  ) => {
    const newPreset: CustomPreset = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      category,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      basePreset,
      overrides,
      schemaVersion: 1
    };

    const current = getStoredPresets();
    setStoredPresets([...current, newPreset]);
    return newPreset;
  }, []);

  const updatePreset = useCallback((id: string, name: string, overrides: CaptionOverrides) => {
    const current = getStoredPresets();
    const updated = current.map(p =>
      p.id === id
        ? { ...p, name, overrides, updatedAt: new Date().toISOString() }
        : p
    );
    setStoredPresets(updated);
  }, []);

  const renamePreset = useCallback((id: string, name: string) => {
    const current = getStoredPresets();
    const updated = current.map(p =>
      p.id === id
        ? { ...p, name, updatedAt: new Date().toISOString() }
        : p
    );
    setStoredPresets(updated);
  }, []);

  const duplicatePreset = useCallback((id: string) => {
    const current = getStoredPresets();
    const existing = current.find(p => p.id === id);
    if (!existing) return null;

    const newPreset: CustomPreset = {
      ...existing,
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${existing.name} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setStoredPresets([...current, newPreset]);
    return newPreset;
  }, []);

  const deletePreset = useCallback((id: string) => {
    const current = getStoredPresets();
    const updated = current.filter(p => p.id !== id);
    setStoredPresets(updated);
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    const current = getStoredPresets();
    const updated = current.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p);
    setStoredPresets(updated);
  }, []);

  return {
    customPresets,
    saveAsNew,
    updatePreset,
    renamePreset,
    duplicatePreset,
    deletePreset,
    toggleFavorite
  };
}
