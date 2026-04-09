import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PagePlaceholder } from '@/components/shared/PagePlaceholder'
import { Dashboard } from '@/pages/Dashboard'
import {
  Users,
  ShoppingCart,
  FileText,
  Receipt,
  Package,
  Building2,
  Truck,
  Send,
  Globe,
  Tag,
  Palette,
  Factory,
  Scissors,
  FlaskConical,
  ClipboardCheck,
  Boxes,
  Box,
  ArrowRightLeft,
  Settings,
  type LucideIcon,
} from 'lucide-react'

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

// Fournisseurs pages
const FournisseursReferencesPage = createPlaceholder('Références Fournisseurs', 'Catalogue des références fournisseurs', Tag)
const FournisseursCommandesPage = createPlaceholder('Commandes Fournisseurs', 'Gérez les commandes fournisseurs', ShoppingCart)
const FournisseursPrevisionsPage = createPlaceholder('Prévisions Fournisseurs', 'Prévisions d\'approvisionnement fournisseurs', FileText)

// Sous-traitants pages
const SousTraitantsCommandesPage = createPlaceholder('Commandes Sous-traitants', 'Gérez les commandes sous-traitants', ShoppingCart)
const SousTraitantsGestionPage = createPlaceholder('Gestion Sous-traitants', 'Gérez vos sous-traitants', Building2)

// Production pages
const ProductionTricotage = createPlaceholder('Tricotage', 'Suivi de la production tricotage', Factory)
const ProductionTeinture = createPlaceholder('Teinture', 'Suivi des opérations de teinture', FlaskConical)
const ProductionConfection = createPlaceholder('Confection', 'Suivi de la confection', Scissors)
const ProductionControleQualite = createPlaceholder('Contrôle Qualité', 'Gestion du contrôle qualité', ClipboardCheck)

// Stock pages
const StockMatieres = createPlaceholder('Matières Premières', 'Gestion du stock de matières premières', Box)
const StockProduits = createPlaceholder('Produits Finis', 'Gestion du stock de produits finis', Boxes)
const StockMouvements = createPlaceholder('Mouvements', 'Historique des mouvements de stock', ArrowRightLeft)

// Produits pages
const ProduitsReferences = createPlaceholder('Références Produits', 'Gestion des références produits', Tag)
const ProduitsColoris = createPlaceholder('Coloris', 'Gestion des coloris disponibles', Palette)

// Transport pages
const TransportExpeditions = createPlaceholder('Expéditions', 'Gestion des expéditions', Send)
const TransportLivraisons = createPlaceholder('Livraisons', 'Suivi des livraisons', Truck)

// Fournisseurs pages (real)
import { Fournisseurs } from '@/pages/Fournisseurs'
import { FournisseursStock } from '@/pages/FournisseursStock'

// Réseau pages
import { Entreprises } from '@/pages/Entreprises'

// Settings
const SettingsPage = createPlaceholder('Paramètres', 'Configuration de l\'application', Settings)

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Dashboard
      { index: true, element: <Dashboard /> },

      // Clients
      { path: 'clients', element: <Navigate to="/clients/commandes" replace /> },
      { path: 'clients/commandes', element: <ClientsCommandesPage /> },
      { path: 'clients/devis', element: <ClientsDevisPage /> },
      { path: 'clients/facturation', element: <ClientsFacturationPage /> },
      { path: 'clients/gestion', element: <ClientsGestionPage /> },

      // Fournisseurs
      { path: 'fournisseurs', element: <Navigate to="/fournisseurs/references" replace /> },
      { path: 'fournisseurs/references', element: <FournisseursReferencesPage /> },
      { path: 'fournisseurs/stock', element: <FournisseursStock /> },
      { path: 'fournisseurs/commandes', element: <FournisseursCommandesPage /> },
      { path: 'fournisseurs/gestion', element: <Fournisseurs /> },
      { path: 'fournisseurs/previsions', element: <FournisseursPrevisionsPage /> },

      // Sous-traitants
      { path: 'sous-traitants', element: <Navigate to="/sous-traitants/commandes" replace /> },
      { path: 'sous-traitants/commandes', element: <SousTraitantsCommandesPage /> },
      { path: 'sous-traitants/gestion', element: <SousTraitantsGestionPage /> },

      // Production
      { path: 'production', element: <Navigate to="/production/tricotage" replace /> },
      { path: 'production/tricotage', element: <ProductionTricotage /> },
      { path: 'production/teinture', element: <ProductionTeinture /> },
      { path: 'production/confection', element: <ProductionConfection /> },
      { path: 'production/controle-qualite', element: <ProductionControleQualite /> },

      // Stock
      { path: 'stock', element: <Navigate to="/stock/matieres" replace /> },
      { path: 'stock/matieres', element: <StockMatieres /> },
      { path: 'stock/produits', element: <StockProduits /> },
      { path: 'stock/mouvements', element: <StockMouvements /> },

      // Produits
      { path: 'produits', element: <Navigate to="/produits/references" replace /> },
      { path: 'produits/references', element: <ProduitsReferences /> },
      { path: 'produits/coloris', element: <ProduitsColoris /> },

      // Transport
      { path: 'transport', element: <Navigate to="/transport/expeditions" replace /> },
      { path: 'transport/expeditions', element: <TransportExpeditions /> },
      { path: 'transport/livraisons', element: <TransportLivraisons /> },

      // Réseau
      { path: 'reseau', element: <Navigate to="/reseau/entreprises" replace /> },
      { path: 'reseau/entreprises', element: <Entreprises /> },

      // Settings
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])
