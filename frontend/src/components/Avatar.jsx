import React from 'react';

/**
 * Reusable Avatar component supporting image upload, monogram fallback,
 * background color/gradient styling, and an unclipped online indicator badge.
 *
 * Adheres strictly to the layout requirements:
 * 1. Outer wrapper is `relative inline-block` with `overflow: visible`.
 * 2. `rounded-full` (border-radius: 50%) and `overflow-hidden` are applied strictly
 *    to the <img> tag or inner image container.
 * 3. Online badge is positioned `absolute bottom-0 right-0` with `z-10` and a thin ring
 *    border matching the background color so it overlays cleanly without being cut off.
 */
export default function Avatar({
  image = null,
  initials = 'PM',
  size = 'md', // 'xs', 'sm', 'md', 'lg', 'xl', or custom px/rem
  bgColor = '#B50000',
  isOnline = false,
  onlineBadgeColor = 'bg-[#B50000]',
  ringColor = 'ring-[#2C2D2C]', // matches surrounding bg
  onClick = null,
  className = '',
  title = '',
  alt = 'Avatar'
}) {
  // Size mapping
  const sizeMap = {
    xs: { box: 'w-6 h-6 text-[10px]', badge: 'w-2 h-2', ring: 'ring-1.5' },
    sm: { box: 'w-8 h-8 text-xs', badge: 'w-2 h-2', ring: 'ring-2' },
    md: { box: 'w-9 h-9 text-xs', badge: 'w-2.5 h-2.5', ring: 'ring-2' },
    lg: { box: 'w-11 h-11 text-sm font-bold', badge: 'w-3 h-3', ring: 'ring-2' },
    xl: { box: 'w-20 h-20 text-2xl font-extrabold', badge: 'w-4 h-4', ring: 'ring-2' },
    '2xl': { box: 'w-28 h-28 text-3xl font-black', badge: 'w-5 h-5', ring: 'ring-4' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  // Background styling
  const isHexOrRgb = bgColor && (bgColor.startsWith('#') || bgColor.startsWith('rgb'));
  const bgStyle = isHexOrRgb ? { backgroundColor: bgColor } : {};
  const bgClass = !isHexOrRgb && bgColor ? `bg-gradient-to-tr ${bgColor}` : '';

  const content = (
    <>
      {/* Inner Image/Monogram Container: Strictly applies rounded-full & overflow-hidden */}
      <div
        style={bgStyle}
        className={`${currentSize.box} rounded-full overflow-hidden ${bgClass} flex items-center justify-center text-white font-bold select-none shrink-0 shadow-sm transition-transform duration-150`}
      >
        {image ? (
          <img
            src={image}
            alt={alt}
            className="w-full h-full object-cover rounded-full pointer-events-none"
          />
        ) : (
          <span className="uppercase tracking-tight leading-none">
            {initials ? initials.slice(0, 2) : 'PM'}
          </span>
        )}
      </div>

      {/* Online Indicator Green Badge: Positioned absolute bottom-0 right-0 z-10 with thin ring */}
      {isOnline && (
        <span
          className={`absolute bottom-0 right-0 z-10 ${currentSize.badge} rounded-full ${onlineBadgeColor} ${ringColor} ${currentSize.ring || 'ring-2'} pointer-events-none`}
          style={{ transform: 'translate(10%, 10%)' }}
          aria-label="Online"
        />
      )}
    </>
  );

  // Outer Wrapper: strictly relative inline-block with overflow: visible
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className={`relative inline-block overflow-visible p-0 bg-transparent border-0 cursor-pointer focus:outline-none transition transform hover:scale-105 active:scale-95 ${className}`}
        style={{ overflow: 'visible' }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      title={title}
      className={`relative inline-block overflow-visible ${className}`}
      style={{ overflow: 'visible' }}
    >
      {content}
    </div>
  );
}
