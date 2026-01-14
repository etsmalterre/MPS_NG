import * as React from 'react';
interface SheetProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
}
declare function Sheet({ open, onOpenChange, children }: SheetProps): import("react/jsx-runtime").JSX.Element;
interface SheetTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean;
}
declare const SheetTrigger: React.ForwardRefExoticComponent<SheetTriggerProps & React.RefAttributes<HTMLButtonElement>>;
interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
    side?: 'left' | 'right' | 'top' | 'bottom';
}
declare const SheetContent: React.ForwardRefExoticComponent<SheetContentProps & React.RefAttributes<HTMLDivElement>>;
declare const SheetHeader: {
    ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): import("react/jsx-runtime").JSX.Element;
    displayName: string;
};
declare const SheetTitle: React.ForwardRefExoticComponent<React.HTMLAttributes<HTMLHeadingElement> & React.RefAttributes<HTMLHeadingElement>>;
export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle };
//# sourceMappingURL=sheet.d.ts.map