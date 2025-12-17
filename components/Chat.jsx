import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Image as ImageIcon, StopCircle, MessageSquare, X, Minimize2 } from 'lucide-react';
import { CHART_TYPES } from '../lib/constants';

export default function Chat({
  messages = [],
  onSendMessage,
  onStop,
  isGenerating
}) {
  const [isOpen, setIsOpen] = useState(false); // State for floating chat visibility
  const [input, setInput] = useState('');
  const [chartType, setChartType] = useState('auto');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSend = () => {
    if ((!input.trim() && !selectedFile && !selectedImage) || isGenerating) return;

    // Prepare files array
    const files = [];
    if (selectedFile) {
      files.push(selectedFile);
    }

    onSendMessage(input, files, selectedImage, chartType);

    // Clear input after sending
    setInput('');
    setSelectedFile(null);
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('文件大小不能超过 1MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedFile({
          name: file.name,
          content: e.target.result
        });
      };
      reader.readAsText(file);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        setSelectedImage(e.target.result);
        setImagePreview(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // If closed, show floating button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="bg-white hover:bg-gray-50 text-blue-600 p-3 rounded-lg border border-gray-200 shadow-md transition-all transform hover:scale-105 flex items-center justify-center"
        title="打开 AI 助手"
      >
        <MessageSquare size={20} />
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[380px] flex flex-col overflow-hidden transition-all animate-in slide-in-from-bottom-5 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="font-medium text-gray-700 text-sm">AI 助手</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-200"
        >
          <Minimize2 size={16} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] min-h-[200px] bg-white">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-8">
            <p>输入描述，AI 将为您生成图表</p>
            <p className="text-xs mt-2">支持流程图、时序图、架构图等</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`
                max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm
                ${msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'}
              `}
            >
              {msg.content === '...' ? (
                <div className="flex gap-1 items-center h-5">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-gray-50 border-t border-gray-100">
        {/* Previews */}
        {(selectedFile || imagePreview) && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-2">
            {selectedFile && (
              <div className="relative group flex-shrink-0">
                <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-blue-100 text-xs text-blue-700 shadow-sm">
                  <Paperclip size={12} />
                  <span className="max-w-[100px] truncate">{selectedFile.name}</span>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="ml-1 text-blue-400 hover:text-blue-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}
            {imagePreview && (
              <div className="relative group flex-shrink-0">
                <img src={imagePreview} alt="Preview" className="h-12 w-12 object-cover rounded-lg border border-gray-200 shadow-sm" />
                <button
                  onClick={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                  }}
                  className="absolute -top-1.5 -right-1.5 bg-white rounded-full p-0.5 shadow-md border border-gray-200 text-gray-500 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述您想要创建的图表..."
            className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm shadow-sm transition-all"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />

          <div className="absolute right-2 bottom-2.5 flex items-center gap-1">
            {isGenerating ? (
              <button
                onClick={onStop}
                className="h-8 w-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                title="停止生成"
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !selectedFile && !selectedImage}
                className="h-8 w-8 flex items-center justify-center bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Tools */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors"
              title="上传文件"
            >
              <Paperclip size={18} />
            </button>
            <button
              onClick={() => imageInputRef.current?.click()}
              className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-lg transition-colors"
              title="上传图片"
            >
              <ImageIcon size={18} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".txt,.md,.json,.js,.jsx,.ts,.tsx"
              className="hidden"
            />
            <input
              type="file"
              ref={imageInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
          </div>

          <div className="relative">
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer hover:bg-gray-100 transition-colors"
            >
              {Object.entries(CHART_TYPES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
              <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
