import type { SVGProps } from 'react'

export function BobineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Top cap */}
      <rect x="8" y="1.5" width="8" height="2.5" rx="0.8" fill="currentColor" stroke="none" />
      {/* Bottom cap */}
      <rect x="8" y="20" width="8" height="2.5" rx="0.8" fill="currentColor" stroke="none" />
      {/* Cone body */}
      <path d="M8 4 L6 20 L18 20 L16 4 Z" fill="currentColor" stroke="none" />
      {/* Diagonal thread lines */}
      <line x1="7.2" y1="18" x2="14.5" y2="5" stroke="var(--bg, white)" strokeWidth="1.2" />
      <line x1="8" y1="15" x2="15.2" y2="5" stroke="var(--bg, white)" strokeWidth="1.2" />
      <line x1="9" y1="12" x2="15.8" y2="5.5" stroke="var(--bg, white)" strokeWidth="1.2" />
      <line x1="10" y1="9.5" x2="16.3" y2="6.5" stroke="var(--bg, white)" strokeWidth="1.2" />
      {/* Cross diagonal lines */}
      <line x1="16.8" y1="18" x2="9.5" y2="5" stroke="var(--bg, white)" strokeWidth="1.2" />
      <line x1="16" y1="15" x2="8.8" y2="5" stroke="var(--bg, white)" strokeWidth="1.2" />
      <line x1="15" y1="12" x2="8.2" y2="5.5" stroke="var(--bg, white)" strokeWidth="1.2" />
      <line x1="14" y1="9.5" x2="7.7" y2="6.5" stroke="var(--bg, white)" strokeWidth="1.2" />
    </svg>
  )
}
