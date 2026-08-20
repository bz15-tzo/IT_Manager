// ============================================================
// OnboardIT - Configuration Supabase
// ============================================================
// Remplissez ces valeurs depuis :
//   Supabase Dashboard > Project Settings > API
// ============================================================

const SUPABASE_URL = "https://dqpjlcxxbglsgggshvdh.supabase.co";          // ex : https://xxxx.supabase.co
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcGpsY3h4Ymdsc2dnZ3NodmRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NTI3MjIsImV4cCI6MjEwMjMyODcyMn0.d8dks5ARKHw7H3pm2qJhhma1LHvb3IV8gLWOpOAy8dc"; // la clé "anon" (publique)

// Liste des étapes du flux ONBOARDING (dans l'ordre)
const STEPS = [
  { id: "besoin_rh",              label: "Besoin RH",                    icon: "📋", color: "#64748b" },
  { id: "preparation_poste",      label: "Préparation poste",            icon: "🖥️", color: "#3b82f6" },
  { id: "creation_comptes",       label: "Comptes & accès",              icon: "🔑", color: "#8b5cf6" },
  { id: "jour_j",                 label: "Jour J - Intégration",         icon: "🎉", color: "#f59e0b" },
  { id: "onboarding_technique",   label: "Onboarding technique",         icon: "🎓", color: "#10b981" },
  { id: "suivi_post_integration", label: "Suivi post-intégration",       icon: "📈", color: "#ec4899" },
  { id: "cloture",                label: "Clôturé",                      icon: "✅", color: "#22c55e" }
];

// Liste des étapes du flux OUTBOARDING (départ, dans l'ordre)
const OUTBOARDING_STEPS = [
  { id: "declaration_depart",       label: "Déclaration du départ",       icon: "📤", color: "#64748b" },
  { id: "transfert_connaissances",  label: "Transfert de connaissances",  icon: "📚", color: "#3b82f6" },
  { id: "revocation_acces",         label: "Révocation des accès",        icon: "🔐", color: "#ef4444" },
  { id: "restitution_materiel",     label: "Restitution du matériel",     icon: "💻", color: "#f59e0b" },
  { id: "entretien_sortie",         label: "Entretien de sortie",         icon: "💬", color: "#8b5cf6" },
  { id: "cloture_administrative",   label: "Clôture administrative",      icon: "✅", color: "#22c55e" }
];

// Raisons de départ proposées lors de la création d'un dossier d'outboarding
const DEPARTURE_REASONS = [
  "Démission",
  "Fin de contrat",
  "Licenciement",
  "Mutation interne",
  "Départ à la retraite",
  "Rupture conventionnelle",
  "Autre"
];

// Helpers : retourne les étapes ou les tâches par défaut selon le cycle
function getStepsForCycle(cycle) {
  return cycle === "outboarding" ? OUTBOARDING_STEPS : STEPS;
}
function getTasksForCycle(cycle) {
  return cycle === "outboarding" ? DEFAULT_OUTBOARDING_TASKS : DEFAULT_TASKS;
}

// Statuts du flux (suivi métier : suspension / reprise)
const FLOW_STATUS = {
  en_cours: { label: "En cours", icon: "🔄", color: "#3b82f6" },
  en_pause: { label: "En pause", icon: "⏸", color: "#f59e0b" },
  cloture:  { label: "Clôturé",  icon: "✅", color: "#22c55e" }
};

// Départements proposés (sélection dans le formulaire).
// L'administrateur peut en ajouter d'autres (table list_items, catégorie "department").
const DEPARTMENTS = [
  "IT",
  "RH",
  "Finance",
  "Marketing",
  "Commercial",
  "Juridique",
  "Production",
  "R&D",
  "Support",
  "Autre"
];

// Matériel nécessaire proposé lors de la création d'un dossier.
// L'administrateur peut en ajouter d'autres (table list_items, catégorie "material").
const MATERIAL_ITEMS = [
  { id: "PC_PORTABLE",  label: "PC portable",        icon: "💻" },
  { id: "ECRAN",        label: "Écran / moniteur",   icon: "🖥️" },
  { id: "SMARTPHONE",   label: "Smartphone",         icon: "📱" },
  { id: "PUCE_SIM",     label: "Puce SIM",           icon: "📶" },
  { id: "COMPTE_AD",    label: "Compte AD",          icon: "🔐" },
  { id: "MESSAGERIE",   label: "Messagerie",         icon: "📧" },
  { id: "VPN",          label: "VPN",                icon: "🛡️" },
  { id: "FORFAIT",      label: "Forfait mobile",     icon: "☎️" },
  { id: "BADGE",        label: "Badge d'accès",      icon: "🎫" },
  { id: "CASQUE",       label: "Casque audio",       icon: "🎧" }
];

