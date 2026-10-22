/**
 * Invented content of the demo dataset: a fictitious team of the Cour de
 * cassation's digital department, five backlogs and their history. Titles
 * starting with « ! » are bugs.
 */

export type PersonKey =
  | "claire" | "karim" | "julien" | "sophie" | "thomas" | "ines" | "antoine"
  | "lucie" | "camille" | "mathieu" | "nadia" | "pierre" | "elodie";

/** `me` stands for the accounts that already exist in the target database. */
export type Actor = PersonKey | "me";

export const PEOPLE: Record<PersonKey, { name: string; email: string; role: string }> = {
  claire: { name: "Claire Martin", email: "claire.martin", role: "Product Owner" },
  karim: { name: "Karim Haddad", email: "karim.haddad", role: "Product Owner" },
  julien: { name: "Julien Bernard", email: "julien.bernard", role: "Scrum Master, développeur" },
  sophie: { name: "Sophie Lefèvre", email: "sophie.lefevre", role: "Développeuse front" },
  thomas: { name: "Thomas Moreau", email: "thomas.moreau", role: "Développeur back" },
  ines: { name: "Inès Benali", email: "ines.benali", role: "Développeuse full-stack" },
  antoine: { name: "Antoine Rousseau", email: "antoine.rousseau", role: "Développeur back" },
  lucie: { name: "Lucie Garnier", email: "lucie.garnier", role: "Développeuse front" },
  camille: { name: "Camille Dubois", email: "camille.dubois", role: "Designer UX" },
  mathieu: { name: "Mathieu Girard", email: "mathieu.girard", role: "Testeur" },
  nadia: { name: "Nadia Fontaine", email: "nadia.fontaine", role: "Greffière référente" },
  pierre: { name: "Pierre Lambert", email: "pierre.lambert", role: "Conseiller référendaire" },
  elodie: { name: "Élodie Petit", email: "elodie.petit", role: "Exploitation" },
};

export const EMAIL_DOMAIN = "demo.jiroo-dev.invalid";

export const GROUPS: { name: string; members: PersonKey[]; role: "administrators" | "members" | "viewers" }[] = [
  { name: "Équipe produit", members: ["claire", "karim", "julien", "camille"], role: "administrators" },
  { name: "Développement", members: ["sophie", "thomas", "ines", "antoine", "lucie", "mathieu", "elodie"], role: "members" },
  { name: "Référents métier", members: ["nadia", "pierre"], role: "viewers" },
];

export type TaskSpec = string | { title: string; points?: number | null; description?: string; sub?: string[] };
export type EpicSpec = { title: string; description: string; tasks: TaskSpec[] };
export type ComponentSpec = { title: string; description: string; epics: EpicSpec[] };

export type BacklogSpec = {
  key: string;
  name: string;
  color: string;
  mode: "scrum" | "kanban";
  po: PersonKey;
  devs: Actor[];
  qa: PersonKey;
  business: PersonKey;
  components: ComponentSpec[];
  /** Bugs found during the sprints, in order. */
  sprintBugs: string[];
  /** Goals of the six completed sprints, the active one and the two planned ones. */
  goals: string[];
  releases: { name: string; description: string }[];
};

export const LABELS = ["sécurité", "accessibilité", "performance", "dette technique", "UX", "RGPD", "recette métier"];

