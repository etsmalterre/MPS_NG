import { LayoutDashboard, Users, Package, Building2, Truck, Tag, Factory, Boxes, Globe, Settings, } from 'lucide-react';
// Dashboard - standalone item at top
export const dashboardItem = {
    id: 'dashboard',
    title: 'Tableau de bord',
    icon: LayoutDashboard,
    href: '/',
    submenus: [],
};
// Settings - standalone item at bottom
export const settingsItem = {
    id: 'settings',
    title: 'Paramètres',
    icon: Settings,
    href: '/settings',
    submenus: [],
};
// Main navigation items (between dashboard and settings)
export const mainNavigation = [
    {
        id: 'clients',
        title: 'Clients',
        icon: Users,
        href: '/clients',
        submenus: [
            { title: 'Commandes', href: '/clients/commandes' },
            { title: 'Devis', href: '/clients/devis' },
            { title: 'Facturation', href: '/clients/facturation' },
            { title: 'Gestion', href: '/clients/gestion' },
        ],
    },
    {
        id: 'fournisseurs',
        title: 'Fournisseurs',
        icon: Package,
        href: '/fournisseurs',
        submenus: [
            { title: 'Commandes', href: '/fournisseurs/commandes' },
            { title: 'Gestion', href: '/fournisseurs/gestion' },
        ],
    },
    {
        id: 'sous-traitants',
        title: 'Sous-traitants',
        icon: Building2,
        href: '/sous-traitants',
        submenus: [
            { title: 'Commandes', href: '/sous-traitants/commandes' },
            { title: 'Gestion', href: '/sous-traitants/gestion' },
        ],
    },
    {
        id: 'production',
        title: 'Production',
        icon: Factory,
        href: '/production',
        submenus: [
            { title: 'Tricotage', href: '/production/tricotage' },
            { title: 'Teinture', href: '/production/teinture' },
            { title: 'Confection', href: '/production/confection' },
            { title: 'Contrôle qualité', href: '/production/controle-qualite' },
        ],
    },
    {
        id: 'stock',
        title: 'Stock',
        icon: Boxes,
        href: '/stock',
        submenus: [
            { title: 'Matières premières', href: '/stock/matieres' },
            { title: 'Produits finis', href: '/stock/produits' },
            { title: 'Mouvements', href: '/stock/mouvements' },
        ],
    },
    {
        id: 'produits',
        title: 'Produits',
        icon: Tag,
        href: '/produits',
        submenus: [
            { title: 'Références', href: '/produits/references' },
            { title: 'Coloris', href: '/produits/coloris' },
        ],
    },
    {
        id: 'transport',
        title: 'Transport',
        icon: Truck,
        href: '/transport',
        submenus: [
            { title: 'Expéditions', href: '/transport/expeditions' },
            { title: 'Livraisons', href: '/transport/livraisons' },
        ],
    },
    {
        id: 'reseau',
        title: 'Réseau',
        icon: Globe,
        href: '/reseau',
        submenus: [
            { title: 'Entreprises', href: '/reseau/entreprises' },
        ],
    },
];
// Helper to find active menu based on current path
export function getActiveMenu(pathname) {
    // Check dashboard
    if (pathname === dashboardItem.href) {
        return dashboardItem;
    }
    // Check settings
    if (pathname === settingsItem.href || pathname.startsWith(settingsItem.href + '/')) {
        return settingsItem;
    }
    // Check main navigation
    return mainNavigation.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'));
}
// Route titles for breadcrumbs
export const routeTitles = {
    '/': 'Accueil',
    // Clients
    '/clients': 'Clients',
    '/clients/commandes': 'Commandes',
    '/clients/devis': 'Devis',
    '/clients/facturation': 'Facturation',
    '/clients/gestion': 'Gestion',
    // Fournisseurs
    '/fournisseurs': 'Fournisseurs',
    '/fournisseurs/commandes': 'Commandes',
    '/fournisseurs/gestion': 'Gestion',
    // Sous-traitants
    '/sous-traitants': 'Sous-traitants',
    '/sous-traitants/commandes': 'Commandes',
    '/sous-traitants/gestion': 'Gestion',
    // Production
    '/production': 'Production',
    '/production/tricotage': 'Tricotage',
    '/production/teinture': 'Teinture',
    '/production/confection': 'Confection',
    '/production/controle-qualite': 'Contrôle qualité',
    // Stock
    '/stock': 'Stock',
    '/stock/matieres': 'Matières premières',
    '/stock/produits': 'Produits finis',
    '/stock/mouvements': 'Mouvements',
    // Produits
    '/produits': 'Produits',
    '/produits/references': 'Références',
    '/produits/coloris': 'Coloris',
    // Transport
    '/transport': 'Transport',
    '/transport/expeditions': 'Expéditions',
    '/transport/livraisons': 'Livraisons',
    // Réseau
    '/reseau': 'Réseau',
    '/reseau/entreprises': 'Entreprises',
    // Settings
    '/settings': 'Paramètres',
};
//# sourceMappingURL=navigation.js.map