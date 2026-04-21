import type { SVGProps } from 'react'

export function FabricRollIcon(props: SVGProps<SVGSVGElement>) {
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
      {/* Vertical fabric bolt — rounded cylinder with a flap hanging off
          the bottom-right so it reads as "rolled textile" rather than a plain can. */}
      {/* Cylinder body */}
      <rect x="5" y="3" width="11" height="18" rx="2" />
      {/* Top edge ellipse (the visible end of the roll) */}
      <ellipse cx="10.5" cy="3.5" rx="5.5" ry="1.3" />
      {/* Inner coil lines to hint at wound fabric */}
      <line x1="7" y1="8.5" x2="14" y2="8.5" />
      <line x1="7" y1="12.5" x2="14" y2="12.5" />
      <line x1="7" y1="16.5" x2="14" y2="16.5" />
      {/* Fabric flap unrolling off the side */}
      <path d="M16 12 L20 11 L21 19 L16 18" />
    </svg>
  )
}
