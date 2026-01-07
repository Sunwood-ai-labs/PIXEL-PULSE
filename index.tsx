import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  Upload, 
  Trash2, 
  Download, 
  Play, 
  Pause, 
  Zap, 
  Plus, 
  Minus, 
  Layers, 
  Move,
  Settings2,
  RefreshCw,
  Image as ImageIcon,
  Lock,
  Unlock,
  Ghost,
  Maximize
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Frame extends Rect {
  id: string;
}

// --- Utilities ---
const generateId = () => Math.random().toString(36).substr(2, 9);

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Main Component ---
const App = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [zoom, setZoom] = useState(1);
  const [fps, setFps] = useState(10);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [currentPreviewFrame, setCurrentPreviewFrame] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [onionSkin, setOnionSkin] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setFrames([]);
        setSelection(null);
        
        // Auto-fit logic for large images
        if (workspaceRef.current) {
          const wsWidth = workspaceRef.current.clientWidth - 100;
          const wsHeight = workspaceRef.current.clientHeight - 100;
          const fitZoom = Math.min(wsWidth / img.width, wsHeight / img.height, 1);
          setZoom(Math.max(0.1, Math.floor(fitZoom * 10) / 10));
        }
      };
      img.src = url;
    }
  };

  const fitToScreen = () => {
    if (!image || !workspaceRef.current) return;
    const wsWidth = workspaceRef.current.clientWidth - 100;
    const wsHeight = workspaceRef.current.clientHeight - 100;
    const fitZoom = Math.min(wsWidth / image.width, wsHeight / image.height);
    setZoom(Math.max(0.1, Math.floor(fitZoom * 10) / 10));
  };

  const getFixedSize = () => {
    if (frames.length > 0) {
      return { width: frames[0].width, height: frames[0].height };
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!image || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
    const fixed = getFixedSize();
    if (fixed) {
      setSelection({ x, y, width: fixed.width, height: fixed.height });
    } else {
      setSelection({ x, y, width: 0, height: 0 });
    }
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selection || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    
    const fixed = getFixedSize();
    if (fixed) {
      setSelection({ ...selection, x, y });
    } else {
      const diffX = x - selection.x;
      const diffY = y - selection.y;
      const size = Math.max(Math.abs(diffX), Math.abs(diffY));
      setSelection({
        ...selection,
        width: diffX < 0 ? -size : size,
        height: diffY < 0 ? -size : size
      });
    }
  };

  const handleMouseUp = () => {
    if (isDragging && selection) {
      const fixed = getFixedSize();
      const finalWidth = fixed ? fixed.width : Math.abs(selection.width);
      const finalHeight = fixed ? fixed.height : Math.abs(selection.height);
      
      if (finalWidth > 1 && finalHeight > 1) {
        const newFrame: Frame = {
          id: generateId(),
          x: !fixed && selection.width < 0 ? selection.x + selection.width : selection.x,
          y: !fixed && selection.height < 0 ? selection.y + selection.height : selection.y,
          width: finalWidth,
          height: finalHeight,
        };
        setFrames([...frames, newFrame]);
      }
    }
    setIsDragging(false);
    setSelection(null);
  };

  const deleteFrame = (id: string) => {
    setFrames(frames.filter(f => f.id !== id));
  };

  const clearFrames = () => setFrames([]);

  // --- AI Detection ---
  const autoDetectFrames = async () => {
    if (!image) return;
    setIsScanning(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = image.width;
      tempCanvas.height = image.height;
      const ctx = tempCanvas.getContext('2d');
      ctx?.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve) => tempCanvas.toBlob(resolve!, 'image/png'));
      const base64 = await blobToBase64(blob);

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [{
          parts: [
            { inlineData: { data: base64, mimeType: 'image/png' } },
            { text: "Identify bounding boxes for sprite frames. IMPORTANT: ensure they are squares of identical size if they appear to be a sequence." }
          ]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                width: { type: Type.NUMBER },
                height: { type: Type.NUMBER },
              },
              required: ['x', 'y', 'width', 'height']
            }
          }
        }
      });

      const detected = JSON.parse(response.text);
      const newFrames = detected.map((d: any) => ({ ...d, id: generateId() }));
      setFrames([...frames, ...newFrames]);
    } catch (error) {
      console.error("AI Detection failed:", error);
      alert("Failed to scan image. Please try again.");
    } finally {
      setIsScanning(false);
    }
  };

  // --- Animation Loop ---
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    const interval = setInterval(() => {
      setCurrentPreviewFrame((prev) => (prev + 1) % frames.length);
    }, 1000 / fps);
    return () => clearInterval(interval);
  }, [isPlaying, frames.length, fps]);

  // --- Render Workspace ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = image.width * zoom;
    canvas.height = image.height * zoom;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw existing frames
    frames.forEach((f, idx) => {
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = Math.max(1, zoom);
      ctx.strokeRect(f.x * zoom, f.y * zoom, f.width * zoom, f.height * zoom);
      ctx.fillStyle = '#a855f7';
      ctx.font = `bold ${Math.max(8, 10 * zoom)}px sans-serif`;
      ctx.fillText(`#${idx + 1}`, f.x * zoom, f.y * zoom - 2);
    });

    // Draw Onion Skin (Previous frame at current cursor)
    if (onionSkin && selection && frames.length > 0) {
      const lastFrame = frames[frames.length - 1];
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.drawImage(
        image,
        lastFrame.x, lastFrame.y, lastFrame.width, lastFrame.height,
        selection.x * zoom, selection.y * zoom, (selection.width || lastFrame.width) * zoom, (selection.height || lastFrame.height) * zoom
      );
      ctx.restore();
    }

    // Draw current selection
    if (selection) {
      ctx.strokeStyle = '#22c55e';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = Math.max(1, zoom);
      ctx.strokeRect(selection.x * zoom, selection.y * zoom, selection.width * zoom, selection.height * zoom);
      ctx.setLineDash([]);
    }
  }, [image, frames, zoom, selection, onionSkin]);

  // --- Render Preview ---
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !image || frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frame = frames[currentPreviewFrame % frames.length];
    if (!frame) return;

    canvas.width = 160;
    canvas.height = 160;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const scale = Math.min(canvas.width / frame.width, canvas.height / frame.height) * 0.9;
    const dx = (canvas.width - frame.width * scale) / 2;
    const dy = (canvas.height - frame.height * scale) / 2;

    ctx.drawImage(
      image,
      frame.x, frame.y, frame.width, frame.height,
      dx, dy, frame.width * scale, frame.height * scale
    );
  }, [image, frames, currentPreviewFrame]);

  // --- Export GIF ---
  const exportGif = () => {
    if (!image || frames.length === 0) return;
    setExporting(true);
    const frameImages: string[] = [];
    frames.forEach(f => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = f.width;
      tempCanvas.height = f.height;
      const tCtx = tempCanvas.getContext('2d');
      if (tCtx) {
        tCtx.imageSmoothingEnabled = false;
        tCtx.drawImage(image, f.x, f.y, f.width, f.height, 0, 0, f.width, f.height);
        frameImages.push(tempCanvas.toDataURL());
      }
    });
    (window as any).gifshot.createGIF({
      images: frameImages,
      interval: 1 / fps,
      gifWidth: frames[0].width,
      gifHeight: frames[0].height,
      pixelated: true
    }, (obj: any) => {
      if (!obj.error) {
        const link = document.createElement('a');
        link.href = obj.image;
        link.download = 'pixel-animation.gif';
        link.click();
      }
      setExporting(false);
    });
  };

  const adjustZoom = (delta: number) => {
    setZoom(prev => {
      let next;
      if (prev <= 1 && delta < 0) next = prev + delta * 0.1;
      else if (prev < 1 && delta > 0) next = prev + delta * 0.1;
      else next = prev + delta;
      return Math.max(0.1, Math.min(next, 10));
    });
  };

  return (
    <div className="flex h-screen w-full bg-[#0a0a0c] text-slate-200">
      {/* Sidebar - Tools */}
      <aside className="w-16 flex flex-col items-center py-6 border-r border-zinc-800 space-y-6 bg-[#0f0f12] z-20">
        <div className="p-2 bg-purple-600 rounded-lg shadow-lg shadow-purple-900/20">
          <Zap size={24} className="text-white" />
        </div>
        
        <div className="flex flex-col space-y-4">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-white"
            title="Upload Sheet"
          >
            <Upload size={20} />
          </button>
          <button 
            onClick={autoDetectFrames}
            disabled={!image || isScanning}
            className={`p-3 rounded-xl transition-all ${isScanning ? 'animate-pulse text-purple-400' : 'hover:bg-zinc-800 text-zinc-400 hover:text-purple-400'}`}
            title="AI Scan"
          >
            <RefreshCw size={20} className={isScanning ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => setOnionSkin(!onionSkin)}
            className={`p-3 rounded-xl transition-all ${onionSkin ? 'bg-purple-900/30 text-purple-400' : 'text-zinc-400 hover:bg-zinc-800'}`}
            title="Toggle Onion Skin"
          >
            <Ghost size={20} />
          </button>
          <button 
            onClick={clearFrames}
            className="p-3 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-red-400"
            title="Clear All"
          >
            <Trash2 size={20} />
          </button>
        </div>

        <div className="flex flex-col space-y-4 mt-auto">
          <button 
            onClick={fitToScreen}
            className="p-3 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400"
            title="Fit to Screen"
          >
            <Maximize size={20} />
          </button>
          <button onClick={() => adjustZoom(1)} className="p-3 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400">
            <Plus size={20} />
          </button>
          <div className="text-[10px] font-bold text-zinc-500 text-center uppercase">{zoom.toFixed(1)}x</div>
          <button onClick={() => adjustZoom(-1)} className="p-3 hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400">
            <Minus size={20} />
          </button>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col relative bg-[#070708] overflow-hidden">
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#0f0f12]/95 backdrop-blur-md z-10">
          <h1 className="retro-font text-[10px] tracking-widest text-purple-400 flex items-center gap-3">
             PIXEL-PULSE <span className="text-zinc-600">|</span> 
             <span className="text-zinc-400 uppercase font-sans tracking-normal text-xs">
               {frames.length > 0 ? `LOCKED: ${frames[0].width}x${frames[0].height}` : 'DRAG TO START SQUARE'}
             </span>
          </h1>
          <div className="flex items-center gap-4">
            {image && (
              <div className="hidden md:block text-[10px] text-zinc-500 font-mono">
                IMAGE: {image.width}x{image.height}px
              </div>
            )}
            {isScanning && <span className="text-xs text-purple-400 animate-pulse font-bold">GEMINI SCANNING...</span>}
            <button 
              onClick={exportGif}
              disabled={!image || frames.length === 0 || exporting}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-purple-900/20"
            >
              {exporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              Export GIF
            </button>
          </div>
        </header>

        {/* Scrollable Canvas Container */}
        <div 
          ref={workspaceRef}
          className="flex-1 overflow-auto bg-[radial-gradient(#1a1a1e_1px,transparent_1px)] [background-size:20px_20px] custom-scrollbar flex items-start justify-start p-10"
        >
          {image ? (
            <div 
              className="relative shadow-2xl shadow-black border border-zinc-800 bg-[#0f0f12] canvas-container mx-auto"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ width: image.width * zoom, height: image.height * zoom }}
            >
              <canvas ref={canvasRef} className="pixelated block pointer-events-none" />
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="m-auto group cursor-pointer flex flex-col items-center justify-center p-20 border-2 border-dashed border-zinc-800 hover:border-purple-500/50 rounded-3xl transition-all bg-[#0f0f12]"
            >
              <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <ImageIcon size={40} className="text-zinc-700 group-hover:text-purple-500" />
              </div>
              <p className="text-zinc-400 font-medium text-lg">Upload Large Sprite Sheet</p>
              <p className="text-zinc-600 text-sm mt-2">Will automatically fit to workspace</p>
            </div>
          )}
        </div>

        <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileUpload} />
      </main>

      {/* Right Panel - Preview & Timeline */}
      <aside className="w-80 border-l border-zinc-800 bg-[#0f0f12] flex flex-col z-20 shadow-2xl">
        {/* Preview Window */}
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Live Preview</h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-1.5 rounded-md transition-colors ${isPlaying ? 'text-purple-400 bg-purple-900/20' : 'text-zinc-500 hover:bg-zinc-800'}`}
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>
            </div>
          </div>
          <div className="aspect-square bg-black rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden relative group">
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(to_right,#111_1px,transparent_1px),linear-gradient(to_bottom,#111_1px,transparent_1px)] [background-size:10px_10px]"></div>
            <canvas ref={previewCanvasRef} className="pixelated z-10" />
            {frames.length === 0 && (
              <p className="text-[10px] text-zinc-700 font-bold uppercase tracking-tighter text-center px-8 z-10">Waiting for frames...</p>
            )}
          </div>
          
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">Speed (FPS)</span>
              <span className="text-xs font-black text-purple-400">{fps}</span>
            </div>
            <input 
              type="range" 
              min="1" max="60" 
              value={fps} 
              onChange={(e) => setFps(parseInt(e.target.value))}
              className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/20">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Layers size={14} />
              Frames ({frames.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {frames.map((frame, idx) => (
              <div 
                key={frame.id}
                className={`group flex items-center gap-4 p-3 rounded-xl border transition-all hover:bg-zinc-800/50 ${idx === currentPreviewFrame ? 'bg-purple-900/10 border-purple-500/30' : 'bg-zinc-900/30 border-transparent'}`}
              >
                <div className="w-10 h-10 flex-shrink-0 bg-black rounded-lg overflow-hidden flex items-center justify-center border border-zinc-800">
                  {image && (
                    <div 
                      className="pixelated"
                      style={{
                        backgroundImage: `url(${image.src})`,
                        backgroundPosition: `-${frame.x}px -${frame.y}px`,
                        width: frame.width,
                        height: frame.height,
                        transform: `scale(${Math.min(32 / frame.width, 32 / frame.height)})`,
                        backgroundRepeat: 'no-repeat'
                      }}
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black text-zinc-300 uppercase tracking-tight">Frame {idx + 1}</p>
                  <p className="text-[9px] text-zinc-600 font-mono">{frame.x},{frame.y}</p>
                </div>
                <button 
                  onClick={() => deleteFrame(frame.id)}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 hover:text-red-400 text-zinc-600 rounded-lg transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {frames.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-50">
                <p className="text-[9px] text-zinc-600 font-black uppercase tracking-widest leading-relaxed">
                  Select your first frame<br/>to lock square size
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);