export const BACKLOGS: BacklogSpec[] = [
  {
    key: "CASS",
    name: "Cour de cassation",
    color: "#7c3030",
    mode: "scrum",
    po: "claire",
    devs: ["lucie", "antoine", "me"],
    qa: "mathieu",
    business: "nadia",
    releases: [
      { name: "Portail 1.0", description: "Socle du portail : connexion renforcée, tableau de bord et annuaire." },
      { name: "Portail 1.1", description: "Agenda des chambres et centre de notifications." },
      { name: "Portail 1.2", description: "Notes de service et mise en conformité RGAA." },
      { name: "Portail 2.0", description: "Personnalisation avancée et habilitations déléguées." },
    ],
    goals: [
      "Sécuriser la connexion par double authentification",
      "Premier tableau de bord personnel des magistrats",
      "Sessions maîtrisées et annuaire consultable",
      "Agenda des chambres utilisable en audience",
      "Centre de notifications et préférences",
      "Diffuser les notes de service aux chambres",
      "Accessibilité RGAA des écrans prioritaires",
      "Habilitations auditables",
      "Personnalisation du portail",
    ],
    sprintBugs: [
      "!Le widget des audiences affiche l’heure en UTC",
      "!Double notification lors d’une mention",
      "!Le lien de réinitialisation expire immédiatement",
      "!La recherche dans l’annuaire est sensible à la casse",
      "!Le menu utilisateur reste ouvert après la déconnexion",
      "!Note de service : pièce jointe non téléchargeable sous Firefox",
      "!Le compteur de notifications ne se met pas à jour",
    ],
    components: [
      {
        title: "Authentification",
        description: "Connexion des agents, double authentification et cycle de vie des comptes.",
        epics: [
          {
            title: "2FA TOTP",
            description: "Double authentification par application (TOTP) obligatoire pour tous les agents.",
            tasks: [
              "Écran de vérification du code",
              { title: "Génération et affichage du QR code d’enrôlement", sub: ["Maquette de l’écran d’enrôlement", "Génération du secret côté serveur", "Tests d’enrôlement"] },
              "Codes de secours à usage unique",
              "Réinitialisation de la double authentification par un administrateur",
              "Journaliser les échecs de vérification",
              "Limiter les tentatives de code (verrouillage temporaire)",
            ],
          },
          {
            title: "Gestion des sessions",
            description: "Durée de vie des sessions, déconnexion et visibilité des appareils connectés.",
            tasks: [
              "Expiration de session après 30 minutes d’inactivité",
              "Déconnexion de tous les appareils",
              "Afficher les sessions actives dans le profil",
              "Avertir avant l’expiration de la session",
              "!La session expire pendant la saisie d’un long commentaire",
            ],
          },
          {
            title: "Comptes et habilitations",
            description: "Alimentation des comptes depuis l’annuaire et contrôle annuel des habilitations.",
            tasks: [
              { title: "Import des comptes depuis l’annuaire LDAP", points: 8, sub: ["Connexion à l’annuaire en lecture seule", "Correspondance des services et des chambres", "Rapport d’import"] },
              "Désactivation automatique des comptes des agents partis",
              "Écran d’administration des habilitations",
              "Export CSV des habilitations pour l’audit annuel",
            ],
          },
        ],
      },
      {
        title: "Portail des magistrats",
        description: "Page d’accueil des magistrats et des greffiers : audiences, dossiers et outils du quotidien.",
        epics: [
          {
            title: "Tableau de bord personnel",
            description: "Un tableau de bord qui répond à « qu’est-ce qui m’attend cette semaine ? ».",
            tasks: [
              { title: "Widget « Mes audiences de la semaine »", sub: ["Maquette validée par les référents", "Composant d’interface", "Tests de composant"] },
              "Widget « Dossiers à rapporter »",
              "Raccourcis vers les outils fréquents",
              "Personnaliser l’ordre des widgets",
              "Mode sombre du portail",
            ],
          },
          {
            title: "Agenda des chambres",
            description: "Calendrier partagé des audiences, par chambre et par formation.",
            tasks: [
              { title: "Afficher le calendrier des audiences par chambre", points: 8 },
              "Filtrer l’agenda par formation",
              "Export iCal de l’agenda personnel",
              "Signaler un conflit d’audience",
              "!Les audiences du samedi n’apparaissent pas dans la vue semaine",
            ],
          },
          {
            title: "Annuaire interne",
            description: "Retrouver un agent, sa chambre et ses coordonnées en quelques secondes.",
            tasks: [
              "Recherche dans l’annuaire par nom et service",
              "Fiche agent avec coordonnées et chambre",
              "Organigramme des chambres",
              "Synchronisation nocturne avec le référentiel RH",
            ],
          },
        ],
      },
      {
        title: "Notifications et messagerie",
        description: "Informer les agents au bon moment, sans les submerger.",
        epics: [
          {
            title: "Centre de notifications",
            description: "Toutes les notifications du portail au même endroit.",
            tasks: [
              "Liste des notifications non lues",
              "Marquer toutes les notifications comme lues",
              "Préférences de notification par type",
              "Résumé quotidien par courriel",
            ],
          },
          {
            title: "Diffusion des notes de service",
            description: "Publier les notes de service aux chambres et suivre leur lecture.",
            tasks: [
              { title: "Publier une note de service à une chambre", sub: ["Formulaire de publication", "Choix des destinataires", "Tests d’intégration"] },
              "Accusé de lecture des notes de service",
              "Archivage des notes de plus d’un an",
              "Recherche plein texte dans les notes",
            ],
          },
          {
            title: "Accessibilité RGAA",
            description: "Mise en conformité RGAA 4.1 des écrans les plus utilisés.",
            tasks: [
              { title: "Audit RGAA du portail (critères prioritaires)", points: 5 },
              "Navigation clavier complète du tableau de bord",
              "Contrastes conformes AA sur les widgets",
              "Libellés ARIA des icônes d’action",
              "Publier la déclaration d’accessibilité",
            ],
          },
        ],
      },
    ],
  },
  {
    key: "JURI",
    name: "Recherche jurisprudentielle",
    color: "#2f5d8a",
    mode: "scrum",
    po: "claire",
    devs: ["sophie", "thomas", "ines"],
    qa: "mathieu",
    business: "pierre",
    releases: [
      { name: "Recherche 1.0", description: "Moteur plein texte, filtres essentiels et fiche décision." },
      { name: "Recherche 1.1", description: "Pertinence, rapprochements et recherches enregistrées." },
      { name: "Recherche 1.2", description: "Titrage, dossiers documentaires et alertes." },
      { name: "Recherche 2.0", description: "Ouverture aux partenaires : API et open data." },
    ],
    goals: [
      "Une première recherche plein texte sur les arrêts publiés",
      "Filtrer les résultats comme les conseillers le demandent",
      "Une fiche décision lisible et citable",
      "Des résultats plus pertinents",
      "Retrouver les décisions liées",
      "Enregistrer ses recherches et être alerté",
      "Outiller le titrage du SDER",
      "Dossiers documentaires partagés",
      "Préparer l’API partenaires",
    ],
    sprintBugs: [
      "!La pagination est perdue au retour sur les résultats",
      "!Les filtres de date acceptent une fin avant le début",
      "!Le PDF coupe les tableaux du dispositif",
      "!Doublons dans les décisions similaires",
      "!L’alerte courriel part deux fois",
      "!Caractères spéciaux mal encodés dans l’export",
      "!La surbrillance casse les liens Légifrance",
    ],
    components: [
      {
        title: "Moteur de recherche",
        description: "Indexation et recherche dans les décisions de la Cour.",
        epics: [
          {
            title: "Recherche plein texte",
            description: "Chercher dans le texte intégral des arrêts, avec la syntaxe attendue par les juristes.",
            tasks: [
              { title: "Indexer les arrêts publiés depuis 2000", points: 8, sub: ["Reprise du stock d’arrêts", "Pipeline d’indexation incrémentale", "Contrôle des volumes indexés"] },
              "Recherche par expression exacte entre guillemets",
              "Opérateurs booléens ET / OU / SAUF",
              "Mettre en surbrillance les termes trouvés",
              "Correction orthographique des requêtes",
              "!Les accents ne sont pas ignorés dans la recherche",
            ],
          },
          {
            title: "Filtres et facettes",
            description: "Affiner une recherche par chambre, période, solution et matière.",
            tasks: [
              "Filtre par chambre",
              "Filtre par période de décision",
              "Filtre par solution (cassation, rejet, irrecevabilité)",
              { title: "Facette par matière avec compteurs", sub: ["Agrégation des matières", "Composant de facette", "Tests de performance"] },
              "Conserver les filtres dans l’URL",
            ],
          },
          {
            title: "Pertinence",
            description: "Faire remonter les décisions qui comptent.",
            tasks: [
              "Pondérer le sommaire et le titrage",
              "Favoriser les arrêts publiés au Bulletin",
              { title: "Jeu de requêtes de référence pour mesurer la pertinence", points: 5 },
              "Tableau de bord de la qualité de recherche",
            ],
          },
        ],
      },
      {
        title: "Consultation des décisions",
        description: "Lire, citer et rapprocher les décisions.",
        epics: [
          {
            title: "Fiche décision",
            description: "Une décision structurée, lisible à l’écran comme à l’impression.",
            tasks: [
              { title: "Afficher le texte intégral structuré (visa, motifs, dispositif)", points: 8, sub: ["Découpage des parties de l’arrêt", "Mise en page de lecture", "Tests sur 200 arrêts types"] },
              "Bloc « Textes appliqués » avec liens Légifrance",
              "Décisions attaquées et décisions de renvoi liées",
              "Copier la référence au format citation",
              "Impression PDF de la décision",
            ],
          },
          {
            title: "Rapprochements",
            description: "Naviguer entre décisions citées, citantes et similaires.",
            tasks: [
              "Décisions citées et citantes",
              "Suggestions de décisions similaires",
              "Signaler un rapprochement erroné",
            ],
          },
          {
            title: "Titrage et sommaires",
            description: "Outiller le Service de documentation, des études et du rapport (SDER).",
            tasks: [
              { title: "Éditeur de titrage pour le SDER", points: 8 },
              "Validation à deux niveaux du sommaire",
              "Historique des versions du titrage",
              "Thésaurus des mots-clés avec autocomplétion",
            ],
          },
        ],
      },
      {
        title: "Espace personnel",
        description: "Ce que chaque conseiller garde, partage et suit.",
        epics: [
          {
            title: "Recherches enregistrées",
            description: "Retrouver ses recherches et être prévenu des nouvelles décisions.",
            tasks: [
              "Enregistrer une recherche",
              "Alerte courriel sur nouvelle décision correspondante",
              "Partager une recherche avec un collègue",
              "Renommer et classer ses recherches",
            ],
          },
          {
            title: "Dossiers documentaires",
            description: "Rassembler les décisions utiles à un dossier et les annoter.",
            tasks: [
              "Créer un dossier documentaire",
              "Ajouter une décision à un dossier",
              "Annoter une décision (note privée)",
              "Exporter un dossier en ZIP",
            ],
          },
          {
            title: "Open data",
            description: "Mettre les décisions à disposition des partenaires et du public.",
            tasks: [
              { title: "API de recherche pour les partenaires", points: 8, sub: ["Contrat d’interface", "Authentification par clé", "Tests de charge"] },
              "Quotas et clés d’API",
              "Documentation OpenAPI publique",
              { title: "Export hebdomadaire pour data.gouv", points: null },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "GREF",
    name: "Greffe numérique",
    color: "#3a7d5c",
    mode: "scrum",
    po: "karim",
    devs: ["lucie", "antoine", "julien"],
    qa: "mathieu",
    business: "nadia",
    releases: [
      { name: "Greffe 1.0", description: "Enregistrement des pourvois et dépôt des pièces." },
      { name: "Greffe 1.1", description: "Circuit du dossier et rôle d’audience." },
      { name: "Greffe 1.2", description: "Feuille d’audience signée et messagerie sécurisée." },
      { name: "Greffe 2.0", description: "Portail des avocats aux Conseils et statistiques." },
    ],
    goals: [
      "Enregistrer un pourvoi de bout en bout",
      "Déposer et contrôler les pièces de procédure",
      "Suivre le circuit du dossier jusqu’au rapporteur",
      "Constituer et publier le rôle d’audience",
      "Feuille d’audience pré-remplie",
      "Délibéré et prononcé tracés",
      "Messagerie sécurisée avec les avocats",
      "Ouvrir le portail aux avocats aux Conseils",
      "Statistiques du greffe pour le rapport annuel",
    ],
    sprintBugs: [
      "!Horodatage décalé d’une heure au passage à l’heure d’hiver",
      "!La visionneuse ne charge pas les PDF de plus de 50 Mo",
      "!La relance part pour un dossier clos",
      "!Composition de la formation non enregistrée si un siège est vide",
      "!Message sans objet refusé sans explication",
      "!Statistiques : le mois de juillet compté deux fois",
      "!Le rôle d’audience perd l’ordre après un renvoi",
    ],
    components: [
      {
        title: "Dossier de pourvoi",
        description: "De la déclaration du pourvoi à l’affectation du dossier.",
        epics: [
          {
            title: "Enregistrement du pourvoi",
            description: "Dématérialiser la déclaration et l’enregistrement des pourvois.",
            tasks: [
              { title: "Formulaire de déclaration de pourvoi", points: 5, sub: ["Maquette avec les greffières", "Formulaire et validations", "Tests du parcours complet"] },
              "Attribution automatique du numéro de pourvoi",
              "Contrôle de recevabilité des délais",
              "Accusé de réception à l’avocat aux Conseils",
              "!Le numéro de pourvoi est attribué deux fois en cas de double clic",
            ],
          },
          {
            title: "Pièces de procédure",
            description: "Déposer, contrôler et consulter les pièces du dossier.",
            tasks: [
              "Dépôt du mémoire ampliatif en PDF",
              "Contrôle du format PDF/A",
              "Horodatage des dépôts",
              { title: "Visionneuse des pièces dans le navigateur", points: 8 },
              "Bordereau des pièces généré automatiquement",
            ],
          },
          {
            title: "Circuit du dossier",
            description: "Affecter, désigner et suivre les échéances.",
            tasks: [
              "Affectation du dossier à une chambre",
              "Désignation du conseiller rapporteur",
              "Suivi des échéances du mémoire en défense",
              "Relance automatique avant échéance",
            ],
          },
        ],
      },
      {
        title: "Audiences",
        description: "Préparer, tenir et clôturer les audiences.",
        epics: [
          {
            title: "Rôle d’audience",
            description: "Constituer et diffuser le rôle des audiences.",
            tasks: [
              { title: "Constituer le rôle d’une audience", points: 5 },
              "Réordonner les affaires du rôle",
              "Publier le rôle sur l’intranet",
              "Gérer les renvois d’affaires",
              "!Le rôle imprimé coupe les noms longs",
            ],
          },
          {
            title: "Feuille d’audience",
            description: "Une feuille d’audience pré-remplie et signée électroniquement.",
            tasks: [
              "Saisie de la composition de la formation",
              "Feuille d’audience pré-remplie",
              { title: "Signature électronique du président", points: 8, sub: ["Intégration du parapheur", "Vérification de la signature", "Recette avec le président de chambre"] },
              "Archivage de la feuille signée",
            ],
          },
          {
            title: "Délibéré et prononcé",
            description: "Suivre le délibéré et informer les parties du prononcé.",
            tasks: [
              "Calendrier des délibérés",
              "Notification du prononcé aux parties",
              "Mise à disposition de l’arrêt au greffe",
              "Transmission de l’arrêt au service de documentation",
            ],
          },
        ],
      },
      {
        title: "Échanges avec les avocats",
        description: "Des échanges sécurisés et traçables avec les avocats aux Conseils.",
        epics: [
          {
            title: "Messagerie sécurisée",
            description: "Échanger par dossier, avec pièces jointes chiffrées.",
            tasks: [
              "Boîte de réception par dossier",
              "Pièces jointes chiffrées",
              "Accusé de lecture des messages",
              "Archivage des échanges à la clôture",
            ],
          },
          {
            title: "Portail des avocats aux Conseils",
            description: "Un accès en ligne aux dossiers pour les avocats aux Conseils.",
            tasks: [
              { title: "Connexion par certificat de l’Ordre", points: 8 },
              "Liste des dossiers de l’avocat",
              "Téléchargement des pièces adverses",
              { title: "Paiement en ligne des droits de plaidoirie", points: null },
            ],
          },
          {
            title: "Statistiques du greffe",
            description: "Les chiffres du greffe sans ressaisie.",
            tasks: [
              "Nombre de pourvois enregistrés par mois",
              "Délai moyen de traitement par chambre",
              "Export mensuel pour le rapport annuel",
            ],
          },
        ],
      },
    ],
  },
  {
    key: "ANON",
    name: "Pseudonymisation des décisions",
    color: "#8a5a2f",
    mode: "scrum",
    po: "karim",
    devs: ["ines", "thomas", "me"],
    qa: "mathieu",
    business: "pierre",
    releases: [
      { name: "Pseudo 1.0", description: "Détection des personnes et écran de relecture." },
      { name: "Pseudo 1.1", description: "Règles métier et validation à deux niveaux." },
      { name: "Pseudo 1.2", description: "Publication open data quotidienne." },
      { name: "Pseudo 2.0", description: "Contrôle qualité et conformité RGPD complète." },
    ],
    goals: [
      "Détecter les noms de personnes de manière fiable",
      "Relire une décision en moins de cinq minutes",
      "Appliquer les règles métier de pseudonymisation",
      "Valider à deux niveaux",
      "Traiter le stock par lots",
      "Publier en open data chaque jour",
      "Mesurer la qualité de la pseudonymisation",
      "Conformité RGPD documentée",
      "Rapport trimestriel au comité de pilotage",
    ],
    sprintBugs: [
      "!Les numéros de téléphone avec des points ne sont pas détectés",
      "!La validation se bloque sur une décision vide",
      "!Export JSON sans la date de décision",
      "!Le raccourci « A » accepte aussi dans le champ de recherche",
      "!Les adresses étrangères sont ignorées",
      "!Le tableau de bord compte les décisions supprimées",
      "!Le modèle confond « Avril » prénom et mois",
    ],
    components: [
      {
        title: "Détection des entités",
        description: "Repérer automatiquement les données à pseudonymiser.",
        epics: [
          {
            title: "Modèle de reconnaissance",
            description: "Un modèle de reconnaissance d’entités nommées entraîné sur nos décisions.",
            tasks: [
              { title: "Annoter 2 000 décisions pour l’entraînement", points: 8, sub: ["Guide d’annotation", "Campagne d’annotation", "Contrôle croisé des annotations"] },
              "Entraîner le modèle sur les noms de personnes",
              "Détecter les adresses et les lieux",
              "Détecter les dates de naissance",
              "Mesurer précision et rappel par catégorie",
              "!Les noms composés avec particule sont mal découpés",
            ],
          },
          {
            title: "Règles métier",
            description: "Ce qui doit rester en clair, et ce qui ne doit jamais l’être.",
            tasks: [
              "Ne pas pseudonymiser les noms des magistrats",
              "Conserver les noms des sociétés cotées",
              "Liste blanche des juridictions",
              "Gérer les surnoms et diminutifs",
            ],
          },
          {
            title: "Performance du traitement",
            description: "Absorber le stock et le flux quotidien.",
            tasks: [
              "Traitement par lots de 500 décisions",
              "File d’attente avec reprise sur erreur",
              "Paralléliser l’inférence",
              "Moins de 2 secondes de traitement par décision",
            ],
          },
        ],
      },
      {
        title: "Interface de relecture",
        description: "L’écran où les agents vérifient et corrigent la pseudonymisation.",
        epics: [
          {
            title: "Écran de relecture",
            description: "Relire vite, au clavier, sans rien laisser passer.",
            tasks: [
              { title: "Afficher la décision avec les entités surlignées", points: 5, sub: ["Rendu du texte annoté", "Légende des catégories", "Tests de rendu"] },
              "Accepter ou rejeter une entité",
              "Ajouter une entité oubliée",
              "Raccourcis clavier de relecture",
              "!Le surlignage se décale après un saut de page",
            ],
          },
          {
            title: "Cohérence",
            description: "Une même personne, un même remplacement, partout.",
            tasks: [
              "Propager une correction à toutes les occurrences",
              "Signaler les incohérences de remplacement",
              "Aperçu du texte pseudonymisé",
            ],
          },
          {
            title: "Validation",
            description: "Un second regard avant publication.",
            tasks: [
              "Circuit de validation par un second relecteur",
              "Motif obligatoire en cas de rejet",
              "Historique des corrections par décision",
              "Tableau de bord des décisions en attente",
            ],
          },
        ],
      },
      {
        title: "Diffusion",
        description: "Publier sans risque de ré-identification.",
        epics: [
          {
            title: "Publication open data",
            description: "Alimenter Judilibre chaque jour.",
            tasks: [
              "Export JSON conforme au schéma Judilibre",
              "Publication quotidienne automatique",
              "Retirer une décision publiée par erreur",
              "Contrôle final avant publication",
            ],
          },
          {
            title: "Conformité RGPD",
            description: "Documenter et maîtriser le traitement.",
            tasks: [
              "Mettre à jour le registre des traitements",
              { title: "Analyse d’impact (AIPD)", points: 5 },
              "Purge des données d’entraînement",
              "Journal des accès aux décisions non pseudonymisées",
            ],
          },
          {
            title: "Qualité",
            description: "Mesurer et rendre compte de la qualité.",
            tasks: [
              "Échantillonnage mensuel pour le contrôle qualité",
              "Indicateur du taux de ré-identification",
              { title: "Rapport trimestriel au comité de pilotage", points: null },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "INFRA",
    name: "Plateforme et exploitation",
    color: "#555f6d",
    mode: "kanban",
    po: "julien",
    devs: ["elodie", "antoine", "me"],
    qa: "julien",
    business: "julien",
    releases: [],
    goals: [],
    sprintBugs: [],
    components: [
      {
        title: "Hébergement souverain",
        description: "Faire tourner les applications sur l’infrastructure interne de la Cour.",
        epics: [
          {
            title: "Migration vers le serveur interne",
            description: "Quitter l’hébergement de test pour le serveur souverain.",
            tasks: [
              "Image Docker de l’application",
              "Reverse proxy et certificats TLS internes",
              "Base PostgreSQL 17 hébergée en interne",
              "Plan de bascule et de retour arrière",
              "Test de charge avant bascule",
            ],
          },
          {
            title: "Sauvegardes",
            description: "Des sauvegardes chiffrées, testées et surveillées.",
            tasks: [
              "Sauvegarde quotidienne chiffrée",
              "Test de restauration mensuel",
              "Rétention des sauvegardes sur 35 jours",
              "Alerte en cas d’échec de sauvegarde",
            ],
          },
        ],
      },
      {
        title: "Supervision",
        description: "Voir les problèmes avant les utilisateurs.",
        epics: [
          {
            title: "Observabilité",
            description: "Mesures, journaux et alertes.",
            tasks: [
              "Tableau de bord des temps de réponse",
              "Alertes sur le taux d’erreur",
              "Centralisation des journaux",
              "Sonde de disponibilité externe",
            ],
          },
          {
            title: "Sécurité opérationnelle",
            description: "Maintenir la plateforme à jour et ses accès maîtrisés.",
            tasks: [
              "Mise à jour mensuelle des dépendances",
              "Analyse des vulnérabilités des images",
              "Rotation des secrets applicatifs",
              "Revue trimestrielle des accès administrateur",
              "!Certificat TLS de préproduction expiré",
            ],
          },
        ],
      },
    ],
  },
];

/** Comments posted on tasks; {po}, {qa}, {biz}, {dev}, {me} are replaced by names. */
export const COMMENTS: { by: "po" | "qa" | "biz" | "dev"; body: string; mention?: "po" | "qa" | "biz" | "dev" | "me" }[] = [
  { by: "dev", body: "Question pour @{po} : faut-il couvrir aussi les décisions non publiées dans ce périmètre ?", mention: "po" },
  { by: "po", body: "Oui, mêmes règles. On en a parlé en atelier mardi, c’est noté dans le compte rendu." },
  { by: "dev", body: "Première version poussée en préproduction. @{qa} tu peux y jeter un œil ?", mention: "qa" },
  { by: "qa", body: "Recette OK sur la préproduction : Firefox, Edge et lecteur d’écran. Rien à signaler." },
  { by: "biz", body: "Le libellé n’est pas parlant pour les greffiers. Proposition : « Issue du pourvoi » plutôt que « Solution »." },
  { by: "po", body: "D’accord avec la proposition de @{biz}, on change le libellé dans ce ticket.", mention: "biz" },
  { by: "dev", body: "Estimation revue à la hausse : la reprise des données existantes est plus lourde que prévu." },
  { by: "dev", body: "@{me} peux-tu valider l’accès à l’environnement de recette ? Je n’arrive pas à me connecter avec le compte de test.", mention: "me" },
  { by: "po", body: "Vu en daily : on découpe en deux pour livrer la lecture d’abord, l’écriture viendra au sprint suivant." },
  { by: "qa", body: "Deux cas limites trouvés : liste vide et nom de plus de 80 caractères. Détails dans le document de recette." },
  { by: "dev", body: "Corrigé, en attente de relecture de code." },
  { by: "po", body: "@{me} pour info, c’est ce ticket qui débloque la démonstration au comité de jeudi.", mention: "me" },
  { by: "biz", body: "Testé avec trois dossiers réels anonymisés : le parcours est clair, merci !" },
  { by: "qa", body: "Régression constatée sur l’impression, je rouvre un bug lié." },
  { by: "dev", body: "J’ai ajouté les tests de non-régression, la couverture du module passe à 87 %." },
];

/** Web pages attached to some tasks. */
export const WEB_LINKS = [
  { url: "https://wiki.cour.example/specifications/{key}", title: "Spécification fonctionnelle" },
  { url: "https://wiki.cour.example/ateliers/compte-rendu-{key}", title: "Compte rendu d’atelier" },
  { url: "https://maquettes.cour.example/projets/{key}", title: "Maquettes" },
];
