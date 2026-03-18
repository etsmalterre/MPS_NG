# Legacy HFSQL Table Inventory

**Source**: `C:/Mes Projets/MPS/MPS.ana/MPS.xdd` (XML data dictionary, 403 KB)
**Total Tables**: 204 | **Total Fields**: 1,616 | **Avg Fields/Table**: 7.9

## Largest Tables (by field count)

| Table | Fields | Description |
|-------|--------|-------------|
| ref_fini | 43 | Finished product specifications |
| suivilot | 38 | Lot tracking system |
| ref_ecru | 36 | Raw fabric references |
| ordre_fabrication | 34 | Work orders (OF) |
| client | 32 | Client records |
| machine | 29 | Machine definitions |
| stock_ecru | 25 | Raw fabric stock |
| stock_fini | 24 | Finished product stock |
| commande_client | 24 | Client orders |
| stock_fil | 22 | Yarn stock |
| dossier_qualite | 20 | Quality dossiers |

## Tables by Domain

### Clients & Sales
- `client` (32) - Client records
- `commande_client` (24) - Client orders
- `ligne_commande_client` - Order lines
- `commande_previsionnelle` - Forecast orders
- `devis_etm` - Quotations
- `ligne_devis_etm` - Quotation lines
- `designation_client` - Client-specific product names
- `ref_client_colori` - Client color references
- `contrat_tarif` - Pricing contracts
- `asso_tarif_client` - Client-tariff associations
- `asso_traitement_tarif_client` - Client treatment tariffs
- `prospect` - Prospects
- `retour_client` - Client returns
- `retour_client_confection` - Assembly client returns

### Invoicing & Finance
- `facture` (14) - Invoices
- `ligne_facture` - Invoice lines
- `facture_prov` - Provisional invoices
- `ligne_facture_prov` - Provisional invoice lines
- `echeance` - Payment due dates
- `mode_paiement` - Payment methods
- `code_comptable` - Accounting codes
- `compte_compta` - Accounting accounts
- `releve_compta` - Accounting statements
- `inventaire_compta` - Accounting inventory
- `upload_compta` - Accounting uploads
- `tva` - VAT rates
- `plus_moins_value_kg` - Price adjustments per kg
- `plus_moins_value_kg_client` - Client-specific price adjustments

### Suppliers & Purchasing
- `fournisseur` (7) - Suppliers
- `commande_fil` - Yarn orders
- `ref_fil_commande` - Yarn order references
- `offre_fil` - Yarn offers
- `produit_fournisseur` - Supplier products
- `fourniture_fournisseur` - Supplier supplies
- `fourniture_confection` - Assembly supplies
- `fourniture_option` - Supply options
- `asso_colorisfil_frs` - Supplier yarn color associations

### Subcontractors
- `sous_traitant` (7) - Subcontractors
- `commande_sous_traitant` - Subcontractor orders
- `ligne_commande_sous_traitant` - Subcontractor order lines
- `type_sst` - Subcontractor types

### Production - Knitting (Tricotage)
- `ordre_fabrication` (34) - Work orders
- `machine` (29) - Knitting machines
- `ref_ecru` (36) - Raw fabric references
- `ref_ecru_machine` - Machine-fabric associations
- `composition_ecru` - Raw fabric composition
- `obs_ref_ecru` - Raw fabric observations
- `affectation_cmd_tricotage` - Knitting order assignments
- `planning_bonnetier` - Knitter planning
- `bonnetier` - Knitters
- `asso_article_machine` - Article-machine associations
- `hors_prod` - Non-production time
- `message_of` - Work order messages

### Production - Dyeing (Teinture)
- `teinture` - Dyeing records
- `coloris_teint` - Dyed colors
- `ColorisTeint_RefFini` - Dyed color-finished product link
- `ColorisTeint_Teinturier` - Dyed color-dyer link
- `traitement` - Treatments
- `traitement_ref_fini` - Treatment-finished product link
- `asso_traitement_tarif` - Treatment tariff associations
- `tranche_tarif_ennoblissement` - Finishing tariff tiers
- `controle_titrage` - Titration control

### Production - Assembly (Confection)
- `of_confection` - Assembly work orders
- `ligne_cmd_confection` - Assembly order lines
- `option_confection` - Assembly options
- `option_ligne_cmd_confection` - Assembly line options
- `taille_ligne_cmd_confection` - Assembly line sizes
- `textile_ligne_cmd_confection` - Assembly line textiles
- `machine_confection` - Assembly machines
- `coupe_article` - Article cuts
- `coupe_textile_modele` - Textile model cuts

### Products & References
- `ref_fini` (43) - Finished product specs
- `ref_fini_colori` - Finished product colors
- `ref_article` - Article references
- `ref_fil` (19) - Yarn references
- `ref_fil_certif` - Yarn certifications
- `ref_echantillon` - Sample references
- `ref_catalogue` - Catalogue references
- `ref_divers` - Miscellaneous references
- `ref_divers_expedie` - Shipped misc references
- `ref_divers_variation` - Misc reference variations
- `ref_rectiligne` - Rectilinear references
- `ref_tarif` - Tariff references
- `model_article` - Article models
- `textile_modele` - Textile models
- `option_article` - Article options
- `asso_article_taille` - Article-size associations
- `unite_taille` - Size units
- `patronage` - Patterns

