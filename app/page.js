'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Chat from '@/components/Chat';
import ConfigManager from '@/components/ConfigManager';
import ContactModal from '@/components/ContactModal';
import HistoryModal from '@/components/HistoryModal';
import AccessPasswordModal from '@/components/AccessPasswordModal';
import Notification from '@/components/Notification';
import { getConfig, isConfigValid } from '@/lib/config';
import { optimizeExcalidrawCode } from '@/lib/optimizeArrows';
import { historyManager } from '@/lib/history-manager';
import { repairJsonClosure } from '@/lib/json-repair';

// Dynamically import ExcalidrawCanvas to avoid SSR issues
const ExcalidrawCanvas = dynamic(() => import('@/components/ExcalidrawCanvas'), {
  ssr: false,
});

export default function Home() {
  const [config, setConfig] = useState(null);
  const [isConfigManagerOpen, setIsConfigManagerOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAccessPasswordModalOpen, setIsAccessPasswordModalOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [elements, setElements] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [notification, setNotification] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });
  const [messages, setMessages] = useState([]);
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const abortControllerRef = useRef(null);

  // ... (existing useEffects)

  // Post-process Excalidraw code: remove markdown wrappers, repair closures, and fix unescaped quotes
  const postProcessExcalidrawCode = (code) => {
    if (!code || typeof code !== 'string') return code;

    let processed = code.trim();

    // Step 1: Remove markdown code fence wrappers (```json, ```javascript, ```js, or just ```)
    processed = processed.replace(/^```(?:json|javascript|js)?\s*\n?/i, '');
    processed = processed.replace(/\n?```\s*$/, '');
    processed = processed.trim();

    // Step 1.5: Repair common JSON closure issues (missing quotes/brackets at end)
    processed = repairJsonClosure(processed);

    // Step 2: Fix unescaped double quotes within JSON string values
    try {
      JSON.parse(processed);
      return processed;
    } catch (e) {
      processed = fixUnescapedQuotes(processed);
      processed = repairJsonClosure(processed);
      return processed;
    }
  };

  // Helper function to fix unescaped quotes in JSON strings
  const fixUnescapedQuotes = (jsonString) => {
    let result = '';
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        result += char;
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        if (!inString) {
          inString = true;
          result += char;
        } else {
          const nextNonWhitespace = jsonString.slice(i + 1).match(/^\s*(.)/);
          const nextChar = nextNonWhitespace ? nextNonWhitespace[1] : '';
          if (nextChar === ':' || nextChar === ',' || nextChar === '}' || nextChar === ']' || nextChar === '') {
            inString = false;
            result += char;
          } else {
            result += '\\"';
          }
        }
      } else {
        result += char;
      }
    }
    return result;
  };

  // Try to parse and apply code to canvas
  const tryParseAndApply = (code) => {
    try {
      const cleanedCode = code.trim();
      const arrayMatch = cleanedCode.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        return; // Silent return if no array found yet
      }

      const parsed = JSON.parse(arrayMatch[0]);

      if (Array.isArray(parsed)) {
        // Valid Excalidraw element types
        const validTypes = ['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'text', 'freedraw', 'image', 'frame'];

        // Filter out incomplete or invalid elements
        const validElements = parsed.filter(el =>
          el &&
          typeof el === 'object' &&
          typeof el.type === 'string' &&
          validTypes.includes(el.type) && // Must be a valid complete type
          typeof el.x === 'number' && // Must have x coordinate
          typeof el.y === 'number'    // Must have y coordinate
        ).map((el, index) => {
          // Assign stable ID based on index if missing, to prevent duplicates during streaming
          if (!el.id) {
            return { ...el, id: `stream_${index}` };
          }
          return el;
        });

        if (validElements.length > 0) {
          setElements(validElements);
        }
      }
    } catch (error) {
      // Ignore parse errors during streaming
    }
  };

  // Handle stopping generation
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setMessages(prev => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'assistant' && newMessages[newMessages.length - 1].content === '...') {
          newMessages.pop(); // Remove loading indicator
        }
        return newMessages;
      });
      setNotification({
        isOpen: true,
        title: '已停止',
        message: '生成已停止',
        type: 'info'
      });
    }
  };

  // Handle sending a message (single-turn)
  const handleSendMessage = async (userMessage, files = [], image = null, chartType = 'auto') => {
    const usePassword = typeof window !== 'undefined' && localStorage.getItem('smart-excalidraw-use-password') === 'true';
    const accessPassword = typeof window !== 'undefined' ? localStorage.getItem('smart-excalidraw-access-password') : '';

    if ((!usePassword && !isConfigValid(config)) || (usePassword && !accessPassword)) {
      setNotification({
        isOpen: true,
        title: '配置提醒',
        message: usePassword ? '请先输入访问密码' : '请先配置您的 LLM 提供商或启用访问密码',
        type: 'warning'
      });
      if (usePassword) {
        setIsAccessPasswordModalOpen(true);
      } else {
        setIsConfigManagerOpen(true);
      }
      return;
    }

    // Handle object message (image upload)
    let messageText = userMessage;
    if (typeof userMessage === 'object') {
      messageText = userMessage.text || '';
    }

    // Update messages state - clear previous history and start fresh
    setMessages([
      { role: 'user', content: messageText },
      { role: 'assistant', content: '...' } // Loading state
    ]);

    setIsGenerating(true);
    setGeneratedCode('');

    // Create new AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (usePassword && accessPassword) {
        headers['x-access-password'] = accessPassword;
      }

      // Get current canvas state for context
      let context = null;
      if (excalidrawAPI) {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const selectedElementIds = Object.keys(appState.selectedElementIds || {}).filter(id => appState.selectedElementIds[id]);

        if (elements && elements.length > 0) {
          context = {
            elements: elements.map(el => ({
              id: el.id,
              type: el.type,
              roundness: el.roundness,
              seed: el.seed,
              version: el.version,
              versionNonce: el.versionNonce,
              isDeleted: el.isDeleted,
              boundElements: el.boundElements,
              updated: el.updated,
              link: el.link,
              locked: el.locked,
              text: el.text,
              fontSize: el.fontSize,
              fontFamily: el.fontFamily,
              textAlign: el.textAlign,
              verticalAlign: el.verticalAlign,
              containerId: el.containerId,
              startBinding: el.startBinding,
              endBinding: el.endBinding,
              startArrowhead: el.startArrowhead,
              endArrowhead: el.endArrowhead,
            })),
            selectedElementIds
          };
        }
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          config,
          userInput: messageText,
          chartType, // Use the argument, not the state
          files,
          image,
          context // Send context to backend
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        let errorMessage = 'Failed to generate code';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Could not parse error JSON
        }
        console.error('API Error:', errorMessage);
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedCode = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove 'data: ' prefix

            if (data === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulatedCode += parsed.content;

                // Update generated code state
                setGeneratedCode(accumulatedCode);

                // Try to parse and apply incrementally
                const processedChunk = postProcessExcalidrawCode(accumulatedCode);
                tryParseAndApply(processedChunk);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      // Final processing with arrow optimization
      const processedCode = postProcessExcalidrawCode(accumulatedCode);
      const optimizedCode = optimizeExcalidrawCode(processedCode);
      setGeneratedCode(optimizedCode);
      tryParseAndApply(optimizedCode);

      // Update assistant message with success
      setMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'assistant') {
          lastMsg.content = '图表已生成';
        }
        return newMessages;
      });

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Generation stopped by user');
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content = '已停止生成';
          }
          return newMessages;
        });
      } else {
        console.error('Error generating code:', error);
        setMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === 'assistant') {
            lastMsg.content = '生成出错，请重试';
          }
          return newMessages;
        });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };



  // Handle config selection from manager
  const handleConfigSelect = (selectedConfig) => {
    if (selectedConfig) {
      setConfig(selectedConfig);
    }
  };

  // Handle applying history
  const handleApplyHistory = (history) => {
    setGeneratedCode(history.generatedCode);
    tryParseAndApply(history.generatedCode);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Smart Excalidraw</h1>
            <p className="text-xs text-gray-500">AI 驱动的图表生成</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {(usePassword || (config && isConfigValid(config))) && (
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-green-50 rounded border border-green-300">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs text-green-900 font-medium">
                {usePassword ? '密码访问' : `${config.name || config.type} - ${config.model}`}
              </span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors duration-200"
            >
              历史记录
            </button>
            <button
              onClick={() => setIsAccessPasswordModalOpen(true)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors duration-200"
            >
              访问密码
            </button>
            <button
              onClick={() => setIsConfigManagerOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-gray-900 border border-gray-900 rounded hover:bg-gray-800 transition-colors duration-200"
            >
              管理配置
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Canvas - Full Screen */}
        <div className="absolute inset-0 z-0">
          <ExcalidrawCanvas
            elements={elements}
            onAPIReady={setExcalidrawAPI}
          />
        </div>

        {/* Floating Chat Interface */}
        <div className="absolute bottom-20 right-6 z-10">
          <Chat
            messages={messages}
            onSendMessage={handleSendMessage}
            onStop={handleStop}
            isGenerating={isGenerating}
          />
        </div>
      </div>

      {/* Config Manager Modal */}
      <ConfigManager
        isOpen={isConfigManagerOpen}
        onClose={() => setIsConfigManagerOpen(false)}
        onConfigSelect={handleConfigSelect}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        onApply={handleApplyHistory}
      />

      {/* Access Password Modal */}
      <AccessPasswordModal
        isOpen={isAccessPasswordModalOpen}
        onClose={() => setIsAccessPasswordModalOpen(false)}
      />

      {/* Contact Modal */}
      <ContactModal
        isOpen={isContactModalOpen}
        onClose={() => setIsContactModalOpen(false)}
      />

      {/* Notification */}
      <Notification
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        message={notification.message}
        type={notification.type}
      />
    </div>
  );
}
