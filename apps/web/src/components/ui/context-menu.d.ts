import * as React from 'react';
interface ContextMenuProps {
    children: React.ReactNode;
    items: ContextMenuItem[];
    onSelect: (item: ContextMenuItem) => void;
}
export interface ContextMenuItem {
    label: string;
    href: string;
}
export declare function ContextMenu({ children, items, onSelect }: ContextMenuProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=context-menu.d.ts.map