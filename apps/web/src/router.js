import { jsx as _jsx } from "react/jsx-runtime";
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PagePlaceholder } from '@/components/shared/PagePlaceholder';
import { Dashboard } from '@/pages/Dashboard';
import { Users, ShoppingCart, FileText, Receipt, Package, Building2, Truck, Send, Tag, Palette, Factory, Scissors, FlaskConical, ClipboardCheck, Boxes, Box, ArrowRightLeft, Settings, } from 'lucide-react';
// Placeholder component factory
function createPlaceholder(title, description, Icon) {
    return function PlaceholderPage() {
        return _jsx(PagePlaceholder, { title: title, description: description, icon: Icon });
    };
}
// Client pages
const ClientsCommandesPage = createPlaceholder('Commandes Clients', 'Gérez les commandes de vos clients', ShoppingCart);
const ClientsDevisPage = createPlaceholder('Devis', 'Créez et gérez les devis clients', FileText);
const ClientsFacturationPage = createPlaceholder('Facturation', 'Gérez la facturation clients', Receipt);
const ClientsGestionPage = createPlaceholder('Gestion Clients', 'Gérez votre portefeuille clients', Users);
// Fournisseurs pages
const FournisseursCommandesPage = createPlaceholder('Commandes Fournisseurs', 'Gérez les commandes fournisseurs', ShoppingCart);
import { Fournisseurs } from '@/pages/Fournisseurs';
// Sous-traitants pages
const SousTraitantsCommandesPage = createPlaceholder('Commandes Sous-traitants', 'Gérez les commandes sous-traitants', ShoppingCart);
const SousTraitantsGestionPage = createPlaceholder('Gestion Sous-traitants', 'Gérez vos sous-traitants', Building2);
// Production pages
const ProductionTricotage = createPlaceholder('Tricotage', 'Suivi de la production tricotage', Factory);
const ProductionTeinture = createPlaceholder('Teinture', 'Suivi des opérations de teinture', FlaskConical);
const ProductionConfection = createPlaceholder('Confection', 'Suivi de la confection', Scissors);
const ProductionControleQualite = createPlaceholder('Contrôle Qualité', 'Gestion du contrôle qualité', ClipboardCheck);
// Stock pages
const StockMatieres = createPlaceholder('Matières Premières', 'Gestion du stock de matières premières', Box);
const StockProduits = createPlaceholder('Produits Finis', 'Gestion du stock de produits finis', Boxes);
const StockMouvements = createPlaceholder('Mouvements', 'Historique des mouvements de stock', ArrowRightLeft);
// Produits pages
const ProduitsReferences = createPlaceholder('Références Produits', 'Gestion des références produits', Tag);
const ProduitsColoris = createPlaceholder('Coloris', 'Gestion des coloris disponibles', Palette);
// Transport pages
const TransportExpeditions = createPlaceholder('Expéditions', 'Gestion des expéditions', Send);
const TransportLivraisons = createPlaceholder('Livraisons', 'Suivi des livraisons', Truck);
// Réseau pages
import { Entreprises } from '@/pages/Entreprises';
// Settings
const SettingsPage = createPlaceholder('Paramètres', 'Configuration de l\'application', Settings);
export const router = createBrowserRouter([
    {
        path: '/',
        element: _jsx(AppShell, {}),
        children: [
            // Dashboard
            { index: true, element: _jsx(Dashboard, {}) },
            // Clients
            { path: 'clients', element: _jsx(Navigate, { to: "/clients/commandes", replace: true }) },
            { path: 'clients/commandes', element: _jsx(ClientsCommandesPage, {}) },
            { path: 'clients/devis', element: _jsx(ClientsDevisPage, {}) },
            { path: 'clients/facturation', element: _jsx(ClientsFacturationPage, {}) },
            { path: 'clients/gestion', element: _jsx(ClientsGestionPage, {}) },
            // Fournisseurs
            { path: 'fournisseurs', element: _jsx(Navigate, { to: "/fournisseurs/commandes", replace: true }) },
            { path: 'fournisseurs/commandes', element: _jsx(FournisseursCommandesPage, {}) },
            { path: 'fournisseurs/gestion', element: _jsx(Fournisseurs, {}) },
            // Sous-traitants
            { path: 'sous-traitants', element: _jsx(Navigate, { to: "/sous-traitants/commandes", replace: true }) },
            { path: 'sous-traitants/commandes', element: _jsx(SousTraitantsCommandesPage, {}) },
            { path: 'sous-traitants/gestion', element: _jsx(SousTraitantsGestionPage, {}) },
            // Production
            { path: 'production', element: _jsx(Navigate, { to: "/production/tricotage", replace: true }) },
            { path: 'production/tricotage', element: _jsx(ProductionTricotage, {}) },
            { path: 'production/teinture', element: _jsx(ProductionTeinture, {}) },
            { path: 'production/confection', element: _jsx(ProductionConfection, {}) },
            { path: 'production/controle-qualite', element: _jsx(ProductionControleQualite, {}) },
            // Stock
            { path: 'stock', element: _jsx(Navigate, { to: "/stock/matieres", replace: true }) },
            { path: 'stock/matieres', element: _jsx(StockMatieres, {}) },
            { path: 'stock/produits', element: _jsx(StockProduits, {}) },
            { path: 'stock/mouvements', element: _jsx(StockMouvements, {}) },
            // Produits
            { path: 'produits', element: _jsx(Navigate, { to: "/produits/references", replace: true }) },
            { path: 'produits/references', element: _jsx(ProduitsReferences, {}) },
            { path: 'produits/coloris', element: _jsx(ProduitsColoris, {}) },
            // Transport
            { path: 'transport', element: _jsx(Navigate, { to: "/transport/expeditions", replace: true }) },
            { path: 'transport/expeditions', element: _jsx(TransportExpeditions, {}) },
            { path: 'transport/livraisons', element: _jsx(TransportLivraisons, {}) },
            // Réseau
            { path: 'reseau', element: _jsx(Navigate, { to: "/reseau/entreprises", replace: true }) },
            { path: 'reseau/entreprises', element: _jsx(Entreprises, {}) },
            // Settings
            { path: 'settings', element: _jsx(SettingsPage, {}) },
        ],
    },
]);
//# sourceMappingURL=router.js.map