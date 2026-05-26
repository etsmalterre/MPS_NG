import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PagePlaceholder } from '@/components/shared/PagePlaceholder'
import { Dashboard } from '@/pages/Dashboard'
import {
  Users,
  ShoppingCart,
  FileText,
  Receipt,
  Building2,
  Truck,
  Box,
  ShieldCheck,
  FileBarChart,
  Tag,
  Palette,
  Euro,
  Droplet,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { KnitIcon } from '@/components/icons/KnitIcon'
import { FabricRollIcon } from '@/components/icons/FabricRollIcon'

// PagePlaceholder takes a LucideIcon — widen it locally so our custom
// SVG components (KnitIcon, FabricRollIcon) are accepted too. They share
// the same React props shape.
const PlaceholderIcon = (c: unknown) => c as LucideIcon

// Placeholder component factory
function createPlaceholder(title: string, description: string, Icon: LucideIcon) {
  return function PlaceholderPage() {
    return <PagePlaceholder title={title} description={description} icon={Icon} />
  }
}

// Client pages
const ClientsCommandesPage = createPlaceholder('Commandes Clients', 'Gérez les commandes de vos clients', ShoppingCart)
const ClientsDevisPage = createPlaceholder('Devis', 'Créez et gérez les devis clients', FileText)
const ClientsFacturationPage = createPlaceholder('Facturation', 'Gérez la facturation clients', Receipt)
const ClientsGestionPage = createPlaceholder('Gestion Clients', 'Gérez votre portefeuille clients', Users)

// Fils placeholder (prévisions only — other Fils sub-screens are real)
const FilsPrevisionsPage = createPlaceholder('Prévisions Fournisseurs', 'Prévisions d\'approvisionnement fournisseurs', FileText)

// Sous-traitants pages
const SousTraitantsGestionPage = createPlaceholder('Gestion Sous-traitants', 'Gérez vos sous-traitants', Building2)

// Legacy-menu top-level placeholders
const TransfertsPage = createPlaceholder('Transferts', 'Transferts de stock entre sites et sous-traitants', Truck)
const TombeMetierPage = createPlaceholder('Tombé Métier', 'Suivi du tombé métier', PlaceholderIcon(KnitIcon))
const FinisReferencesPage = createPlaceholder('Références Finis', 'Catalogue des références de produits finis', Tag)
// Études coloris — real screen (not a placeholder anymore)
const FinisTarifsPage = createPlaceholder('Tarifs Finis', 'Tarifs des produits finis', Euro)
const FinisColorisTeintPage = createPlaceholder('Coloris Teint', 'Coloris teints et ennoblissement', Droplet)
const FinisPrevisionsPage = createPlaceholder('Prévisions Finis', 'Prévisions des produits finis', TrendingUp)
const DiversPage = createPlaceholder('Divers', 'Outils divers', Box)
const QualitePage = createPlaceholder('Qualité', 'Contrôle qualité', ShieldCheck)
const RapportsPage = createPlaceholder('Rapports', 'Rapports et exports', FileBarChart)

// Fils pages (real)
import { FilsGestion } from '@/pages/FilsGestion'
import { FilsReferences } from '@/pages/FilsReferences'
import { FilsStock } from '@/pages/FilsStock'
import { FilsCommandes } from '@/pages/FilsCommandes'

// Sous-traitants pages (real)
import { SousTraitantsCommandes } from '@/pages/SousTraitantsCommandes'

// Finis pages (real)
import { EtudesColoris } from '@/pages/EtudesColoris'
import { FinisStock } from '@/pages/FinisStock'

// Prospects pages (real)
import { ProspectsDemandes } from '@/pages/ProspectsDemandes'

// Réseau pages
import { Entreprises } from '@/pages/Entreprises'

// Settings
import { SettingsUtilisateurs } from '@/pages/SettingsUtilisateurs'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Dashboard
      { index: true, element: <Dashboard /> },

      // Prospects
      { path: 'prospects', element: <Navigate to="/prospects/demandes" replace /> },
      { path: 'prospects/demandes', element: <ProspectsDemandes /> },

      // Clients
      { path: 'clients', element: <Navigate to="/clients/commandes" replace /> },
      { path: 'clients/commandes', element: <ClientsCommandesPage /> },
      { path: 'clients/devis', element: <ClientsDevisPage /> },
      { path: 'clients/facturation', element: <ClientsFacturationPage /> },
      { path: 'clients/gestion', element: <ClientsGestionPage /> },

      // Sous-traitants
      { path: 'sous-traitants', element: <Navigate to="/sous-traitants/commandes" replace /> },
      { path: 'sous-traitants/commandes', element: <SousTraitantsCommandes /> },
      { path: 'sous-traitants/gestion', element: <SousTraitantsGestionPage /> },

      // Transferts
      { path: 'transferts', element: <TransfertsPage /> },

      // Fils
      { path: 'fils', element: <Navigate to="/fils/references" replace /> },
      { path: 'fils/references', element: <FilsReferences /> },
      { path: 'fils/stock', element: <FilsStock /> },
      { path: 'fils/commandes', element: <FilsCommandes /> },
      { path: 'fils/gestion', element: <FilsGestion /> },
      { path: 'fils/previsions', element: <FilsPrevisionsPage /> },

      // Tombé Métier
      { path: 'tombe-metier', element: <TombeMetierPage /> },

      // Finis
      { path: 'finis', element: <Navigate to="/finis/references" replace /> },
      { path: 'finis/references', element: <FinisReferencesPage /> },
      { path: 'finis/stock', element: <FinisStock /> },
      { path: 'finis/etudes-coloris', element: <EtudesColoris /> },
      { path: 'finis/tarifs', element: <FinisTarifsPage /> },
      { path: 'finis/coloris-teint', element: <FinisColorisTeintPage /> },
      { path: 'finis/previsions', element: <FinisPrevisionsPage /> },

      // Divers
      { path: 'divers', element: <DiversPage /> },

      // Qualité
      { path: 'qualite', element: <QualitePage /> },

      // Rapports
      { path: 'rapports', element: <RapportsPage /> },

      // Réseau
      { path: 'reseau', element: <Navigate to="/reseau/entreprises" replace /> },
      { path: 'reseau/entreprises', element: <Entreprises /> },

      // Settings (admin-only sub-routes)
      { path: 'settings', element: <Navigate to="/settings/utilisateurs" replace /> },
      { path: 'settings/utilisateurs', element: <SettingsUtilisateurs /> },
    ],
  },
])
