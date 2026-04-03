import type { SVGProps } from 'react'

export function BobineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Top cap (small ellipse) */}
      <ellipse cx="12" cy="3.5" rx="3.5" ry="1.5" />
      {/* Bottom cap (wide ellipse) */}
      <ellipse cx="12" cy="21" rx="5.5" ry="1.5" />
      {/* Left edge of cone */}
      <line x1="8.5" y1="3.5" x2="6.5" y2="21" />
      {/* Right edge of cone */}
      <line x1="15.5" y1="3.5" x2="17.5" y2="21" />
      {/* Diagonal thread lines (top-left to bottom-right) */}
      <line x1="8.8" y1="6" x2="15" y2="9" />
      <line x1="7.8" y1="10" x2="16" y2="14" />
      <line x1="7.2" y1="14" x2="17" y2="19" />
      {/* Diagonal thread lines (top-right to bottom-left) */}
      <line x1="15.2" y1="6" x2="9" y2="9" />
      <line x1="16" y1="10" x2="8" y2="14" />
      <line x1="16.8" y1="14" x2="7" y2="19" />
    </svg>
  )
}
