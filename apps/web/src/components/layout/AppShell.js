import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
export function AppShell({ children }) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    return (_jsxs("div", { className: "h-screen bg-background flex overflow-hidden", children: [_jsx(Sidebar, { collapsed: sidebarCollapsed, onToggle: () => setSidebarCollapsed(!sidebarCollapsed), className: "hidden lg:flex" }), _jsx(MobileNav, { open: mobileNavOpen, onOpenChange: setMobileNavOpen }), _jsxs("div", { className: `flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`, children: [_jsx(Header, { onMenuClick: () => setMobileNavOpen(true), sidebarCollapsed: sidebarCollapsed }), _jsx("main", { className: "flex-1 min-h-0 p-4 lg:p-6 flex flex-col overflow-hidden", children: children || _jsx(Outlet, {}) })] })] }));
}
//# sourceMappingURL=AppShell.js.map
