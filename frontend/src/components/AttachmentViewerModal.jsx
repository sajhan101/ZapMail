import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Download,
  FileText,
  FileImage,
  FileSpreadsheet,
  File,
  Eye,
  ExternalLink,
  Paperclip,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  AlertCircle
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Ensure Uint8Array.prototype.toHex polyfill for compatibility
if (typeof Uint8Array !== 'undefined' && !Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    return Array.from(this)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  };
}

if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function getAttachmentIcon(filename = '', mimeType = '') {
  const fn = filename.toLowerCase();
  const mt = (mimeType || '').toLowerCase();

  if (mt.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(fn)) {
    return FileImage;
  }
  if (mt === 'application/pdf' || fn.endsWith('.pdf')) {
    return FileText;
  }
  if (
    mt.includes('spreadsheet') ||
    mt.includes('excel') ||
    /\.(xlsx?|csv)$/i.test(fn)
  ) {
    return FileSpreadsheet;
  }
  if (
    mt.includes('word') ||
    mt.includes('document') ||
    /\.(docx?|odt|rtf|txt)$/i.test(fn)
  ) {
    return FileText;
  }
  return File;
}

/**
 * Mobile-First Interactive Canvas PDF Viewer with:
 * - Dynamic Fit-to-Window-Width on initial load
 * - Touch Pinch-to-Zoom & Double-Tap to Zoom
 * - Smooth two-dimensional scrolling/panning when zoomed
 * - Zoom In (+), Zoom Out (-), Reset/Fit Width, Rotate (90deg)
 * - Multi-page navigation (‹ Page X of Y ›)
 * - High-DPI / Retina canvas crispness
 * - Fallback to native browser embed if parsing fails
 */
