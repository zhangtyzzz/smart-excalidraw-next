'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useRef } from 'react';
import '@excalidraw/excalidraw/index.css';

// Dynamically import Excalidraw with no SSR
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

// Dynamically import convertToExcalidrawElements
const getConvertFunction = async () => {
  const excalidrawModule = await import('@excalidraw/excalidraw');
  return excalidrawModule.convertToExcalidrawElements;
};

const STORAGE_KEY = 'smart-excalidraw-storage';

export default function ExcalidrawCanvas({ elements, ...props }) {
  const [convertToExcalidrawElements, setConvertFunction] = useState(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const isLoadedRef = useRef(false);

  // Load convert function on mount
  useEffect(() => {
    getConvertFunction().then(fn => {
      setConvertFunction(() => fn);
    });
  }, []);

  // Load initial data from local storage
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        setInitialData({
          elements: parsedData.elements || [],
          appState: {
            ...parsedData.appState,
            viewBackgroundColor: parsedData.appState?.viewBackgroundColor || '#ffffff',
            currentItemFontFamily: parsedData.appState?.currentItemFontFamily || 1,
          }
        });
      } else {
        setInitialData({
          elements: [],
          appState: {
            viewBackgroundColor: '#ffffff',
            currentItemFontFamily: 1,
          }
        });
      }
      isLoadedRef.current = true;
    } catch (error) {
      console.error('Failed to load from storage:', error);
      setInitialData({
        elements: [],
        appState: {
          viewBackgroundColor: '#ffffff',
          currentItemFontFamily: 1,
        }
      });
      isLoadedRef.current = true;
    }
  }, []);

  // Handle new elements from AI
  useEffect(() => {
    if (!excalidrawAPI || !elements || elements.length === 0 || !convertToExcalidrawElements) {
      return;
    }

    try {
      // Sanitize elements: remove bindings to non-existent elements and invalid items
      // This is crucial for streaming where we might have an arrow before its target or incomplete objects
      const VALID_TYPES = new Set(['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'text', 'image', 'freedraw']);

      const validElements = elements.filter(el =>
        el &&
        typeof el === 'object' &&
        typeof el.type === 'string' &&
        VALID_TYPES.has(el.type.trim())
      );

      const elementIds = new Set(validElements.map(el => el.id));
      const sanitizedElements = validElements.map(el => {
        const newEl = { ...el };

        // Ensure type is always a string
        if (typeof newEl.type !== 'string') {
          newEl.type = 'rectangle'; // fallback
        }

        // Ensure text property is always a string if it exists
        if ('text' in newEl) {
          newEl.text = (newEl.text != null && newEl.text !== undefined) ? String(newEl.text) : '';
        }

        // Ensure color properties are strings if they exist
        if ('strokeColor' in newEl && typeof newEl.strokeColor !== 'string') {
          newEl.strokeColor = '#000000';
        }
        if ('backgroundColor' in newEl && typeof newEl.backgroundColor !== 'string') {
          newEl.backgroundColor = 'transparent';
        }
        if ('fillStyle' in newEl && typeof newEl.fillStyle !== 'string') {
          newEl.fillStyle = 'solid';
        }
        if ('strokeStyle' in newEl && typeof newEl.strokeStyle !== 'string') {
          newEl.strokeStyle = 'solid';
        }

        // Sanitize arrow bindings
        if (newEl.type === 'arrow') {
          // Check legacy/simple start/end objects
          if (newEl.start && newEl.start.id && !elementIds.has(newEl.start.id)) {
            delete newEl.start;
          }
          if (newEl.end && newEl.end.id && !elementIds.has(newEl.end.id)) {
            delete newEl.end;
          }

          // Check Excalidraw binding objects
          if (newEl.startBinding && newEl.startBinding.elementId && !elementIds.has(newEl.startBinding.elementId)) {
            delete newEl.startBinding;
          }
          if (newEl.endBinding && newEl.endBinding.elementId && !elementIds.has(newEl.endBinding.elementId)) {
            delete newEl.endBinding;
          }
        }
        return newEl;
      });

      if (sanitizedElements.length === 0) return;

      try {
        const converted = convertToExcalidrawElements(sanitizedElements);

        // Explicitly restore IDs from sanitizedElements to ensure stability
        // convertToExcalidrawElements might generate new IDs for simple objects, which causes duplicates during streaming
        const finalElements = converted.map((el, index) => ({
          ...el,
          id: (sanitizedElements[index] && sanitizedElements[index].id) || el.id
        }));

        excalidrawAPI.updateScene({
          elements: finalElements,
          appState: {
            ...excalidrawAPI.getAppState(),
          },
          commitToHistory: true,
        });

        // Removed auto-zoom during streaming to prevent flickering/jumping
        // The user can manually zoom/pan, or we can do it once at the end (but we don't know when it ends here)

      } catch (error) {
        console.warn('Failed to convert/update Excalidraw elements during streaming:', error);
        // Do not update scene if conversion fails to avoid blank screen/crashes
      }

    } catch (error) {
      console.error('Failed to update scene:', error);
    }
  }, [elements, convertToExcalidrawElements, excalidrawAPI]);

  const handleChange = (elements, appState, files) => {
    if (!isLoadedRef.current) return;

    // Debounce save could be good, but for now direct save is okay for simple usage
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          currentItemFontFamily: appState.currentItemFontFamily,
        },
        files
      }));
    } catch (error) {
      console.error('Failed to save to storage:', error);
    }
  };

  if (!initialData) {
    return <div className="w-full h-full flex items-center justify-center bg-gray-50">Loading...</div>;
  }

  return (
    <div className="w-full h-full">
      <Excalidraw
        excalidrawAPI={(api) => {
          setExcalidrawAPI(api);
          if (props.onAPIReady) {
            props.onAPIReady(api);
          }
        }}
        initialData={initialData}
        onChange={handleChange}
      />
    </div>
  );
}

