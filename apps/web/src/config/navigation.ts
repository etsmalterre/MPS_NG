import type { ComponentType, SVGProps } from 'react'
import {
  LayoutDashboard,
  Users,
  Building2,
  Truck,
  Megaphone,
  Box,
  ShieldCheck,
  FileBarChart,
  Globe,
  Settings,
} from 'lucide-react'
import { BobineIcon } from '@/components/icons/BobineIcon'
import { KnitIcon } from '@/components/icons/KnitIcon'
import { FabricRollIcon } from '@/components/icons/FabricRollIcon'

export type NavIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

export interface SubMenuItem {
  title: string
  href: string
  /** When true, the entry is only shown to admin users (Vincent Malterre).
   *  Filtered out of the sidebar render when !user.isAdmin. The page itself
   *  also enforces the same check, so direct URL access is blocked. */
  adminOnly?: boolean
}

export interface MainMenuItem {
  id: string
  title: string
  icon: NavIcon
  href: string
  submenus: SubMenuItem[]
}

// Dashboard - standalone item at top
export const dashboardItem: MainMenuItem = {
  id: 'dashboard',
  title: 'Tableau de bord',
  icon: LayoutDashboard,
  href: '/',
  submenus: [],
}

// Settings - standalone item at bottom
export const settingsItem: MainMenuItem = {
  id: 'settings',
  title: 'Paramètres',
  icon: Settings,
  href: '/settings',
  submenus: [
    { title: 'Utilisateurs', href: '/settings/utilisateurs', adminOnly: true },
  ],
}

// Main navigation items (between dashboard and settings).
// Order mirrors the legacy WinDev MPS main menu: Marketing, Clients,
// Sous-traitants, Transferts, Fils, Tombé Métier, Finis, Divers, Qualité,
// Rapports, Réseau.
export const mainNavigation: MainMenuItem[] = [
  {
    id: 'marketing',
    title: 'Marketing',
    icon: Megaphone,
    href: '/marketing',
    submenus: [],
  },
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
    id: 'transferts',
    title: 'Transferts',
    icon: Truck,
    href: '/transferts',
    submenus: [],
  },
  {
    id: 'fils',
    title: 'Fils',
    icon: BobineIcon,
    href: '/fils',
    submenus: [
      { title: 'Références', href: '/fils/references' },
      { title: 'Stock', href: '/fils/stock' },
      { title: 'Commandes', href: '/fils/commandes' },
      { title: 'Gestion', href: '/fils/gestion' },
      { title: 'Prévisions', href: '/fils/previsions' },
    ],
  },
  {
    id: 'tombe-metier',
    title: 'Tombé Métier',
    icon: KnitIcon,
    href: '/tombe-metier',
    submenus: [],
  },
  {
    id: 'finis',
    title: 'Finis',
    icon: FabricRollIcon,
    href: '/finis',
    submenus: [
      { title: 'Références', href: '/finis/references' },
      { title: 'Stock', href: '/finis/stock' },
      { title: 'Études coloris', href: '/finis/etudes-coloris' },
      { title: 'Tarifs', href: '/finis/tarifs' },
      { title: 'Coloris Teint', href: '/finis/coloris-teint' },
      { title: 'Prévisions', href: '/finis/previsions' },
    ],
  },
  {
    id: 'divers',
    title: 'Divers',
    icon: Box,
    href: '/divers',
    submenus: [],
  },
  {
    id: 'qualite',
    title: 'Qualité',
    icon: ShieldCheck,
    href: '/qualite',
    submenus: [],
  },
  {
    id: 'rapports',
    title: 'Rapports',
    icon: FileBarChart,
    href: '/rapports',
    submenus: [],
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
]

// Helper to find active menu based on current path
export function getActiveMenu(pathname: string): MainMenuItem | undefined {
  // Check dashboard
  if (pathname === dashboardItem.href) {
    return dashboardItem
  }
  // Check settings
  if (pathname === settingsItem.href || pathname.startsWith(settingsItem.href + '/')) {
    return settingsItem
  }
  // Check main navigation
  return mainNavigation.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  )
}

// Route titles for breadcrumbs
export const routeTitles: Record<string, string> = {
  '/': 'Accueil',
  // Marketing
  '/marketing': 'Marketing',
  // Clients
  '/clients': 'Clients',
  '/clients/commandes': 'Commandes',
  '/clients/devis': 'Devis',
  '/clients/facturation': 'Facturation',
  '/clients/gestion': 'Gestion',
  // Sous-traitants
  '/sous-traitants': 'Sous-traitants',
  '/sous-traitants/commandes': 'Commandes',
  '/sous-traitants/gestion': 'Gestion',
  // Transferts
  '/transferts': 'Transferts',
  // Fils
  '/fils': 'Fils',
  '/fils/references': 'Références',
  '/fils/stock': 'Stock',
  '/fils/commandes': 'Commandes',
  '/fils/gestion': 'Gestion',
  '/fils/previsions': 'Prévisions',
  // Tombé Métier
  '/tombe-metier': 'Tombé Métier',
  // Finis
  '/finis': 'Finis',
  '/finis/references': 'Références',
  '/finis/stock': 'Stock',
  '/finis/etudes-coloris': 'Études coloris',
  '/finis/tarifs': 'Tarifs',
  '/finis/coloris-teint': 'Coloris Teint',
  '/finis/previsions': 'Prévisions',
  // Divers
  '/divers': 'Divers',
  // Qualité
  '/qualite': 'Qualité',
  // Rapports
  '/rapports': 'Rapports',
  // Réseau
  '/reseau': 'Réseau',
  '/reseau/entreprises': 'Entreprises',
  // Settings
  '/settings': 'Paramètres',
  '/settings/utilisateurs': 'Utilisateurs',
}