// Types de blocages / incidents métier
const BLOCKER_TYPES = [
  { id: "MATERIEL",        label: "Matériel indisponible",     icon: "🖥️" },
  { id: "ACHAT",           label: "En attente d'achat",        icon: "🛒" },
  { id: "COMPTE",          label: "Compte / accès bloqué",     icon: "🔑" },
  { id: "ABSENCE_EMPLOYE", label: "Employé absent / non venu", icon: "🚶" },
  { id: "ABSENCE_IT",      label: "Équipe IT indisponible",    icon: "🧑‍💻" },
  { id: "ADMINISTRATIF",   label: "Blocage administratif",     icon: "📄" },
  { id: "AUTRE",           label: "Autre",                     icon: "❓" }
];

// Tâches types créées automatiquement à chaque étape
const DEFAULT_TASKS = {
  besoin_rh: [
    { title: "Valider la fiche de poste avec les RH", assignee_role: "RH" },
    { title: "Définir la date d'intégration cible",   assignee_role: "RH" },
    { title: "Informer le manager du recrutement",    assignee_role: "RH" }
  ],
  preparation_poste: [
    { title: "Commander le PC portable",                 assignee_role: "IT" },
    { title: "Commander écran, clavier, souris, dock",   assignee_role: "IT" },
    { title: "Réserver le siège et badge d'accès",       assignee_role: "IT" },
    { title: "Installer le système d'exploitation",      assignee_role: "IT" }
  ],
  creation_comptes: [
    { title: "Créer le compte Active Directory",      assignee_role: "IT" },
    { title: "Créer la boîte mail et l'outlook",      assignee_role: "IT" },
    { title: "Activer le VPN",                        assignee_role: "IT" },
    { title: "Créer les accès aux outils internes",   assignee_role: "IT" },
    { title: "Enregistrer le numéro de ligne mobile", assignee_role: "IT" }
  ],
  jour_j: [
    { title: "Accueil du nouvel arrivant",           assignee_role: "RH" },
    { title: "Remise du matériel et du poste",        assignee_role: "IT" },
    { title: "Présentation de l'équipe",              assignee_role: "MANAGER" },
    { title: "Remise des documents d'embauche",       assignee_role: "RH" }
  ],
  onboarding_technique: [
    { title: "Présentation des outils collaboratifs", assignee_role: "IT" },
    { title: "Formation aux bonnes pratiques sécurité", assignee_role: "IT" },
    { title: "Accès aux dépôts / projets",            assignee_role: "IT" },
    { title: "Rendez-vous 1:1 avec le manager",       assignee_role: "MANAGER" }
  ],
  suivi_post_integration: [
    { title: "Point à J+7 avec le nouvel arrivant",     assignee_role: "MANAGER" },
    { title: "Point à J+30 avec le nouvel arrivant",    assignee_role: "MANAGER" },
    { title: "Revue des accès et du matériel",          assignee_role: "IT" },
    { title: "Clôture du dossier d'intégration",        assignee_role: "IT" }
  ]
};

// Tâches types créées automatiquement pour l'OUTBOARDING (départ)
const DEFAULT_OUTBOARDING_TASKS = {
  declaration_depart: [
    { title: "Enregistrer la demande de départ",               assignee_role: "RH" },
    { title: "Notifier le manager et l'équipe",                assignee_role: "RH" },
    { title: "Initier le processus de clôture contractuelle",  assignee_role: "RH" }
  ],
  transfert_connaissances: [
    { title: "Identifier les dossiers et projets en cours",    assignee_role: "MANAGER" },
    { title: "Planifier les sessions de transfert",            assignee_role: "MANAGER" },
    { title: "Documenter les procédures et accès spécifiques", assignee_role: "IT" },
    { title: "Remettre les livrables et notes de service",     assignee_role: "MANAGER" }
  ],
  revocation_acces: [
    { title: "Révoquer le compte Active Directory",           assignee_role: "IT" },
    { title: "Désactiver la boîte mail et les outils",        assignee_role: "IT" },
    { title: "Révoquer l'accès VPN et les applications",      assignee_role: "IT" },
    { title: "Désactiver la ligne mobile",                    assignee_role: "IT" },
    { title: "Vérifier la suppression des accès cloud",       assignee_role: "IT" }
  ],
  restitution_materiel: [
    { title: "Récupérer le PC portable et périphériques",     assignee_role: "IT" },
    { title: "Récupérer le badge d'accès et clés",            assignee_role: "IT" },
    { title: "Récupérer le smartphone et puce SIM",           assignee_role: "IT" },
    { title: "Inventaire du matériel rendu",                  assignee_role: "IT" }
  ],
  entretien_sortie: [
    { title: "Organiser l'entretien de sortie avec le manager", assignee_role: "MANAGER" },
    { title: "Recueillir le feedback de l'employé",             assignee_role: "RH" },
    { title: "Remettre les documents de fin de contrat",        assignee_role: "RH" },
    { title: "Préparer le certificat de travail",               assignee_role: "RH" }
  ],
  cloture_administrative: [
    { title: "Clôturer le dossier RH",                          assignee_role: "RH" },
    { title: "Transmettre le dossier à la comptabilité",        assignee_role: "RH" },
    { title: "Archiver les accès et matériel",                  assignee_role: "IT" },
    { title: "Finaliser le suivi post-départ",                  assignee_role: "RH" }
  ]
};
