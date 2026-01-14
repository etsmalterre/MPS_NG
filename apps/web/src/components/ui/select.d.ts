import * as React from 'react';
interface SelectProps {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
}
declare function Select({ value, defaultValue, onValueChange, children }: SelectProps): import("react/jsx-runtime").JSX.Element;
interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
}
declare const SelectTrigger: React.ForwardRefExoticComponent<SelectTriggerProps & React.RefAttributes<HTMLButtonElement>>;
interface SelectValueProps {
    placeholder?: string;
}
declare function SelectValue({ placeholder }: SelectValueProps): import("react/jsx-runtime").JSX.Element;
interface SelectContentProps extends React.HTMLAttributes<HTMLDivElement> {
}
declare const SelectContent: React.ForwardRefExoticComponent<SelectContentProps & React.RefAttributes<HTMLDivElement>>;
interface SelectItemProps extends React.HTMLAttributes<HTMLDivElement> {
    value: string;
}
declare const SelectItem: React.ForwardRefExoticComponent<SelectItemProps & React.RefAttributes<HTMLDivElement>>;
export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, };
//# sourceMappingURL=select.d.ts.map