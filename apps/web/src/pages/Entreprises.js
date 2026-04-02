import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Building2, Search, Loader2, AlertCircle, MapPin, Phone, Mail, User, Award, Star, Pencil, AtSign, MessageSquare, Calendar, Building, Plus, X, Save, Trash2, } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MasterDetailLayout } from '@/components/layout/MasterDetailLayout';
import { cn } from '@/lib/utils';
// ── API helpers ────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002/api';
function formatHfsqlDate(raw) {
    if (raw.length === 8)
        return new Date(`${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`).toLocaleDateString('fr-FR');
    return new Date(raw).toLocaleDateString('fr-FR');
}
function hfsqlDateToInput(raw) {
    if (!raw)
        return '';
    if (raw.length === 8)
        return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
    return raw;
}
async function apiFetch(path, options) {
    const res = await fetch(`${API_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
    if (!res.ok)
        throw new Error('Erreur API');
    return res.json();
}
function useEntreprises() {
    return useQuery({ queryKey: ['entreprises'], queryFn: () => apiFetch('/entreprises') });
}
function useEntrepriseDetail(id) {
    return useQuery({ queryKey: ['entreprise', id], queryFn: () => apiFetch(`/entreprises/${id}`), enabled: id !== null });
}
// ── Shared styling ─────────────────────────────────────
const inputClass = 'w-full h-8 px-2.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring';
const editSectionClass = 'border-l-4 border-l-accent/70 bg-accent/[0.03]';
// ── Main Page ──────────────────────────────────────────
export function Entreprises() {
    const queryClient = useQueryClient();
    const [selectedId, setSelectedId] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [editNom, setEditNom] = useState('');
    const [editCommentaire, setEditCommentaire] = useState('');
    const { data: entreprises, isLoading, isError, error } = useEntreprises();
    const { data: detail, isLoading: detailLoading } = useEntrepriseDetail(selectedId);
    useEffect(() => {
        if (entreprises && entreprises.length > 0 && selectedId === null)
            setSelectedId(entreprises[0].IDentreprise);
    }, [entreprises, selectedId]);
    const startEdit = useCallback(() => {
        if (detail) {
            setEditNom(detail.nom);
            setEditCommentaire(detail.commentaire ?? '');
            setIsEditing(true);
        }
    }, [detail]);
    const cancelEdit = useCallback(() => setIsEditing(false), []);
    const invalidateAll = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['entreprises'] });
        queryClient.invalidateQueries({ queryKey: ['entreprise', selectedId] });
    }, [queryClient, selectedId]);
    const saveMutation = useMutation({
        mutationFn: () => apiFetch(`/entreprises/${selectedId}`, { method: 'PUT', body: JSON.stringify({ nom: editNom, commentaire: editCommentaire }) }),
        onSuccess: () => { invalidateAll(); setIsEditing(false); },
    });
    const createMutation = useMutation({
        mutationFn: () => apiFetch('/entreprises', { method: 'POST', body: JSON.stringify({ nom: 'Nouvelle entreprise' }) }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['entreprises'] });
            setSelectedId(data.IDentreprise);
            setEditNom(data.nom);
            setEditCommentaire('');
            setIsEditing(true);
        },
    });
    const handleSelect = useCallback((id) => { if (isEditing)
        setIsEditing(false); setSelectedId(id); }, [isEditing]);
    const filtered = useMemo(() => {
        if (!entreprises)
            return [];
        if (!searchQuery.trim())
            return entreprises;
        const q = searchQuery.toLowerCase();
        return entreprises.filter((e) => e.nom.toLowerCase().includes(q) || (e.commentaire && e.commentaire.toLowerCase().includes(q)));
    }, [entreprises, searchQuery]);
    return (_jsxs(_Fragment, { children: [_jsx(MasterDetailLayout, { list: _jsx(EntrepriseList, { entreprises: filtered, isLoading: isLoading, isError: isError, error: error, selectedId: selectedId, onSelect: handleSelect, searchQuery: searchQuery, onSearchChange: setSearchQuery, onNew: () => createMutation.mutate(), isCreating: createMutation.isPending, isEditing: isEditing }), detailHeader: _jsx(DetailHeader, { entreprise: detail ?? null, isLoading: detailLoading && selectedId !== null, isEditing: isEditing, editNom: editNom, onEditNomChange: setEditNom, onStartEdit: startEdit, onCancelEdit: cancelEdit, onSave: () => saveMutation.mutate(), isSaving: saveMutation.isPending, onEmailClick: () => setEmailModalOpen(true) }), detail: _jsx(DetailMain, { entreprise: detail ?? null, isLoading: detailLoading && selectedId !== null, hasSelection: selectedId !== null, isEditing: isEditing, editCommentaire: editCommentaire, onEditCommentaireChange: setEditCommentaire, entrepriseId: selectedId, onMutationSuccess: invalidateAll }), sidebar: selectedId !== null ? _jsx(DetailSidebar, { entreprise: detail ?? null, isLoading: detailLoading, isEditing: isEditing, entrepriseId: selectedId, onMutationSuccess: invalidateAll }) : null, sidebarTitle: "Informations", hasSelection: selectedId !== null, onBack: () => { setIsEditing(false); setSelectedId(null); } }), _jsx(Dialog, { open: emailModalOpen, onOpenChange: setEmailModalOpen, children: _jsxs(DialogContent, { children: [_jsx(DialogHeader, { children: _jsxs(DialogTitle, { className: "flex items-center gap-2", children: [_jsx(AtSign, { className: "h-5 w-5 text-accent" }), "Envoyer un email"] }) }), _jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-muted-foreground", children: [_jsx(Mail, { className: "h-12 w-12 mb-3 opacity-40" }), _jsx("p", { className: "text-sm font-medium", children: "En developpement" }), _jsx("p", { className: "text-xs mt-1", children: "Cette fonctionnalite sera disponible prochainement." })] })] }) })] }));
}
// ── Left Panel: List ───────────────────────────────────
function EntrepriseList({ entreprises, isLoading, isError, error, selectedId, onSelect, searchQuery, onSearchChange, onNew, isCreating, isEditing }) {
    return (_jsxs("div", { className: "flex flex-col h-full bg-card rounded-lg border shadow-sm", children: [_jsx("div", { className: "p-3 border-b", children: _jsxs("div", { className: "relative", children: [_jsx(Search, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }), _jsx("input", { type: "text", placeholder: "Rechercher...", value: searchQuery, onChange: (e) => onSearchChange(e.target.value), autoComplete: "off", className: "w-full h-9 pl-9 pr-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" })] }) }), _jsx("div", { className: "flex-1 overflow-auto p-3 space-y-2", children: isLoading ? _jsx("div", { className: "flex items-center justify-center py-8", children: _jsx(Loader2, { className: "h-6 w-6 animate-spin text-accent" }) })
                    : isError ? _jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-destructive", children: [_jsx(AlertCircle, { className: "h-6 w-6 mb-2" }), _jsx("p", { className: "text-sm", children: error?.message || 'Erreur' })] })
                        : entreprises.length === 0 ? _jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-muted-foreground", children: [_jsx(Building2, { className: "h-12 w-12 mb-3 opacity-50" }), _jsx("p", { className: "text-sm", children: "Aucune entreprise" })] })
                            : entreprises.map((e) => (_jsxs("div", { onClick: () => onSelect(e.IDentreprise), className: cn('p-3 border rounded-lg cursor-pointer transition-all', selectedId === e.IDentreprise ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50 hover:bg-muted/30'), children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Building2, { className: "h-4 w-4 text-muted-foreground flex-shrink-0" }), _jsx("p", { className: "font-medium text-sm truncate", children: e.nom })] }), e.commentaire && _jsx("p", { className: "text-xs text-muted-foreground mt-1 line-clamp-2", children: e.commentaire })] }, e.IDentreprise))) }), _jsxs("div", { className: "p-3 border-t text-xs text-muted-foreground flex items-center justify-between", children: [_jsxs("span", { children: [entreprises.length, " entreprise", entreprises.length !== 1 ? 's' : ''] }), isEditing && (_jsxs(Button, { size: "sm", variant: "ghost", onClick: onNew, disabled: isCreating, className: "text-accent hover:text-accent hover:bg-accent/10", children: [_jsx(Plus, { className: "h-3.5 w-3.5 mr-1" }), "Nouveau"] }))] })] }));
}
// ── Center: Detail Header ──────────────────────────────
function DetailHeader({ entreprise, isLoading, isEditing, editNom, onEditNomChange, onStartEdit, onCancelEdit, onSave, isSaving, onEmailClick }) {
    if (!entreprise && !isLoading)
        return null;
    return (_jsxs("div", { className: "flex-shrink-0 pt-0.5", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: cn('h-11 w-11 rounded-lg flex items-center justify-center', isEditing ? 'bg-accent/15' : 'icon-box-gold'), children: _jsx(Building2, { className: "h-5 w-5" }) }), _jsx("div", { className: "min-w-0 flex-1", children: isLoading ? _jsx("div", { className: "h-8 w-48 bg-muted animate-pulse rounded" })
                            : isEditing ? (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("input", { value: editNom, onChange: (e) => onEditNomChange(e.target.value), autoFocus: true, className: "flex-1 text-xl font-heading font-bold h-10 px-3 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring" }), _jsxs(Badge, { className: "bg-accent text-accent-foreground flex-shrink-0 gap-1 shadow-sm", children: [_jsx(Pencil, { className: "h-3 w-3" }), "Mode edition"] })] })) : (_jsxs(_Fragment, { children: [_jsx("h1", { className: "text-2xl font-heading font-bold tracking-tight truncate", children: entreprise?.nom }), entreprise?.competences && entreprise.competences.length > 0 && (_jsx("div", { className: "flex gap-1.5 mt-1 flex-wrap", children: entreprise.competences.map((c) => _jsx(Badge, { variant: "secondary", className: "text-xs", children: c.reference }, c.IDcompetence)) }))] })) }), !isLoading && entreprise && (_jsx("div", { className: "flex items-center gap-2 flex-shrink-0", children: isEditing ? (_jsxs(_Fragment, { children: [_jsxs(Button, { variant: "outline", size: "sm", onClick: onCancelEdit, children: [_jsx(X, { className: "h-3.5 w-3.5 mr-1.5" }), "Annuler"] }), _jsxs(Button, { size: "sm", onClick: onSave, disabled: isSaving, children: [_jsx(Save, { className: "h-3.5 w-3.5 mr-1.5" }), isSaving ? 'Enregistrement...' : 'Enregistrer'] })] })) : (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", size: "icon", className: "h-9 w-9", title: "Envoyer un email", onClick: onEmailClick, children: _jsx(AtSign, { className: "h-4 w-4" }) }), _jsxs(Button, { variant: "outline", size: "sm", onClick: onStartEdit, children: [_jsx(Pencil, { className: "h-3.5 w-3.5 mr-1.5" }), "Modifier"] })] })) }))] }), _jsx("div", { className: cn('h-1 w-24 mt-3 rounded-full', isEditing ? 'bg-accent' : 'bg-gradient-to-r from-accent via-accent to-accent/30') })] }));
}
// ── Center: Detail Main ────────────────────────────────
function DetailMain({ entreprise, isLoading, hasSelection, isEditing, editCommentaire, onEditCommentaireChange, entrepriseId, onMutationSuccess }) {
    if (!hasSelection)
        return (_jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsxs("div", { className: "text-center space-y-3", children: [_jsx("div", { className: "icon-box-gold h-16 w-16 mx-auto", children: _jsx(Globe, { className: "h-8 w-8" }) }), _jsx("p", { className: "text-muted-foreground text-sm", children: "Selectionnez une entreprise dans la liste" })] }) }));
    if (isLoading)
        return _jsx("div", { className: "flex-1 flex items-center justify-center", children: _jsx(Loader2, { className: "h-8 w-8 animate-spin text-accent" }) });
    if (!entreprise)
        return null;
    return (_jsxs("div", { className: "flex-1 min-h-0 overflow-auto space-y-4", children: [_jsxs(Card, { className: cn('card-premium', isEditing && editSectionClass), children: [_jsx(CardHeader, { className: "pb-2", children: _jsx(CardTitle, { className: "text-sm font-semibold", children: "Notes" }) }), _jsx(CardContent, { children: isEditing ? (_jsx("textarea", { value: editCommentaire, onChange: (e) => onEditCommentaireChange(e.target.value), rows: 4, className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" })) : entreprise.commentaire ? (_jsx("p", { className: "text-sm text-muted-foreground whitespace-pre-line", children: entreprise.commentaire })) : _jsx("p", { className: "text-sm text-muted-foreground italic", children: "Aucune note" }) })] }), _jsx(CompetencesCard, { competences: entreprise.competences, isEditing: isEditing, entrepriseId: entrepriseId, onMutationSuccess: onMutationSuccess }), _jsx(RecommandationsCard, { recommandations: entreprise.recommandations, isEditing: isEditing, entrepriseId: entrepriseId, onMutationSuccess: onMutationSuccess })] }));
}
// ── Competences Card ───────────────────────────────────
function CompetencesCard({ competences, isEditing, entrepriseId, onMutationSuccess }) {
    const [showAdd, setShowAdd] = useState(false);
    const { data: available } = useQuery({
        queryKey: ['competences-available', entrepriseId],
        queryFn: () => apiFetch(`/entreprises/${entrepriseId}/competences/available`),
        enabled: isEditing && showAdd,
    });
    const addMut = useMutation({
        mutationFn: (compId) => apiFetch(`/entreprises/${entrepriseId}/competences`, { method: 'POST', body: JSON.stringify({ IDcompetence: compId }) }),
        onSuccess: () => { onMutationSuccess(); setShowAdd(false); },
    });
    const removeMut = useMutation({
        mutationFn: (compId) => apiFetch(`/entreprises/${entrepriseId}/competences/${compId}`, { method: 'DELETE' }),
        onSuccess: onMutationSuccess,
    });
    return (_jsxs(Card, { className: cn('card-premium', isEditing && editSectionClass), children: [_jsxs(CardHeader, { className: "flex flex-row items-center gap-2 pb-2", children: [_jsx(Award, { className: "h-4 w-4 text-accent" }), _jsx(CardTitle, { className: "text-sm font-semibold", children: "Competences" }), isEditing && (_jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6 ml-auto", onClick: () => setShowAdd(!showAdd), children: _jsx(Plus, { className: "h-3.5 w-3.5" }) }))] }), _jsxs(CardContent, { children: [_jsxs("div", { className: "flex flex-wrap gap-2", children: [competences.map((c) => (_jsxs(Badge, { className: "bg-accent/10 text-accent hover:bg-accent/20 border-accent/20", children: [c.reference, isEditing && (_jsx("button", { className: "ml-1.5 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 -mr-1 transition-colors", onClick: () => removeMut.mutate(c.IDcompetence), children: _jsx(X, { className: "h-3 w-3" }) }))] }, c.IDcompetence))), competences.length === 0 && !isEditing && _jsx("p", { className: "text-sm text-muted-foreground italic", children: "Aucune competence" })] }), isEditing && showAdd && available && (_jsx("div", { className: "mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2", children: available.length === 0 ? _jsx("p", { className: "text-xs text-muted-foreground italic", children: "Toutes assignees" })
                            : available.map((c) => (_jsxs(Badge, { variant: "outline", className: "cursor-pointer hover:bg-accent/10 transition-colors", onClick: () => addMut.mutate(c.IDcompetence), children: [_jsx(Plus, { className: "h-3 w-3 mr-1" }), c.reference] }, c.IDcompetence))) }))] })] }));
}
// ── Recommandations Card ───────────────────────────────
function RecommandationsCard({ recommandations, isEditing, entrepriseId, onMutationSuccess }) {
    const [editingId, setEditingId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ société: '', contact: '', besoin: '', date_reco: '' });
    const createMut = useMutation({
        mutationFn: () => apiFetch(`/entreprises/${entrepriseId}/recommandations`, { method: 'POST', body: JSON.stringify(form) }),
        onSuccess: () => { onMutationSuccess(); resetForm(); },
    });
    const updateMut = useMutation({
        mutationFn: (rid) => apiFetch(`/entreprises/${entrepriseId}/recommandations/${rid}`, { method: 'PUT', body: JSON.stringify(form) }),
        onSuccess: () => { onMutationSuccess(); setEditingId(null); },
    });
    const deleteMut = useMutation({
        mutationFn: (rid) => apiFetch(`/entreprises/${entrepriseId}/recommandations/${rid}`, { method: 'DELETE' }),
        onSuccess: onMutationSuccess,
    });
    const resetForm = () => { setForm({ société: '', contact: '', besoin: '', date_reco: '' }); setShowForm(false); };
    const startEditReco = (r) => {
        setEditingId(r.IDrecommandation);
        setForm({ société: r['société'] ?? '', contact: r.contact ?? '', besoin: r.besoin ?? '', date_reco: hfsqlDateToInput(r.date_reco) });
    };
    return (_jsxs(Card, { className: cn('card-premium', isEditing && editSectionClass), children: [_jsxs(CardHeader, { className: "flex flex-row items-center gap-2 pb-2", children: [_jsx(MessageSquare, { className: "h-4 w-4 text-accent" }), _jsx(CardTitle, { className: "text-sm font-semibold", children: "Recommandations" }), _jsx(Badge, { variant: "secondary", className: "text-xs ml-auto", children: recommandations.length }), isEditing && !showForm && editingId === null && (_jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => setShowForm(true), children: _jsx(Plus, { className: "h-3.5 w-3.5" }) }))] }), _jsxs(CardContent, { className: "space-y-2", children: [recommandations.length === 0 && !isEditing && _jsx("p", { className: "text-sm text-muted-foreground italic", children: "Aucune recommandation" }), recommandations.map((r) => isEditing && editingId === r.IDrecommandation ? (_jsxs(InlineForm, { title: "Modifier la recommandation", onSave: () => updateMut.mutate(r.IDrecommandation), onCancel: () => setEditingId(null), isSaving: updateMut.isPending, children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(LabeledInput, { label: "Societe", value: form.société, onChange: (v) => setForm({ ...form, société: v }) }), _jsx(LabeledInput, { label: "Contact", value: form.contact, onChange: (v) => setForm({ ...form, contact: v }) })] }), _jsx(LabeledInput, { label: "Date", type: "date", value: form.date_reco, onChange: (v) => setForm({ ...form, date_reco: v }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-muted-foreground", children: "Besoin" }), _jsx("textarea", { value: form.besoin, onChange: (e) => setForm({ ...form, besoin: e.target.value }), rows: 2, className: "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" })] })] }, r.IDrecommandation)) : (_jsxs("div", { className: "rounded-md p-3 bg-muted/40 group relative", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Building, { className: "h-3.5 w-3.5 text-muted-foreground" }), _jsx("span", { className: "text-sm font-medium", children: r['société'] || '—' })] }), _jsxs("div", { className: "flex items-center gap-1.5", children: [r.date_reco && _jsxs("span", { className: "flex items-center gap-1 text-xs text-muted-foreground", children: [_jsx(Calendar, { className: "h-3 w-3" }), formatHfsqlDate(r.date_reco)] }), isEditing && (_jsxs("div", { className: "flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", children: [_jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => startEditReco(r), children: _jsx(Pencil, { className: "h-3 w-3" }) }), _jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6 text-destructive hover:text-destructive", onClick: () => deleteMut.mutate(r.IDrecommandation), children: _jsx(Trash2, { className: "h-3 w-3" }) })] }))] })] }), r.contact && _jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mt-1", children: [_jsx(User, { className: "h-3 w-3" }), _jsx("span", { children: r.contact })] }), r.besoin && _jsx("p", { className: "text-sm text-muted-foreground whitespace-pre-line mt-1.5", children: r.besoin })] }, r.IDrecommandation))), isEditing && showForm && (_jsxs(InlineForm, { title: "Nouvelle recommandation", onSave: () => createMut.mutate(), onCancel: resetForm, isSaving: createMut.isPending, children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(LabeledInput, { label: "Societe", value: form.société, onChange: (v) => setForm({ ...form, société: v }), autoFocus: true }), _jsx(LabeledInput, { label: "Contact", value: form.contact, onChange: (v) => setForm({ ...form, contact: v }) })] }), _jsx(LabeledInput, { label: "Date", type: "date", value: form.date_reco, onChange: (v) => setForm({ ...form, date_reco: v }) }), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-muted-foreground", children: "Besoin" }), _jsx("textarea", { value: form.besoin, onChange: (e) => setForm({ ...form, besoin: e.target.value }), rows: 2, className: "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-y" })] })] }))] })] }));
}
// ── Shared form components ─────────────────────────────
function LabeledInput({ label, value, onChange, type = 'text', autoFocus }) {
    return (_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs font-medium text-muted-foreground", children: label }), _jsx("input", { type: type, value: value, onChange: (e) => onChange(e.target.value), autoFocus: autoFocus, autoComplete: "off", "data-form-type": "other", "data-lpignore": "true", className: inputClass })] }));
}
function InlineForm({ title, children, onSave, onCancel, isSaving }) {
    return (_jsxs("div", { className: "rounded-lg border border-accent/25 bg-accent/[0.03] p-4 space-y-3", children: [_jsx("p", { className: "text-xs font-semibold text-accent uppercase tracking-wide", children: title }), children, _jsxs("div", { className: "flex justify-end gap-2 pt-1", children: [_jsx(Button, { variant: "outline", size: "sm", onClick: onCancel, children: "Annuler" }), _jsx(Button, { size: "sm", onClick: onSave, disabled: isSaving, children: isSaving ? 'Enregistrement...' : 'Enregistrer' })] })] }));
}
function DetailSidebar({ entreprise, isLoading, isEditing, entrepriseId, onMutationSuccess }) {
    const [activeTab, setActiveTab] = useState('contacts');
    if (isLoading)
        return (_jsxs("div", { className: "w-96 flex-shrink-0 bg-muted/30 rounded-xl border p-4 space-y-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("div", { className: "h-8 flex-1 bg-muted animate-pulse rounded-md" }), _jsx("div", { className: "h-8 flex-1 bg-muted animate-pulse rounded-md" })] }), [1, 2, 3].map((i) => _jsx("div", { className: "h-24 bg-muted animate-pulse rounded-lg" }, i))] }));
    if (!entreprise)
        return null;
    const tabs = [
        { key: 'contacts', label: 'Contacts', icon: User },
        { key: 'adresses', label: 'Adresses', icon: MapPin },
    ];
    return (_jsxs("div", { className: "w-96 flex-shrink-0 bg-muted/30 rounded-xl border flex flex-col overflow-hidden", children: [_jsx("div", { className: "flex border-b p-1 gap-1", children: tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (_jsxs("button", { onClick: () => setActiveTab(tab.key), className: cn('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md transition-colors', activeTab === tab.key ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/10'), children: [_jsx(Icon, { className: "h-3.5 w-3.5" }), tab.label] }, tab.key));
                }) }), _jsxs("div", { className: "flex-1 overflow-y-auto p-3 space-y-2", children: [activeTab === 'contacts' && _jsx(ContactsTab, { contacts: entreprise.contacts, isEditing: isEditing, entrepriseId: entrepriseId, onMutationSuccess: onMutationSuccess }), activeTab === 'adresses' && _jsx(AdressesTab, { adresses: entreprise.adresses, isEditing: isEditing, entrepriseId: entrepriseId, onMutationSuccess: onMutationSuccess })] })] }));
}
// ── Sidebar Tab: Contacts ──────────────────────────────
function ContactsTab({ contacts, isEditing, entrepriseId, onMutationSuccess }) {
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ nom: '', prenom: '', tel: '', mail: '' });
    const [showForm, setShowForm] = useState(false);
    const createMut = useMutation({
        mutationFn: () => apiFetch(`/entreprises/${entrepriseId}/contacts`, { method: 'POST', body: JSON.stringify(form) }),
        onSuccess: () => { onMutationSuccess(); resetForm(); },
    });
    const updateMut = useMutation({
        mutationFn: (cid) => apiFetch(`/entreprises/${entrepriseId}/contacts/${cid}`, { method: 'PUT', body: JSON.stringify(form) }),
        onSuccess: () => { onMutationSuccess(); setEditingId(null); },
    });
    const deleteMut = useMutation({
        mutationFn: (cid) => apiFetch(`/entreprises/${entrepriseId}/contacts/${cid}`, { method: 'DELETE' }),
        onSuccess: onMutationSuccess,
    });
    const resetForm = () => { setForm({ nom: '', prenom: '', tel: '', mail: '' }); setShowForm(false); };
    const startEditContact = (c) => {
        setEditingId(c.IDcontact);
        setForm({ nom: c.nom ?? '', prenom: c.prenom ?? '', tel: c.tel ?? '', mail: c.mail ?? '' });
    };
    if (contacts.length === 0 && !isEditing)
        return (_jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-muted-foreground", children: [_jsx(User, { className: "h-10 w-10 mb-2 opacity-40" }), _jsx("p", { className: "text-sm", children: "Aucun contact" })] }));
    return (_jsxs(_Fragment, { children: [contacts.map((c) => isEditing && editingId === c.IDcontact ? (_jsxs(InlineForm, { title: "Modifier le contact", onSave: () => updateMut.mutate(c.IDcontact), onCancel: () => setEditingId(null), isSaving: updateMut.isPending, children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(LabeledInput, { label: "Prenom", value: form.prenom, onChange: (v) => setForm({ ...form, prenom: v }) }), _jsx(LabeledInput, { label: "Nom", value: form.nom, onChange: (v) => setForm({ ...form, nom: v }) })] }), _jsx(LabeledInput, { label: "Telephone", value: form.tel, onChange: (v) => setForm({ ...form, tel: v }) }), _jsx(LabeledInput, { label: "Email", value: form.mail, onChange: (v) => setForm({ ...form, mail: v }) })] }, c.IDcontact)) : (_jsx("div", { className: "p-3 rounded-lg border bg-card shadow-sm group relative", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "font-medium text-sm flex items-center gap-2", children: [[c.prenom, c.nom].filter(Boolean).join(' ') || 'Contact', !!c.est_defaut && _jsxs(Badge, { variant: "secondary", className: "text-[10px] py-0", children: [_jsx(Star, { className: "h-2.5 w-2.5 mr-0.5" }), "Principal"] })] }), c.tel && _jsxs("div", { className: "text-xs text-muted-foreground flex items-center gap-1.5 mt-1", children: [_jsx(Phone, { className: "h-3 w-3" }), c.tel] }), c.mail && _jsxs("div", { className: "text-xs text-muted-foreground flex items-center gap-1.5", children: [_jsx(Mail, { className: "h-3 w-3" }), _jsx("span", { className: "truncate", children: c.mail })] })] }), isEditing && (_jsxs("div", { className: "flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", children: [_jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => startEditContact(c), children: _jsx(Pencil, { className: "h-3 w-3" }) }), _jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6 text-destructive hover:text-destructive", onClick: () => deleteMut.mutate(c.IDcontact), children: _jsx(Trash2, { className: "h-3 w-3" }) })] }))] }) }, c.IDcontact))), isEditing && !showForm && editingId === null && (_jsxs(Button, { variant: "ghost", size: "sm", className: "w-full text-muted-foreground hover:text-foreground", onClick: () => setShowForm(true), children: [_jsx(Plus, { className: "h-4 w-4 mr-1.5" }), "Ajouter un contact"] })), isEditing && showForm && (_jsxs(InlineForm, { title: "Nouveau contact", onSave: () => createMut.mutate(), onCancel: resetForm, isSaving: createMut.isPending, children: [_jsxs("div", { className: "grid grid-cols-2 gap-2", children: [_jsx(LabeledInput, { label: "Prenom", value: form.prenom, onChange: (v) => setForm({ ...form, prenom: v }), autoFocus: true }), _jsx(LabeledInput, { label: "Nom", value: form.nom, onChange: (v) => setForm({ ...form, nom: v }) })] }), _jsx(LabeledInput, { label: "Telephone", value: form.tel, onChange: (v) => setForm({ ...form, tel: v }) }), _jsx(LabeledInput, { label: "Email", value: form.mail, onChange: (v) => setForm({ ...form, mail: v }) })] }))] }));
}
// ── Sidebar Tab: Adresses ──────────────────────────────
function AdressesTab({ adresses, isEditing, entrepriseId, onMutationSuccess }) {
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ nom: '', adresse1: '', cp: '', ville: '', pays: '' });
    const [showForm, setShowForm] = useState(false);
    const createMut = useMutation({
        mutationFn: () => apiFetch(`/entreprises/${entrepriseId}/adresses`, { method: 'POST', body: JSON.stringify(form) }),
        onSuccess: () => { onMutationSuccess(); resetForm(); },
    });
    const updateMut = useMutation({
        mutationFn: (aid) => apiFetch(`/entreprises/${entrepriseId}/adresses/${aid}`, { method: 'PUT', body: JSON.stringify(form) }),
        onSuccess: () => { onMutationSuccess(); setEditingId(null); },
    });
    const deleteMut = useMutation({
        mutationFn: (aid) => apiFetch(`/entreprises/${entrepriseId}/adresses/${aid}`, { method: 'DELETE' }),
        onSuccess: onMutationSuccess,
    });
    const resetForm = () => { setForm({ nom: '', adresse1: '', cp: '', ville: '', pays: '' }); setShowForm(false); };
    const startEditAddr = (a) => {
        setEditingId(a.IDadresse);
        setForm({ nom: a.nom ?? '', adresse1: a.adresse1 ?? '', cp: a.cp ?? '', ville: a.ville ?? '', pays: a.pays ?? '' });
    };
    if (adresses.length === 0 && !isEditing)
        return (_jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-muted-foreground", children: [_jsx(MapPin, { className: "h-10 w-10 mb-2 opacity-40" }), _jsx("p", { className: "text-sm", children: "Aucune adresse" })] }));
    return (_jsxs(_Fragment, { children: [adresses.map((a) => isEditing && editingId === a.IDadresse ? (_jsxs(InlineForm, { title: "Modifier l'adresse", onSave: () => updateMut.mutate(a.IDadresse), onCancel: () => setEditingId(null), isSaving: updateMut.isPending, children: [_jsx(LabeledInput, { label: "Libelle", value: form.nom, onChange: (v) => setForm({ ...form, nom: v }) }), _jsx(LabeledInput, { label: "Adresse", value: form.adresse1, onChange: (v) => setForm({ ...form, adresse1: v }) }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(LabeledInput, { label: "CP", value: form.cp, onChange: (v) => setForm({ ...form, cp: v }) }), _jsx("div", { className: "col-span-2", children: _jsx(LabeledInput, { label: "Ville", value: form.ville, onChange: (v) => setForm({ ...form, ville: v }) }) })] }), _jsx(LabeledInput, { label: "Pays", value: form.pays, onChange: (v) => setForm({ ...form, pays: v }) })] }, a.IDadresse)) : (_jsx("div", { className: "p-3 rounded-lg border bg-card shadow-sm group relative", children: _jsxs("div", { className: "flex items-start justify-between", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsxs("div", { className: "font-medium text-sm flex items-center gap-2", children: [a.nom || 'Adresse', !!a.est_defaut && _jsxs(Badge, { variant: "secondary", className: "text-[10px] py-0", children: [_jsx(Star, { className: "h-2.5 w-2.5 mr-0.5" }), "Principale"] })] }), _jsxs("div", { className: "text-xs text-muted-foreground mt-1 space-y-0.5", children: [a.adresse1 && _jsx("p", { children: a.adresse1 }), a.adresse2 && _jsx("p", { children: a.adresse2 }), a.adresse3 && _jsx("p", { children: a.adresse3 }), (a.cp || a.ville) && _jsx("p", { children: [a.cp, a.ville].filter(Boolean).join(' ') }), a.pays && _jsx("p", { children: a.pays })] })] }), isEditing && (_jsxs("div", { className: "flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity", children: [_jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6", onClick: () => startEditAddr(a), children: _jsx(Pencil, { className: "h-3 w-3" }) }), _jsx(Button, { variant: "ghost", size: "icon", className: "h-6 w-6 text-destructive hover:text-destructive", onClick: () => deleteMut.mutate(a.IDadresse), children: _jsx(Trash2, { className: "h-3 w-3" }) })] }))] }) }, a.IDadresse))), isEditing && !showForm && editingId === null && (_jsxs(Button, { variant: "ghost", size: "sm", className: "w-full text-muted-foreground hover:text-foreground", onClick: () => setShowForm(true), children: [_jsx(Plus, { className: "h-4 w-4 mr-1.5" }), "Ajouter une adresse"] })), isEditing && showForm && (_jsxs(InlineForm, { title: "Nouvelle adresse", onSave: () => createMut.mutate(), onCancel: resetForm, isSaving: createMut.isPending, children: [_jsx(LabeledInput, { label: "Libelle", value: form.nom, onChange: (v) => setForm({ ...form, nom: v }), autoFocus: true }), _jsx(LabeledInput, { label: "Adresse", value: form.adresse1, onChange: (v) => setForm({ ...form, adresse1: v }) }), _jsxs("div", { className: "grid grid-cols-3 gap-2", children: [_jsx(LabeledInput, { label: "CP", value: form.cp, onChange: (v) => setForm({ ...form, cp: v }) }), _jsx("div", { className: "col-span-2", children: _jsx(LabeledInput, { label: "Ville", value: form.ville, onChange: (v) => setForm({ ...form, ville: v }) }) })] }), _jsx(LabeledInput, { label: "Pays", value: form.pays, onChange: (v) => setForm({ ...form, pays: v }) })] }))] }));
}
//# sourceMappingURL=Entreprises.js.map