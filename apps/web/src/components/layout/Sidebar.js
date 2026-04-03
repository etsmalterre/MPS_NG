import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mainNavigation, dashboardItem, settingsItem } from '@/config/navigation';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu } from '@/components/ui/context-menu';
function NavItem({ item, collapsed, pathname, onNavigate }) {
    const Icon = item.icon;
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
    const targetHref = item.submenus.length > 0 ? item.submenus[0].href : item.href;
    const contextMenuItems = item.submenus.map((sub) => ({
        label: sub.title,
        href: sub.href,
    }));
    const handleContextSelect = (menuItem) => {
        onNavigate(menuItem.href);
    };
    const navLinkContent = collapsed ? (_jsxs(NavLink, { to: targetHref, title: item.title, className: cn('flex h-12 w-full items-center justify-center rounded-md transition-all relative', isActive
            ? 'bg-white/20 text-white'
            : 'text-white/85 hover:bg-white/10 hover:text-white'), children: [isActive && (_jsx("div", { className: "absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" })), _jsx(Icon, { className: "h-5 w-5" })] })) : (_jsxs(NavLink, { to: targetHref, className: cn('flex h-12 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all relative', isActive
            ? 'bg-white/20 text-white'
            : 'text-white/85 hover:bg-white/10 hover:text-white'), children: [isActive && (_jsx("div", { className: "absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" })), _jsx(Icon, { className: "h-5 w-5 shrink-0" }), _jsx("span", { className: "truncate", children: item.title })] }));
    // Only wrap with context menu if there are submenus
    if (contextMenuItems.length > 0) {
        return (_jsx(ContextMenu, { items: contextMenuItems, onSelect: handleContextSelect, children: navLinkContent }));
    }
    return navLinkContent;
}
export function Sidebar({ collapsed, onToggle, className }) {
    const location = useLocation();
    const navigate = useNavigate();
    const handleNavigate = (href) => {
        navigate(href);
    };
    return (_jsxs("aside", { className: cn('fixed left-0 top-0 z-40 h-screen flex-col border-r border-primary/20 transition-all duration-300', 'bg-gradient-to-b from-primary via-primary/95 to-primary/90', collapsed ? 'w-16' : 'w-64', className), children: [_jsx("div", { className: "flex h-14 items-center border-b border-white/10 px-3", children: import.meta.env.DEV ? _jsx("img", { src: "/logo-dev.webp", alt: "MPS DEV", className: "h-12 w-auto mx-auto rounded" }) : collapsed ? _jsx("img", { src: "/logo-small.png", alt: "MPS", className: "h-8 w-auto mx-auto" }) : _jsx("img", { src: "/logo-full.png", alt: "MPS", className: "h-10 w-auto mx-auto" }) }), _jsx(ScrollArea, { className: "flex-1 py-4", children: _jsxs("nav", { className: "space-y-1 px-2", children: [_jsx(NavItem, { item: dashboardItem, collapsed: collapsed, pathname: location.pathname, onNavigate: handleNavigate }), _jsx("div", { className: "my-2 border-t border-white/10" }), mainNavigation.map((item) => (_jsx(NavItem, { item: item, collapsed: collapsed, pathname: location.pathname, onNavigate: handleNavigate }, item.id)))] }) }), _jsx("div", { className: "border-t border-white/10 px-2 py-2", children: _jsx(NavItem, { item: settingsItem, collapsed: collapsed, pathname: location.pathname, onNavigate: handleNavigate }) }), _jsx("div", { className: "border-t border-white/10 p-2", children: _jsx(Button, { variant: "ghost", size: "icon", onClick: onToggle, className: "w-full text-white/85 hover:text-white hover:bg-white/10", children: collapsed ? (_jsx(ChevronRight, { className: "h-4 w-4" })) : (_jsx(ChevronLeft, { className: "h-4 w-4" })) }) })] }));
}
//# sourceMappingURL=Sidebar.js.map