function InteractivePdfViewer({ pdfUrl, pdfBytes, filename, activeDownloadUrl }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1.0); // 1.0 = 100% of fit-to-width
  const [rotation, setRotation] = useState(0);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [docError, setDocError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Pinch-to-zoom touch state
  const touchDistRef = useRef(null);
  const startZoomRef = useRef(1.0);
  const lastTapRef = useRef(0);

  // 1. Measure container width responsively
  useEffect(() => {
    function measureWidth() {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    }
    measureWidth();
    window.addEventListener('resize', measureWidth);
    return () => window.removeEventListener('resize', measureWidth);
  }, []);

  // 2. Load PDF Document via PDF.js
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingDoc(true);
    setDocError(null);

    async function loadPdf() {
      try {
        let loadingTask;
        if (pdfBytes && pdfBytes.byteLength > 0) {
          loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        } else if (pdfUrl) {
          loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        } else {
          throw new Error('No PDF URL or data provided');
        }

        const doc = await loadingTask.promise;
        if (!isCancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages || 1);
          setCurrentPage(1);
          setZoomLevel(1.0);
          setRotation(0);
          setIsLoadingDoc(false);
        }
      } catch (err) {
        console.warn('[PDF.js] Failed to load PDF via canvas, falling back:', err);
        if (!isCancelled) {
          setDocError(err.message || 'Unable to parse PDF with canvas engine');
          setIsLoadingDoc(false);
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
    };
  }, [pdfUrl, pdfBytes]);

  // 3. Render current page on canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

    try {
      // Cancel previous in-flight render task if active
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancellation
        }
      }

      const page = await pdfDoc.getPage(currentPage);
      const unscaledViewport = page.getViewport({ scale: 1.0, rotation });

      // Calculate auto fit-to-width scale
      const currentContainerWidth = containerRef.current.clientWidth || window.innerWidth;
      // Allow padding: 16px on mobile screens (<640px), 32px on larger screens
      const padding = currentContainerWidth < 640 ? 16 : 32;
      const targetWidth = Math.max(currentContainerWidth - padding, 220);
      const fitScale = targetWidth / unscaledViewport.width;

      // Effective scale multiplied by user zoom level
      const effectiveScale = fitScale * zoomLevel;
      const viewport = page.getViewport({ scale: effectiveScale, rotation });

      // Crisp rendering on High-DPI / Retina mobile screens
      const pixelRatio = window.devicePixelRatio || 1;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;
    } catch (err) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('[PDF.js] Render error on page', currentPage, err);
      }
    }
  }, [pdfDoc, currentPage, zoomLevel, rotation, containerWidth]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Touch gesture handlers for pinch-to-zoom
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistRef.current = dist;
      startZoomRef.current = zoomLevel;
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchDistRef.current) {
      // Prevent browser default gesture interference
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchDistRef.current;
      const nextZoom = Math.min(Math.max(startZoomRef.current * factor, 0.5), 3.5);
      setZoomLevel(Number(nextZoom.toFixed(2)));
    }
  };

  const handleTouchEnd = (e) => {
    if (e.touches.length < 2) {
      touchDistRef.current = null;
    }
  };

  // Double tap to toggle zoom between Fit (1.0x) and 1.6x
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      setZoomLevel((prev) => (prev > 1.15 ? 1.0 : 1.6));
    }
    lastTapRef.current = now;
  };

  const handleZoomIn = () => {
    setZoomLevel((z) => Math.min(Number((z + 0.25).toFixed(2)), 3.5));
  };

  const handleZoomOut = () => {
    setZoomLevel((z) => Math.max(Number((z - 0.25).toFixed(2)), 0.5));
  };

  const handleResetFit = () => {
    setZoomLevel(1.0);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  // Fallback to iframe if PDF.js fails
  if (docError) {
    return (
      <div className="w-full h-full flex flex-col rounded-2xl overflow-hidden border border-[#4E4F4E] bg-white relative">
        <iframe
          src={`${pdfUrl}#toolbar=1`}
          className="w-full h-[70vh] rounded-lg border-0 bg-white"
          title={filename}
        />
        <div className="p-3 bg-[#242524] border-t border-[#4E4F4E] flex items-center justify-between text-xs text-slate-300">
          <span className="flex items-center gap-1.5 text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Using native document viewer</span>
          </span>
          {activeDownloadUrl && (
            <a
              href={activeDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#FF8585] hover:underline flex items-center gap-1 font-semibold"
            >
              Open in New Window <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col min-h-0 relative bg-[#1A1B1A]">
      {/* Interactive PDF Control Toolbar */}
      <div className="shrink-0 px-3 py-2 bg-[#202120] border-b border-[#4E4F4E] flex items-center justify-between gap-2 text-xs text-slate-200 select-none overflow-x-auto">
        {/* Page Navigation */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage <= 1 || isLoadingDoc}
            className="p-1.5 rounded-lg bg-[#2C2D2C] hover:bg-[#3C3D3C] disabled:opacity-40 disabled:hover:bg-[#2C2D2C] text-slate-200 transition cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="px-2 py-0.5 font-mono text-[11px] text-slate-300 whitespace-nowrap">
            {currentPage} / {numPages}
          </span>

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(p + 1, numPages))}
            disabled={currentPage >= numPages || isLoadingDoc}
            className="p-1.5 rounded-lg bg-[#2C2D2C] hover:bg-[#3C3D3C] disabled:opacity-40 disabled:hover:bg-[#2C2D2C] text-slate-200 transition cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom and Scale Controls */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5 || isLoadingDoc}
            className="p-1.5 rounded-lg bg-[#2C2D2C] hover:bg-[#3C3D3C] disabled:opacity-40 disabled:hover:bg-[#2C2D2C] text-slate-200 transition cursor-pointer"
            title="Zoom Out (-25%)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleResetFit}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition cursor-pointer ${
              Math.abs(zoomLevel - 1.0) < 0.05
                ? 'bg-[#B50000]/20 text-[#FF8585] border border-[#B50000]/40'
                : 'bg-[#2C2D2C] hover:bg-[#3C3D3C] text-slate-200 border border-[#4E4F4E]'
            }`}
            title="Click to Reset to Fit-Width"
          >
            {Math.abs(zoomLevel - 1.0) < 0.05 ? 'Fit' : `${Math.round(zoomLevel * 100)}%`}
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3.5 || isLoadingDoc}
            className="p-1.5 rounded-lg bg-[#2C2D2C] hover:bg-[#3C3D3C] disabled:opacity-40 disabled:hover:bg-[#2C2D2C] text-slate-200 transition cursor-pointer"
            title="Zoom In (+25%)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-4 bg-[#4E4F4E] mx-0.5 hidden xs:block" />

          <button
            type="button"
            onClick={handleResetFit}
            className="p-1.5 rounded-lg bg-[#2C2D2C] hover:bg-[#3C3D3C] text-slate-200 transition cursor-pointer hidden xs:flex items-center gap-1"
            title="Fit Page to Window Width"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#FF8585]" />
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="p-1.5 rounded-lg bg-[#2C2D2C] hover:bg-[#3C3D3C] text-slate-200 transition cursor-pointer"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scrollable Canvas Viewport Container */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDoubleTap}
        className="flex-1 w-full overflow-auto overscroll-contain bg-[#161716] p-2 sm:p-4 flex flex-col items-center select-none"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: zoomLevel > 1.05 ? 'pan-x pan-y pinch-zoom' : 'pan-y pinch-zoom'
        }}
      >
        {isLoadingDoc ? (
          <div className="m-auto flex flex-col items-center justify-center p-8 text-slate-300 gap-3">
            <RefreshCw className="w-7 h-7 text-[#FF8585] animate-spin" />
            <span className="text-xs font-medium tracking-wide">Rendering PDF page...</span>
          </div>
        ) : (
          <div className="m-auto flex flex-col items-center justify-center min-w-min py-2">
            <canvas
              ref={canvasRef}
              className="rounded shadow-2xl bg-white max-w-none block transition-all duration-75"
              style={{
                boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
              }}
            />
          </div>
        )}
      </div>

      {/* Helpful Mobile Gestures Hint */}
      <div className="px-3 py-1 bg-[#1E1F1E] border-t border-[#3A3B3A] flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span className="truncate">Pinch or double-tap to zoom • Pan to scroll</span>
        <span className="shrink-0 text-slate-500">Page {currentPage} of {numPages}</span>
      </div>
    </div>
  );
}

export default function AttachmentViewerModal({ isOpen, onClose, attachment }) {
  if (!isOpen || !attachment) return null;

  const { filename = 'Attachment', mimeType = '', size = 0, url, dataUrl } = attachment;
  const rawFileUrl = url || dataUrl || '';
  const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  const Icon = getAttachmentIcon(filename, mimeType);

  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [pdfBytes, setPdfBytes] = useState(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);

  useEffect(() => {
    let activeBlobUrl = null;

    if (!isOpen || !attachment || !isPdf) {
      setPdfPreviewUrl('');
      setPdfBytes(null);
      setIsLoadingPdf(false);
      return;
    }

    setIsLoadingPdf(true);

    async function preparePdfUrl() {
      try {
        // 1. Convert base64 dataUrl (data:application/pdf;base64,...) to Blob URL & Uint8Array
        if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
          const commaIdx = dataUrl.indexOf(',');
          const base64Data = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
          const binaryStr = atob(base64Data);
          const len = binaryStr.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          setPdfBytes(bytes);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          activeBlobUrl = URL.createObjectURL(blob);
          setPdfPreviewUrl(activeBlobUrl);
          setIsLoadingPdf(false);
          return;
        }

        // 2. Convert binary buffer/payload if present
        if (attachment.data) {
          const bytes = new Uint8Array(attachment.data);
          setPdfBytes(bytes);
          const blob = new Blob([bytes], { type: 'application/pdf' });
          activeBlobUrl = URL.createObjectURL(blob);
          setPdfPreviewUrl(activeBlobUrl);
          setIsLoadingPdf(false);
          return;
        }

        // 3. Resolve fetch target URL
        let targetFetchUrl = url || rawFileUrl;
        if (!targetFetchUrl && filename.toLowerCase().includes('carrier_specification')) {
          targetFetchUrl = '/carrier_specification_doc.pdf';
        }

        if (targetFetchUrl) {
          try {
            const res = await fetch(targetFetchUrl);
            if (res.ok) {
              const buf = await res.arrayBuffer();
              if (buf && buf.byteLength > 50) {
                const bytes = new Uint8Array(buf);
                setPdfBytes(bytes);
                const blob = new Blob([buf], { type: 'application/pdf' });
                activeBlobUrl = URL.createObjectURL(blob);
                setPdfPreviewUrl(activeBlobUrl);
                setIsLoadingPdf(false);
                return;
              }
            }
          } catch {
            // direct fetch failed, fallback below
          }

          // Use target URL directly if fetch buffer conversion was blocked
          setPdfPreviewUrl(targetFetchUrl);
          setIsLoadingPdf(false);
          return;
        }

        // 4. Fallback generator for simulated files
        const safeDocTitle = filename.replace(/[^a-zA-Z0-9 _.-]/g, '');
        const fallbackPdfContent = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 200 >>\nstream\nBT\n/F1 18 Tf\n50 720 Td\n(ZapMail Document: ${safeDocTitle}) Tj\n/F1 12 Tf\n0 -35 Td\n(Buildathon Verified Telecom & Carrier Specification) Tj\n0 -25 Td\n(Official verified transmission preview) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000497 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n574\n%%EOF`;
        const encoder = new TextEncoder();
        const bytes = encoder.encode(fallbackPdfContent);
        setPdfBytes(bytes);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        activeBlobUrl = URL.createObjectURL(blob);
        setPdfPreviewUrl(activeBlobUrl);
      } catch (err) {
        console.warn('[PDF Preview] Failed to prepare PDF preview:', err);
        setPdfPreviewUrl(rawFileUrl || '/carrier_specification_doc.pdf');
      } finally {
        setIsLoadingPdf(false);
      }
    }

    preparePdfUrl();

    return () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
      }
    };
  }, [isOpen, attachment?.id, attachment?.url, attachment?.dataUrl, isPdf, filename, rawFileUrl]);

  const activeDownloadUrl = pdfPreviewUrl || rawFileUrl;

  const handleDownload = (e) => {
    if (e) e.stopPropagation();
    if (!activeDownloadUrl) return;

    const link = document.createElement('a');
    link.href = activeDownloadUrl;
    link.download = filename || 'download.pdf';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full h-full sm:h-[90vh] sm:max-w-4xl bg-[#242524] border-0 sm:border border-[#4E4F4E] rounded-none sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#202120] border-b border-[#4E4F4E] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#B50000]/15 border border-[#B50000]/30 flex items-center justify-center text-[#FF8585] shrink-0">
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-xs md:max-w-sm" title={filename}>
                {filename}
              </h3>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                {formatFileSize(size)} {mimeType ? `• ${mimeType}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Fallback Toolbar Link: Open in New Tab */}
            {activeDownloadUrl && (
              <a
                href={activeDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-[#2C2D2C] hover:bg-[#3C3D3C] text-slate-200 hover:text-white border border-[#4E4F4E] text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Open Document in New Tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#FF8585]" />
                <span className="hidden sm:inline">Open in New Tab</span>
              </a>
            )}

            {activeDownloadUrl && (
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#B50000] hover:bg-[#990000] text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-[#B50000]/25 transition cursor-pointer"
                title="Download Attachment"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-gray-400 hover:text-white hover:bg-[#3C3D3C] transition cursor-pointer"
              title="Close Preview"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Preview Container */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#161716] overflow-hidden">
          {isImage && rawFileUrl ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-auto">
              <img
                src={rawFileUrl}
                alt={filename}
                className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-xl border border-[#4E4F4E]"
              />
            </div>
          ) : isPdf ? (
            <div className="flex-1 flex flex-col min-h-0 relative">
              {isLoadingPdf ? (
                <div className="flex-1 flex flex-col items-center justify-center bg-[#1A1B1A] text-slate-300 gap-2">
                  <RefreshCw className="w-6 h-6 text-[#FF8585] animate-spin" />
                  <span className="text-xs font-medium">Preparing document...</span>
                </div>
              ) : (
                <InteractivePdfViewer
                  pdfUrl={pdfPreviewUrl}
                  pdfBytes={pdfBytes}
                  filename={filename}
                  activeDownloadUrl={activeDownloadUrl}
                />
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-3xl bg-[#B50000]/15 border border-[#B50000]/30 text-[#FF8585] flex items-center justify-center mx-auto mb-4">
                <Icon className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-white mb-1 truncate max-w-sm">
                {filename}
              </h4>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed max-w-xs">
                Preview not available for this file type. Click download to view this document on your device.
              </p>
              {activeDownloadUrl && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#B50000] hover:bg-[#990000] text-white font-semibold text-xs shadow-lg shadow-[#B50000]/25 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Document ({formatFileSize(size)})</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
