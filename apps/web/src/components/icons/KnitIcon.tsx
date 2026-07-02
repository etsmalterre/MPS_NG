import type { SVGProps } from 'react'

export function KnitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Three rows of interlocking knit loops — each row is a chain of V/U
          shapes offset a half-step from the row above to form a mesh. */}
      {/* Row 1 — peaks */}
      <path d="M2 7 L6 4 L10 7 L14 4 L18 7 L22 4" />
      {/* Row 2 — valleys (offset) */}
      <path d="M2 13 L6 10 L10 13 L14 10 L18 13 L22 10" />
      {/* Row 3 — peaks */}
      <path d="M2 19 L6 16 L10 19 L14 16 L18 19 L22 16" />
      {/* Vertical connectors between rows (gives the interlock feel) —
          every peak/valley is tied to the row below so each loop of the
          mesh reads as closed, not just the one cell. */}
      {/* Rows 1 → 2 */}
      <line x1="6" y1="4" x2="6" y2="10" />
      <line x1="10" y1="7" x2="10" y2="13" />
      <line x1="14" y1="4" x2="14" y2="10" />
      <line x1="18" y1="7" x2="18" y2="13" />
      {/* Rows 2 → 3 */}
      <line x1="6" y1="10" x2="6" y2="16" />
      <line x1="10" y1="13" x2="10" y2="19" />
      <line x1="14" y1="10" x2="14" y2="16" />
      <line x1="18" y1="13" x2="18" y2="19" />
    </svg>
  )
}
