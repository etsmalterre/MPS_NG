import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { mainNavigation, dashboardItem, settingsItem } from '@/config/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
export function MobileNav({ open, onOpenChange }) {
    return (_jsx(Sheet, { open: open, onOpenChange: onOpenChange, children: _jsxs(SheetContent, { side: "left", className: "w-80 p-0 bg-gradient-to-b from-primary via-primary/95 to-primary/90 border-r-0", children: [_jsx(SheetHeader, { className: "border-b border-white/10 px-6 h-14 flex items-center", children: _jsx(SheetTitle, { className: "flex items-center gap-2", children: _jsx("span", { className: "font-semibold text-2xl", children: _jsx("span", { className: "text-accent", children: "MPS" }) }) }) }), _jsx(ScrollArea, { className: "h-[calc(100vh-65px)]", children: _jsxs("nav", { className: "space-y-1 p-4", children: [_jsx(MobileNavItemSimple, { item: dashboardItem, onNavigate: () => onOpenChange(false) }), _jsx("div", { className: "my-2 border-t border-white/10" }), mainNavigation.map((item) => (_jsx(MobileNavItem, { item: item, onNavigate: () => onOpenChange(false) }, item.id))), _jsx("div", { className: "my-2 border-t border-white/10" }), _jsx(MobileNavItemSimple, { item: settingsItem, onNavigate: () => onOpenChange(false) })] }) })] }) }));
}
// Simple nav item for dashboard/settings (no submenus)
function MobileNavItemSimple({ item, onNavigate }) {
    const location = useLocation();
    const Icon = item.icon;
    const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
    return (_jsxs(NavLink, { to: item.href, onClick: onNavigate, className: cn('flex h-12 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all relative', isActive
            ? 'bg-white/20 text-white'
            : 'text-white/85 hover:bg-white/10 hover:text-white'), children: [isActive && (_jsx("div", { className: "absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" })), _jsx(Icon, { className: "h-5 w-5 shrink-0" }), _jsx("span", { className: "truncate", children: item.title })] }));
}
function MobileNavItem({ item, onNavigate }) {
    const location = useLocation();
    const [open, setOpen] = useState(false);
    const Icon = item.icon;
    const isActive = location.pathname === item.href ||
        location.pathname.startsWith(item.href + '/');
    return (_jsxs(Collapsible, { open: open, onOpenChange: setOpen, children: [_jsxs(CollapsibleTrigger, { className: cn('flex h-12 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-all relative', isActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/85 hover:bg-white/10 hover:text-white'), children: [isActive && (_jsx("div", { className: "absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" })), _jsx(Icon, { className: "h-5 w-5 shrink-0" }), _jsx("span", { className: "flex-1 text-left truncate", children: item.title }), _jsx(ChevronDown, { className: cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180') })] }), _jsx(CollapsibleContent, { className: "space-y-1 pt-1", children: item.submenus.map((submenu) => (_jsx(NavLink, { to: submenu.href, onClick: onNavigate, className: ({ isActive: linkActive }) => cn('flex h-10 items-center gap-3 rounded-md px-3 pl-10 text-sm transition-all', linkActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'), children: _jsx("span", { className: "truncate", children: submenu.title }) }, submenu.href))) })] }));
}
//# sourceMappingURL=MobileNav.js.map