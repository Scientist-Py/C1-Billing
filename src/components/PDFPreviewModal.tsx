import React, { useState, useEffect } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  Download, 
  Printer, 
  Share2, 
  Maximize2, 
  Minimize2, 
  Expand, 
  Columns
} from 'lucide-react';

interface PDFPreviewModalProps {
  pdfBlob: Blob;
  fileName: string;
  onClose: () => void;
}

export const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({ pdfBlob, fileName, onClose }) => {
  const [zoom, setZoom] = useState<number>(100);
  const [fitMode, setFitMode] = useState<'width' | 'page' | 'none'>('none');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string>('');

  useEffect(() => {
    // Generate object URL for the PDF blob
    const url = URL.createObjectURL(pdfBlob);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdfBlob]);

  // Construct URL with zoom/fit hash parameters for Chrome's native PDF plugin
  const getPdfUrlWithParams = () => {
    if (!objectUrl) return '';
    let hash = '';
    if (fitMode === 'width') {
      hash = '#zoom=FitW';
    } else if (fitMode === 'page') {
      hash = '#zoom=Fit';
    } else {
      hash = `#zoom=${zoom}`;
    }
    return `${objectUrl}${hash}`;
  };

  const handleZoomIn = () => {
    setFitMode('none');
    setZoom((prev) => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setFitMode('none');
    setZoom((prev) => Math.max(prev - 25, 50));
  };

  const handleFitWidth = () => {
    setFitMode('width');
  };

  const handleFitPage = () => {
    setFitMode('page');
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = objectUrl;
    document.body.appendChild(iframe);
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Remove iframe after print dialog opens
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: 'Invoice PDF',
          text: `Checkout Invoice from Chapter One Cafe: ${fileName}`
        });
      } catch (err) {
        console.warn('Error sharing file:', err);
      }
    } else {
      // Fallback: Copy PDF URL or download link
      navigator.clipboard.writeText(objectUrl);
      alert('Invoice download link copied to clipboard!');
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className={`bg-white rounded-3xl shadow-2xl flex flex-col border border-apple-gray-100 overflow-hidden transition-all duration-300 ${
          isFullscreen 
            ? 'w-screen h-screen rounded-none p-0' 
            : 'w-full max-w-[80vw] h-[90vh]'
        }`}
      >
        {/* PDF Control Header Bar */}
        <div className="bg-[#f5f5f7] border-b border-apple-gray-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <h3 className="text-xs font-bold text-apple-gray-800 truncate max-w-xs">{fileName}</h3>
          </div>

          {/* Interactive Toolbar */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomOut}
              className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold text-apple-gray-800 min-w-[40px] text-center font-mono">
              {fitMode !== 'none' ? `Fit ${fitMode}` : `${zoom}%`}
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-apple-gray-200 mx-2" />

            <button
              onClick={handleFitWidth}
              className={`p-2 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800 ${fitMode === 'width' ? 'bg-apple-gray-200' : 'hover:bg-apple-gray-200'}`}
              title="Fit Width"
            >
              <Columns className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitPage}
              className={`p-2 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800 ${fitMode === 'page' ? 'bg-apple-gray-200' : 'hover:bg-apple-gray-200'}`}
              title="Fit Page"
            >
              <Expand className="w-4 h-4" />
            </button>

            <div className="w-px h-4 bg-apple-gray-200 mx-2" />

            <button
              onClick={handleDownload}
              className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
              title="Download PDF"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handlePrint}
              className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleShare}
              className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
              title="Share Link"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-2 hover:bg-apple-gray-200 rounded-xl transition-apple text-[#86868b] hover:text-apple-gray-800"
            title="Close Preview"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* PDF Frame Viewer */}
        <div className="flex-1 bg-[#86868b] p-4 flex justify-center items-center overflow-auto select-none relative">
          {objectUrl ? (
            <iframe
              src={getPdfUrlWithParams()}
              className="w-full h-full border-none rounded-2xl shadow-lg bg-white"
              title="Invoice Render Target"
            />
          ) : (
            <div className="text-white text-xs font-light animate-pulse">Loading Invoice Rendering Engine...</div>
          )}
        </div>
      </div>
    </div>
  );
};
