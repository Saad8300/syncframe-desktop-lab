import React, { useState, useEffect, useRef } from 'react';
import { ResolvedCaptionStyle } from '../utils/captionResolver';

interface Props {
  resolvedStyle: ResolvedCaptionStyle;
}

export function CaptionPreview({ resolvedStyle }: Props) {
  const [aspectRatio, setAspectRatio] = useState<'9:16'|'16:9'|'1:1'>('9:16');
  const [sampleText, setSampleText] = useState("That is exactly\nthe problem.");
  const [bgType, setBgType] = useState<'dark'|'video'|'grid'>('video');
  const [showGuides, setShowGuides] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const baseWidth = aspectRatio === '9:16' ? 1080 : aspectRatio === '16:9' ? 1920 : 1080;
  const baseHeight = aspectRatio === '9:16' ? 1920 : aspectRatio === '16:9' ? 1080 : 1080;

  // Auto-scale the preview to fit the container
  useEffect(() => {
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        const padding = 64; // 32px padding on each side
        const availableWidth = width - padding;
        const availableHeight = height - padding;

        const scaleX = availableWidth / baseWidth;
        const scaleY = availableHeight / baseHeight;
        setScale(Math.min(scaleX, scaleY));
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [baseWidth, baseHeight]);

  const isShadowGlow = resolvedStyle.shadowStyle === 'glow';
  const textShadow = resolvedStyle.shadowStyle !== 'none'
    ? (isShadowGlow
        ? `0 0 20px ${resolvedStyle.shadowColor}, 0 0 40px ${resolvedStyle.shadowColor}`
        : `4px 4px 10px ${resolvedStyle.shadowColor}`)
    : 'none';

  const WebkitTextStroke = resolvedStyle.outlineStyle !== 'none'
    ? `${resolvedStyle.outlineStyle === 'thin' ? '2px' : resolvedStyle.outlineStyle === 'thick' ? '6px' : '4px'} ${resolvedStyle.outlineColor}`
    : 'none';

  const boxStyles = resolvedStyle.boxStyle !== 'none' ? {
    backgroundColor: resolvedStyle.boxStyle === 'subtle' ? `${resolvedStyle.boxColor}80` : resolvedStyle.boxColor,
    padding: '20px 40px',
    borderRadius: '16px'
  } : {};

  const alignItems = resolvedStyle.textAlign === 'left' ? 'flex-start' : resolvedStyle.textAlign === 'right' ? 'flex-end' : 'center';
  const textAlign = resolvedStyle.textAlign as any;

  let justifyContent = 'flex-end';
  if (resolvedStyle.position.includes('top')) justifyContent = 'flex-start';
  if (resolvedStyle.position.includes('center') && !resolvedStyle.position.includes('lower')) justifyContent = 'center';

  const bottomOffset = resolvedStyle.position.includes('lower') || resolvedStyle.position.includes('bottom')
    ? 200 + resolvedStyle.verticalOffset
    : resolvedStyle.position.includes('top') ? 200 + resolvedStyle.verticalOffset : 0;

  const bgStyle = bgType === 'video'
    ? { backgroundImage: 'url("https://images.unsplash.com/photo-1601506521937-0121a7fc2a6b?q=80&w=2000&auto=format&fit=crop")', backgroundSize: 'cover', backgroundPosition: 'center' }
    : bgType === 'grid'
    ? { backgroundImage: 'linear-gradient(#222 1px, transparent 1px), linear-gradient(90deg, #222 1px, transparent 1px)', backgroundSize: '40px 40px', backgroundColor: '#0a0a0a' }
    : { backgroundColor: '#000000' };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#050505] min-w-0 min-h-0">
      {/* Preview Area */}
      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center p-8 relative min-w-0 min-h-0">
        <div className="relative w-0 h-0 flex items-center justify-center">
          <div
            className="absolute bg-black rounded shadow-2xl overflow-hidden flex transition-all duration-200"
            style={{
              width: baseWidth,
              height: baseHeight,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              ...bgStyle
            }}
          >
            {/* Overlay to ensure contrast in preview */}
            {bgType === 'video' && <div className="absolute inset-0 bg-black/40"></div>}

            {/* Safe Area Guides */}
            {showGuides && (
              <div className="absolute inset-0 pointer-events-none p-12">
                <div className="w-full h-full border border-dashed border-white/20 rounded-lg"></div>
              </div>
            )}

            <div className="absolute inset-0 flex" style={{ justifyContent, alignItems: 'center', flexDirection: 'column' }}>
              <div
                style={{
                  width: `${resolvedStyle.maxWidth}%`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems,
                  marginBottom: bottomOffset > 0 && justifyContent === 'flex-end' ? `${bottomOffset}px` : 0,
                  marginTop: justifyContent === 'flex-start' ? `${bottomOffset}px` : 0,
                }}
              >
                <div
                  style={{
                    ...boxStyles,
                    fontFamily: resolvedStyle.fontFamily,
                    fontWeight: resolvedStyle.fontWeight,
                    fontSize: `${(resolvedStyle.fontScale * 80)}px`,
                    textTransform: resolvedStyle.textTransform as any,
                    letterSpacing: `${resolvedStyle.letterSpacing}em`,
                    lineHeight: resolvedStyle.lineHeight === 'tight' ? 1.1 : resolvedStyle.lineHeight === 'relaxed' ? 1.5 : 1.3,
                    textAlign,
                    color: resolvedStyle.primaryColor,
                    textShadow,
                    WebkitTextStroke,
                  }}
                >
                  {sampleText.split('\\n').map((line, i) => (
                    <div key={i} style={{
                      color: (resolvedStyle.accentMode === 'second_line' && i === 1) || (resolvedStyle.accentMode === 'alternate_phrase' && i % 2 !== 0)
                        ? resolvedStyle.accentColor
                        : resolvedStyle.primaryColor
                    }}>
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preview Toolbar */}
      <div className="h-10 border-t border-gray-800/60 bg-[#0a0a0a] flex items-center justify-between px-4">
        <div className="flex gap-1 bg-gray-900 rounded p-0.5 border border-gray-800">
          {['9:16', '16:9', '1:1'].map(ar => (
            <button
              key={ar} onClick={() => setAspectRatio(ar as any)}
              className={`px-2 py-0.5 text-[10px] rounded transition font-medium ${aspectRatio === ar ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {ar}
            </button>
          ))}
        </div>

        <div className="flex-1 mx-6 flex justify-center">
          <input
            type="text"
            value={sampleText}
            onChange={e => setSampleText(e.target.value)}
            placeholder="Sample text (use \n for newline)"
            className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded text-[11px] px-3 py-1 text-gray-300 outline-none focus:border-gray-600 text-center font-mono transition"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showGuides} onChange={e => setShowGuides(e.target.checked)} className="rounded border-gray-700 text-blue-500 focus:ring-transparent bg-gray-900 w-3 h-3" />
            <span className="text-[10px] text-gray-500 font-medium uppercase">Guides</span>
          </label>
          <div className="h-3 w-px bg-gray-800"></div>
          <div className="flex gap-1 bg-gray-900 rounded p-0.5 border border-gray-800">
            {['video', 'dark', 'grid'].map(bg => (
              <button
                key={bg} onClick={() => setBgType(bg as any)}
                className={`px-2 py-0.5 text-[9px] uppercase tracking-wider rounded transition font-semibold ${bgType === bg ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {bg}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
