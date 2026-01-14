import { type LucideIcon } from 'lucide-react';
export interface SubMenuItem {
    title: string;
    href: string;
}
export interface MainMenuItem {
    id: string;
    title: string;
    icon: LucideIcon;
    href: string;
    submenus: SubMenuItem[];
}
export declare const dashboardItem: MainMenuItem;
export declare const settingsItem: MainMenuItem;
export declare const mainNavigation: MainMenuItem[];
export declare function getActiveMenu(pathname: string): MainMenuItem | undefined;
export declare const routeTitles: Record<string, string>;
//# sourceMappingURL=navigation.d.ts.map