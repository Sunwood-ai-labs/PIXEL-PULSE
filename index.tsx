import React, { useState, useRef, useEffect } from 'react';
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
  Image as ImageIcon,
  Eye,
  X,
  Monitor,
  CheckCircle2,
  Ghost
} from 'lucide-react';

// UPNG global declaration
declare const UPNG: any;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Frame extends Rect {
  id: string;
  dataUrl?: string; // For extracted frames from APNG
  imgElement?: HTMLImageElement; // Pre-loaded element for smooth rendering
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const App = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [zoom, setZoom] = useState(1);
  const [fps, setFps] = useState(10);
  const [isPlaying, setIsPlaying] = useState(true);
  const [onionSkin, setOnionSkin] = useState(true);
  const [currentPreviewFrame, setCurrentPreviewFrame] = useState(0);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewBg, setPreviewBg] = useState<'grid' | 'black' | 'white' | 'green'>('grid');
  
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
  const [draggingFrameId, setDraggingFrameId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{x: number, y: number} | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fullPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      if (previewMode && e.key === 'Escape') {
        setPreviewMode(false);
        return;
      }
      if (selectedFrameId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        setFrames(prev => prev.map(f => {
          if (f.id !== selectedFrameId) return f;
          return {
            ...f,
            x: e.key === 'ArrowLeft' ? f.x - step : e.key === 'ArrowRight' ? f.x + step : f.x,
            y: e.key === 'ArrowUp' ? f.y - step : e.key === 'ArrowDown' ? f.y + step : f.y,
          };
        }));
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedFrameId && !previewMode) {
          setFrames(prev => prev.filter(f => f.id !== selectedFrameId));
          setSelectedFrameId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFrameId, previewMode]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    
    try {
      const imgData = UPNG.decode(arrayBuffer);
      if (imgData.frames && imgData.frames.length > 1) {
        const rgbaFrames = UPNG.toRGBA8(imgData);
        const newFrames: Frame[] = [];
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        const tempCtx = tempCanvas.getContext('2d')!;

        for (let i = 0; i < rgbaFrames.length; i++) {
          const rgba = rgbaFrames[i];
          const uint8 = new Uint8ClampedArray(rgba);
          const imageData = new ImageData(uint8, imgData.width, imgData.height);
          tempCtx.putImageData(imageData, 0, 0);
          const dataUrl = tempCanvas.toDataURL();
          
          const imgEl = new Image();
          imgEl.src = dataUrl;
          await new Promise(resolve => { imgEl.onload = resolve; });

          newFrames.push({
            id: generateId(),
            x: 0, y: 0, 
            width: imgData.width, 
            height: imgData.height,
            dataUrl: dataUrl,
            imgElement: imgEl
          });
        }

        const baseImg = new Image();
        baseImg.src = newFrames[0].dataUrl!;
        baseImg.onload = () => {
          setImage(baseImg);
          setFrames(newFrames);
          setSelection(null);
          setSelectedFrameId(null);
          setZoom(1.5);
        };
        return;
      }
    } catch (err) {
      console.log("Not an APNG or decoding failed, treating as static image.");
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setFrames([]);
      setSelection(null);
      setSelectedFrameId(null);
      if (workspaceRef.current) {
        const fitZoom = Math.min((workspaceRef.current.clientWidth - 100) / img.width, (workspaceRef.current.clientHeight - 100) / img.height, 1);
        setZoom(Math.max(0.1, Math.floor(fitZoom * 10) / 10));
      }
    };
    img.src = url;
  };

  const getFixedSize = () => (frames.length > 0 ? { width: frames[0].width, height: frames[0].height } : null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!image || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const hitFrame = [...frames].reverse().find(f => x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height);

    if (hitFrame) {
      setDraggingFrameId(hitFrame.id);
      setSelectedFrameId(hitFrame.id);
      setDragStartPos({ x: x - hitFrame.x, y: y - hitFrame.y });
    } else {
      const fixed = getFixedSize();
      setSelection(fixed ? { x, y, width: fixed.width, height: fixed.height } : { x, y, width: 0, height: 0 });
      setIsDragging(true);
      setSelectedFrameId(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || (!isDragging && !draggingFrameId)) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    if (draggingFrameId && dragStartPos) {
      setFrames(prev => prev.map(f => f.id === draggingFrameId ? { ...f, x: x - dragStartPos.x, y: y - dragStartPos.y } : f));
    } else if (isDragging && selection) {
      const fixed = getFixedSize();
      setSelection(fixed ? { ...selection, x, y } : { ...selection, width: x - selection.x, height: y - selection.y });
    }
  };

  const handleMouseUp = () => {
    if (isDragging && selection) {
      const fixed = getFixedSize();
      const fw = Math.abs(fixed ? fixed.width : selection.width);
      const fh = Math.abs(fixed ? fixed.height : selection.height);
      if (fw > 1 && fh > 1) {
        const id = generateId();
        const nx = Math.floor(selection.width < 0 ? selection.x + selection.width : selection.x);
        const ny = Math.floor(selection.height < 0 ? selection.y + selection.height : selection.y);
        setFrames(p => [...p, { id, x: nx, y: ny, width: Math.floor(fw), height: Math.floor(fh) }]);
        setSelectedFrameId(id);
      }
    }
    setIsDragging(false); setDraggingFrameId(null); setSelection(null);
  };

  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    const i = setInterval(() => setCurrentPreviewFrame(p => (p + 1) % frames.length), 1000 / fps);
    return () => clearInterval(i);
  }, [isPlaying, frames.length, fps]);

  // Workspace Canvas rendering
  useEffect(() => {
    const c = canvasRef.current; if (!c || !image) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    c.width = image.width * zoom; c.height = image.height * zoom;
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, c.width, c.height);

    ctx.drawImage(image, 0, 0, c.width, c.height);

    // --- Onion Skin: Show previous frame content during selection or on selected frame ---
    if (onionSkin && frames.length > 0) {
      let prevFrame: Frame | null = null;
      let targetX = 0, targetY = 0, targetW = 0, targetH = 0;

      if (isDragging && selection) {
        // When drawing a new frame
        prevFrame = frames[frames.length - 1];
        targetX = selection.width < 0 ? selection.x + selection.width : selection.x;
        targetY = selection.height < 0 ? selection.y + selection.height : selection.y;
        targetW = Math.abs(selection.width);
        targetH = Math.abs(selection.height);
      } else if (selectedFrameId) {
        // When a frame is selected
        const idx = frames.findIndex(f => f.id === selectedFrameId);
        if (idx > 0) {
          prevFrame = frames[idx - 1];
          const curr = frames[idx];
          targetX = curr.x; targetY = curr.y; targetW = curr.width; targetH = curr.height;
        }
      }

      if (prevFrame && targetW > 0 && targetH > 0) {
        ctx.globalAlpha = 0.4;
        if (prevFrame.imgElement) {
          ctx.drawImage(prevFrame.imgElement, targetX * zoom, targetY * zoom, targetW * zoom, targetH * zoom);
        } else {
          ctx.drawImage(image, Math.floor(prevFrame.x), Math.floor(prevFrame.y), Math.floor(prevFrame.width), Math.floor(prevFrame.height), targetX * zoom, targetY * zoom, targetW * zoom, targetH * zoom);
        }
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = '#a855f7';
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(targetX * zoom, targetY * zoom, targetW * zoom, targetH * zoom);
        ctx.setLineDash([]);
      }
    }

    // All frames
    frames.forEach((f, i) => {
      ctx.strokeStyle = selectedFrameId === f.id ? '#22c55e' : '#a855f7';
      ctx.lineWidth = 2; ctx.strokeRect(f.x * zoom, f.y * zoom, f.width * zoom, f.height * zoom);
      ctx.fillStyle = selectedFrameId === f.id ? '#22c55e' : '#a855f7';
      ctx.font = 'bold 10px sans-serif'; ctx.fillText(`#${i + 1}`, f.x * zoom, f.y * zoom - 2);
    });

    if (selection && isDragging) { 
      ctx.strokeStyle = '#22c55e'; 
      ctx.strokeRect(selection.x * zoom, selection.y * zoom, selection.width * zoom, selection.height * zoom); 
    }
  }, [image, frames, zoom, selection, selectedFrameId, isDragging, onionSkin]);

  // Preview rendering (Onion Skin removed as requested)
  const renderToCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const fIdx = currentPreviewFrame % frames.length;
    const f = frames[fIdx]; if (!f) return;
    
    const displaySize = canvas.id === 'full-preview' ? Math.max(f.width * zoom * 2, 300) : 160;
    canvas.width = displaySize; canvas.height = displaySize;
    ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, displaySize, displaySize);

    const s = Math.min(displaySize / f.width, displaySize / f.height) * 0.9;
    const dx = (displaySize - f.width * s) / 2;
    const dy = (displaySize - f.height * s) / 2;

    if (f.imgElement) {
      ctx.drawImage(f.imgElement, dx, dy, f.width * s, f.height * s);
    } else if (image) {
      ctx.drawImage(image, Math.floor(f.x), Math.floor(f.y), Math.floor(f.width), Math.floor(f.height), dx, dy, f.width * s, f.height * s);
    }
  };

  useEffect(() => { renderToCanvas(previewCanvasRef.current); }, [image, frames, currentPreviewFrame]);
  useEffect(() => { if (previewMode) renderToCanvas(fullPreviewCanvasRef.current); }, [image, frames, currentPreviewFrame, previewMode, zoom]);

  const exportApng = async () => {
    if (frames.length === 0 || typeof UPNG === 'undefined') return;
    setExporting(true);
    try {
      const gw = Math.floor(frames[0].width);
      const gh = Math.floor(frames[0].height);
      const frameData: ArrayBuffer[] = [];
      const delays: number[] = [];
      const renderPromises = frames.map(async (f) => {
        const fc = document.createElement('canvas');
        fc.width = gw; fc.height = gh;
        const fctx = fc.getContext('2d')!;
        fctx.imageSmoothingEnabled = false;
        if (f.imgElement) {
          fctx.drawImage(f.imgElement, 0, 0, gw, gh);
        } else if (image) {
          fctx.drawImage(image, Math.floor(f.x), Math.floor(f.y), Math.floor(f.width), Math.floor(f.height), 0, 0, gw, gh);
        }
        return fctx.getImageData(0, 0, gw, gh).data.buffer;
      });
      const results = await Promise.all(renderPromises);
      results.forEach(buf => { frameData.push(buf); delays.push(1000 / fps); });
      const apngBuffer = UPNG.encode(frameData, gw, gh, 0, delays);
      const blob = new Blob([apngBuffer], { type: 'image/png' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pixel_animation_${gw}x${gh}.png`;
      link.click();
    } catch (err) { console.error(err); } finally { setExporting(false); }
  };

  return (
    <div className="flex h-screen w-full bg-[#070708] text-slate-200 overflow-hidden font-sans">
      <aside className="w-16 border-r border-zinc-800 bg-[#0f0f12] flex flex-col items-center py-6 space-y-6 z-20 shadow-2xl">
        <div className="p-2 bg-purple-600 rounded-lg shadow-lg shadow-purple-500/20"><Zap size={24} className="text-white" /></div>
        <div className="flex flex-col space-y-4">
          <button onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all" title="Upload Image/APNG"><Upload size={20} /></button>
          <button onClick={() => setOnionSkin(!onionSkin)} className={`p-3 rounded-xl transition-all ${onionSkin ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'hover:bg-zinc-800 text-zinc-400'}`} title="Toggle Onion Skin"><Ghost size={20} /></button>
          <button onClick={() => setPreviewMode(true)} disabled={frames.length === 0} className="p-3 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-blue-400 transition-all" title="Preview Mode"><Eye size={20} /></button>
          <button onClick={() => setFrames([])} className="p-3 hover:bg-red-500/10 rounded-xl text-zinc-400 hover:text-red-400 transition-all" title="Clear All"><Trash2 size={20} /></button>
        </div>
        <div className="mt-auto flex flex-col space-y-4">
          <button onClick={() => setZoom(z => Math.min(z + 0.5, 10))} className="p-3 hover:bg-zinc-800 rounded-xl text-zinc-400"><Plus size={20} /></button>
          <div className="text-[10px] font-bold text-zinc-600 text-center">{Math.round(zoom * 100)}%</div>
          <button onClick={() => setZoom(z => Math.max(z - 0.5, 0.1))} className="p-3 hover:bg-zinc-800 rounded-xl text-zinc-400"><Minus size={20} /></button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-[#0f0f12]/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <h1 className="retro-font text-[10px] tracking-widest text-purple-400 uppercase">Pixel Pulse</h1>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="text-[10px] text-zinc-500 uppercase flex gap-4 font-bold tracking-tight">
              <span>{frames.length > 0 ? `${frames[0].width}x${frames[0].height} Sprite` : 'Waiting for Input'}</span>
            </div>
          </div>
          <div className="flex gap-3">
             <button onClick={() => setPreviewMode(true)} disabled={frames.length === 0} className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-5 py-2 rounded-lg text-xs font-bold tracking-widest transition-all"><Monitor size={16} /> PREVIEW</button>
            <button onClick={exportApng} disabled={!image || frames.length === 0 || exporting} className="flex items-center gap-2 bg-gradient-to-br from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-zinc-800 px-5 py-2 rounded-lg text-xs font-black tracking-widest shadow-xl transition-all active:scale-95"><Download size={16} /> {exporting ? 'EXPORTING...' : 'EXPORT APNG'}</button>
          </div>
        </header>

        <div ref={workspaceRef} className="flex-1 overflow-auto bg-[radial-gradient(#1a1a1e_1px,transparent_1px)] [background-size:20px_20px] p-16 flex justify-center items-start">
          {image ? (
            <div className="relative shadow-2xl border border-zinc-800 bg-[#0f0f12] transparency-grid" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} style={{ width: image.width * zoom, height: image.height * zoom, cursor: draggingFrameId ? 'grabbing' : 'crosshair' }}>
              <canvas ref={canvasRef} className="rendering-pixelated block pointer-events-none" />
            </div>
          ) : (
            <div onClick={() => fileInputRef.current?.click()} className="m-auto group cursor-pointer flex flex-col items-center justify-center p-24 border-2 border-dashed border-zinc-800 hover:border-purple-500/50 rounded-3xl transition-all bg-[#0f0f12]">
              <ImageIcon size={48} className="text-zinc-700 group-hover:text-purple-500 mb-4" />
              <p className="text-zinc-400 text-xl font-bold uppercase tracking-widest">Drop Image or APNG</p>
              <p className="text-zinc-600 text-sm mt-2">Manual framing or edit decoded APNG</p>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" hidden accept="image/*" onChange={handleFileUpload} />
      </main>

      <aside className="w-80 border-l border-zinc-800 bg-[#0f0f12] flex flex-col shadow-2xl z-20">
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Preview</h3>
            <button onClick={() => setIsPlaying(!isPlaying)} className={`p-1.5 rounded-lg transition-all ${isPlaying ? 'text-purple-400 bg-purple-900/20' : 'text-zinc-500 hover:bg-zinc-800'}`}>{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
          </div>
          <div className="aspect-square bg-black rounded-2xl border border-zinc-800 flex items-center justify-center overflow-hidden relative shadow-inner transparency-grid">
            <canvas ref={previewCanvasRef} className="rendering-pixelated z-10" />
            {frames.length === 0 && <span className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest z-10">Add frames to view</span>}
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex justify-between text-[10px] font-black text-zinc-500 uppercase tracking-tighter"><span>Speed: {fps} FPS</span></div>
            <input type="range" min="1" max="24" value={fps} onChange={e => setFps(parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/30"><h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2"><Layers size={14} /> Sequence ({frames.length})</h3></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {frames.map((f, idx) => (
              <div key={f.id} onClick={() => setSelectedFrameId(f.id)} className={`group flex items-center gap-4 p-3 rounded-2xl border cursor-pointer transition-all ${selectedFrameId === f.id ? 'bg-purple-900/10 border-purple-500/30' : 'bg-zinc-900/20 border-transparent hover:bg-zinc-800/40'}`}>
                <div className="w-14 h-14 bg-zinc-950 rounded-xl border border-zinc-800 flex items-center justify-center overflow-hidden shadow-inner transparency-grid">
                   {f.imgElement ? <img src={f.dataUrl} className="rendering-pixelated w-full h-full object-contain" /> : image && <div className="rendering-pixelated" style={{ backgroundImage: `url(${image.src})`, backgroundPosition: `-${Math.floor(f.x)}px -${Math.floor(f.y)}px`, width: Math.floor(f.width), height: Math.floor(f.height), transform: `scale(${Math.min(48/f.width, 48/f.height)})`, transformOrigin: 'top left' }} />}
                </div>
                <div className="flex-1 min-w-0"><p className={`text-[10px] font-black uppercase tracking-tight ${idx === currentPreviewFrame ? 'text-purple-400' : 'text-zinc-300'}`}>Frame {idx + 1}</p></div>
                <button onClick={(e) => { e.stopPropagation(); setFrames(p => p.filter(fr => fr.id !== f.id)); }} className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-500 transition-all"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {previewMode && (
        <div className="fixed inset-0 z-50 bg-[#070708] flex flex-col">
          <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-[#0f0f12]">
            <div className="flex items-center gap-4"><Monitor size={20} className="text-purple-500" /><h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Live Animation Preview</h2></div>
            <div className="flex items-center gap-6">
              <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                {(['grid', 'black', 'white', 'green'] as const).map(bg => <button key={bg} onClick={() => setPreviewBg(bg)} className={`px-3 py-1.5 rounded text-[9px] font-bold uppercase transition-all ${previewBg === bg ? 'bg-purple-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{bg}</button>)}
              </div>
              <button onClick={() => setPreviewMode(false)} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>
          </header>
          <div className={`flex-1 flex items-center justify-center overflow-hidden transition-colors ${previewBg === 'grid' ? 'transparency-grid' : previewBg === 'black' ? 'bg-black' : previewBg === 'white' ? 'bg-white' : 'bg-[#00ff00]'}`}>
            <div className="relative group">
              <canvas id="full-preview" ref={fullPreviewCanvasRef} className="rendering-pixelated shadow-2xl transition-transform" />
              <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-4 bg-black/80 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-800">
                <button onClick={() => setZoom(z => Math.max(0.1, z - 0.2))} className="text-zinc-400 hover:text-white"><Minus size={14} /></button>
                <span className="text-[10px] font-mono font-bold text-purple-400 min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom(z => Math.min(10, z + 0.2))} className="text-zinc-400 hover:text-white"><Plus size={14} /></button>
              </div>
            </div>
          </div>
          <footer className="h-16 border-t border-zinc-800 bg-[#0f0f12] flex items-center justify-center px-8 gap-12">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsPlaying(!isPlaying)} className="p-3 bg-purple-600 rounded-full text-white hover:bg-purple-500 transition-all shadow-lg shadow-purple-600/20">{isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button>
              <div className="flex flex-col"><span className="text-[9px] font-black uppercase text-zinc-500 leading-none mb-1">Status</span><span className="text-[10px] font-bold text-zinc-200 uppercase tracking-widest flex items-center gap-1">{isPlaying ? 'Looping' : 'Paused'} <CheckCircle2 size={12} className="text-purple-400" /></span></div>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="flex items-center gap-4"><span className="text-[9px] font-black uppercase text-zinc-500">Speed</span><div className="flex items-center gap-3 bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800"><input type="range" min="1" max="60" value={fps} onChange={e => setFps(parseInt(e.target.value))} className="w-32 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500" /><span className="text-[10px] font-mono font-bold text-zinc-400 min-w-[3ch]">{fps}</span></div></div>
            <button onClick={exportApng} disabled={exporting} className="ml-auto flex items-center gap-2 bg-purple-600 hover:bg-purple-500 px-6 py-2.5 rounded-xl text-xs font-black tracking-widest transition-all shadow-xl shadow-purple-600/10"><Download size={16} /> DOWNLOAD FINAL APNG</button>
          </footer>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);