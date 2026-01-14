import * as React from 'react';
interface TooltipProps {
    content: React.ReactNode;
    children: React.ReactNode;
    side?: 'top' | 'right' | 'bottom' | 'left';
    delayDuration?: number;
}
declare function Tooltip({ content, children, side, delayDuration, }: TooltipProps): import("react/jsx-runtime").JSX.Element;
export { Tooltip };
//# sourceMappingURL=tooltip.d.ts.map