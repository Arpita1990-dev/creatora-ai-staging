import Image from 'next/image';

export function LandingAssetIcon({ icon, size = 40 }) {
  return <Image src={`/assets/icons/${icon}.png`} alt="" aria-hidden="true" width={size} height={size} className="cr-asset-icon" />;
}

export function SparkIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.5c.7 5.2 4.1 8.6 9.5 9.5-5.4.9-8.8 4.3-9.5 9.5-.8-5.2-4.2-8.6-9.5-9.5C7.8 11.1 11.2 7.7 12 2.5Z" fill="currentColor"/><path d="M19 2c.2 1.7 1.3 2.8 3 3-1.7.2-2.8 1.3-3 3-.3-1.7-1.3-2.8-3-3 1.7-.2 2.7-1.3 3-3Z" fill="currentColor"/></svg>;
}
export function PlayIcon({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 7 8 5-8 5V7Z" fill="currentColor"/></svg>; }
export function CheckIcon({ size = 16 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.2 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
export function ArrowIcon({ size = 18 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>; }
export function PlatformIcon({ platform, size = 22 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true };
  if (platform === 'facebook') return <svg {...common} fill="currentColor"><path d="M14 8h3V4.2c-.5-.1-2.2-.2-4-.2-3.9 0-6.5 2.3-6.5 6.7V14H3v4.3h3.5V24h4.3v-5.7h3.6L15 14h-4.2v-2.9C10.8 9.9 11.1 8 14 8Z"/></svg>;
  if (platform === 'instagram') return <svg {...common} fill="none"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2"/><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>;
  if (platform === 'linkedin') return <svg {...common} fill="currentColor"><path d="M5.3 7.8H1V21h4.3V7.8ZM3.2 1A2.2 2.2 0 1 0 3.2 5.4 2.2 2.2 0 0 0 3.2 1ZM21 13.4c0-4-2.1-5.9-5-5.9-2.3 0-3.3 1.3-3.9 2.2V7.8H7.8V21h4.3v-6.5c0-1.7.3-3.4 2.5-3.4 2.2 0 2.2 2 2.2 3.5V21H21v-7.6Z"/></svg>;
  return <svg {...common} fill="none"><rect x="2" y="5" width="20" height="14" rx="5" fill="currentColor"/><path d="m10 9 5 3-5 3V9Z" fill="#ff0033"/></svg>;
}

