import React from 'react';

interface TendaRouterIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Official TendaManager dual-antenna wireless router glyph.
 * Matches the provided TendaManager brand icon (dual vertical antennas,
 * 3-arc + center dot wireless signal, rounded chassis, 4 status LEDs, 2 feet).
 */
export const TendaRouterIcon: React.FC<TendaRouterIconProps> = ({
  size = 22,
  className,
  style,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Left Antenna */}
      <path
        d="M17.5 13C17.5 11.6193 18.6193 10.5 20 10.5C21.3807 10.5 22.5 11.6193 22.5 13V36H17.5V13Z"
        fill="currentColor"
      />
      <rect x="16.5" y="34.5" width="7" height="2.5" rx="0.8" fill="currentColor" />

      {/* Right Antenna */}
      <path
        d="M41.5 13C41.5 11.6193 42.6193 10.5 44 10.5C45.3807 10.5 46.5 11.6193 46.5 13V36H41.5V13Z"
        fill="currentColor"
      />
      <rect x="40.5" y="34.5" width="7" height="2.5" rx="0.8" fill="currentColor" />

      {/* Center Wi-Fi Signal Waves */}
      <path
        d="M23.5 13.8C28.3 9.4 35.7 9.4 40.5 13.8"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M26.5 17.8C29.6 15.0 34.4 15.0 37.5 17.8"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M29.3 21.8C30.9 20.4 33.1 20.4 34.7 21.8"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <circle cx="32" cy="25.5" r="2.3" fill="currentColor" />

      {/* Router Chassis with 4 Status LEDs */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 38C8.23858 38 6 40.2386 6 43V47C6 49.7614 8.23858 52 11 52H53C55.7614 52 58 49.7614 58 47V43C58 40.2386 55.7614 38 53 38H11ZM34.5 46.8C35.4941 46.8 36.3 45.9941 36.3 45C36.3 44.0059 35.4941 43.2 34.5 43.2C33.5059 43.2 32.7 44.0059 32.7 45C32.7 45.9941 33.5059 46.8 34.5 46.8ZM40.2 46.8C41.1941 46.8 42 45.9941 42 45C42 44.0059 41.1941 43.2 40.2 43.2C39.2059 43.2 38.4 44.0059 38.4 45C38.4 45.9941 39.2059 46.8 40.2 46.8ZM45.9 46.8C46.8941 46.8 47.7 45.9941 47.7 45C47.7 44.0059 46.8941 43.2 45.9 43.2C44.9059 43.2 44.1 44.0059 44.1 45C44.1 45.9941 44.9059 46.8 45.9 46.8ZM51.6 46.8C52.5941 46.8 53.4 45.9941 53.4 45C53.4 44.0059 52.5941 43.2 51.6 43.2C50.6059 43.2 49.8 44.0059 49.8 45C49.8 45.9941 50.6059 46.8 51.6 46.8Z"
        fill="currentColor"
      />

      {/* Router Feet */}
      <path d="M12.5 53H20.5V54.2C20.5 55.2 19.7 56 18.7 56H14.3C13.3 56 12.5 55.2 12.5 54.2V53Z" fill="currentColor" />
      <path d="M43.5 53H51.5V54.2C51.5 55.2 50.7 56 49.7 56H45.3C44.3 56 43.5 55.2 43.5 54.2V53Z" fill="currentColor" />
    </svg>
  );
};