### Colors
- `colori_ecru` - Raw fabric colors
- `colori_fil` - Yarn colors
- `colori_fini` - Finished product colors
- `coloris_guide_fil` - Yarn guide colors
- `coloris_rectiligne` - Rectilinear colors
- `coloris_teint` - Dyed colors
- `gamme_coloris` - Color ranges
- `prix_gamme_colori` - Color range pricing
- `tarif_coloris` - Color tariffs
- `etude_col` - Color studies
- `soum_col` - Color submissions
- `vignette_coloris` - Color thumbnails
- `photo_produit` - Product photos

### Stock Management
- `stock_fini` (24) - Finished product stock
- `stock_ecru` (25) - Raw fabric stock
- `stock_fil` (22) - Yarn stock
- `stock_divers` - Miscellaneous stock
- `stock_rectiligne` - Rectilinear stock
- `stock_fil_ged` - Yarn stock GED
- `stock_mini` - Minimum stock levels
- `stat_stock_fil` - Yarn stock statistics
- `etat_stock_fini` - Finished stock status
- `type_stock` - Stock types

### Lot Tracking
- `suivilot` (38) - Lot tracking
- `asso_lot_dq` - Lot-quality dossier link
- `piece_production` - Production pieces
- `piece_echantillon` - Sample pieces
- `piece_transfert` - Transfer pieces
- `fil_incorpore` - Incorporated yarn
- `fil_ref_echantillon` - Sample yarn references
- `asso_fil_stock_tm` - Yarn-TM stock link
- `asso_fil_ligneCmdSST` - Yarn-SST order line link
- `asso_fil_of` - Yarn-work order link
- `asso_fil_matiere` - Yarn-material link
- `asso_fil_tarif` - Yarn-tariff link

### Transport & Shipping
- `expedition` - Shipments
- `ligne_expedition` - Shipment lines
- `expedition_divers` - Miscellaneous shipments
- `ligne_expedition_divers` - Misc shipment lines
- `expediteur` - Shippers
- `transporteur` - Carriers
- `bon_transfert` - Transfer slips
- `tarif_trm` - Transport tariffs
- `tarif_divers` - Misc tariffs

### Quality Control
- `dossier_qualite` (20) - Quality dossiers
- `defaut_qualite` (12) - Quality defects
- `defaut_textile` - Textile defects
- `categorie_defaut` - Defect categories
- `cause_defaut` - Defect causes
- `action_qualite` - Quality actions
- `conformite_action` - Action conformity
- `resolution_qualite` - Quality resolutions
- `mention_qualite` - Quality mentions
- `doc_qualite` - Quality documents
- `certificat` - Certificates
- `ref_fil_certif` - Yarn certifications

### Knitting Technical
- `contexture` - Fabric structure/contexture
- `schema_liage` - Binding patterns
- `symbole_liage` - Binding symbols
- `chute_liage` - Binding waste
- `guide_fil_rectiligne` - Rectilinear yarn guide

### Contacts & Addresses
- `adresse` - Addresses
- `contact` - Contacts
- `partenaire` - Partners
- `type_partenaire` - Partner types
- `societe` - Companies
- `entreprise` - Enterprises
- `secteur_activite` - Activity sectors

### HR & Skills
- `competence` - Skills/competences
- `entreprise_competence` - Enterprise skills
- `test_competence` - Skill tests
- `quizz` - Quizzes
- `resultat_quizz` - Quiz results
- `commentaire_formation` - Training comments
- `item_formation` - Training items

### System & Config
- `utilisateur` - Users
- `MAJ_appli` - Application updates
- `debug_log` - Debug logs
- `abonnement_notif` - Notification subscriptions
- `abonnement_user` - User subscriptions
- `notif_token` - Notification tokens
- `notifutilisateur` - User notifications
- `completion_item` - Autocomplete items
- `contexte` - Contexts
- `dossier` - Folders
- `ged` - Document management
- `type_doc` - Document types
- `type_evenement` - Event types
- `evenement_machine` - Machine events
- `evenement_piece` - Piece events
- `envoi_email` - Email sending
- `tache` - Tasks
- `activite` - Activities
- `desiderata` - Preferences/wishes
- `lst_horaire` - Schedule lists
- `lst_info_sal_annee` - Annual salary info
- `lst_lissage` - Smoothing lists
- `lst_message` - Message lists
- `lst_pointage` - Time tracking lists
- `lst_prev` - Forecast lists
- `lst_salarie` - Employee lists
- `pointage` - Time tracking
- `date_previsionnelle` - Forecast dates
- `recommandation` - Recommendations
- `reponse_soumission` - Submission responses
- `code_sp` - SP codes
- `ajeol` - AJEOL integration
- `data_bl_tricotbot` - TricoBot data
- `origine_matiere` - Material origins
- `matiere_premiere` - Raw materials
- `unite_titrage` - Titration units
- `tranche_tarifaire` - Tariff tiers
- `cage` - Cages/storage locations

## Migration Notes

- **Association tables** (20+ `asso_*` tables): Indicate many-to-many relationships — review for PostgreSQL junction table design
- **Lot traceability** (`suivilot`, 38 fields): Critical for quality/compliance — needs careful migration
- **Multi-variant pricing**: Complex pricing across clients, treatments, colors — significant business logic
- **External integrations**: TricoBot (`data_bl_tricotbot`), AJEOL (`ajeol`), GED system
- **Schema source**: Parse `MPS.xdd` for complete field definitions during Phase 2
