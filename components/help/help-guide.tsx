import { GuideNote, GuideSection, GuideTopic, Key, Ui } from "@/components/help/guide-blocks";
import { ShortcutList } from "@/components/shortcuts/shortcut-list";

/**
 * Functional user guide content (French). Every label quoted with <Ui> is the
 * exact text of the interface; keep them in sync when the UI changes.
 */
export function HelpGuide() {
  return (
    <div className="space-y-10">
      <GuideSection id="demarrer">
        <GuideTopic
          title="Se connecter"
          purpose="Accéder à Jiroo avec le compte créé par un administrateur."
          steps={[
            <>Saisissez votre <Ui>E-mail</Ui> et votre <Ui>Mot de passe</Ui>, puis cliquez sur <Ui>Se connecter</Ui>.</>,
            <>Saisissez le code à 6 chiffres de votre application d’authentification, puis <Ui>Vérifier</Ui>.</>,
          ]}
        >
          <GuideNote>
            Pas d’inscription libre ni de mot de passe oublié en libre-service : un administrateur crée les comptes
            et réinitialise les accès. Après une vérification réussie, le navigateur est mémorisé pendant un temps ; il
            peut vous être redemandé un code après un changement de mot de passe ou une réinitialisation.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Configurer la double authentification (premier login)"
          purpose="Protéger le compte : la double authentification est obligatoire pour utiliser Jiroo."
          steps={[
            <>Connectez-vous avec le mot de passe transmis : l’écran <Ui>Configurer la double authentification</Ui> s’ouvre.</>,
            <>Confirmez votre mot de passe, puis <Ui>Continuer</Ui>.</>,
            <>Scannez le QR code avec une application d’authentification (ou saisissez la <Ui>Clé manuelle</Ui>).</>,
            <>Notez les <Ui>Codes de récupération — conservez-les</Ui> en lieu sûr, puis cochez <Ui>J&apos;ai enregistré mes codes de récupération</Ui>.</>,
            <>Saisissez le code affiché par l’application et cliquez sur <Ui>Activer et continuer</Ui>.</>,
          ]}
        >
          <GuideNote>
            Les codes de récupération ne sont affichés qu’une seule fois. Chacun remplace le code à 6 chiffres :
            sur l’écran de vérification, choisissez <Ui>Utiliser un code de récupération</Ui>.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Changer mon mot de passe"
          purpose="Remplacer le mot de passe initial par le vôtre."
          steps={[
            <>Ouvrez le menu utilisateur (votre nom, en bas de la barre latérale).</>,
            <>Choisissez <Ui>Changer mon mot de passe</Ui>.</>,
            <>Remplissez <Ui>Mot de passe actuel</Ui>, <Ui>Nouveau mot de passe</Ui> et <Ui>Confirmer le nouveau mot de passe</Ui>, puis <Ui>Changer le mot de passe</Ui>.</>,
          ]}
        >
          <GuideNote>8 caractères minimum. Vos autres sessions ouvertes sont fermées ; vous restez connecté sur cet appareil.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Téléphone perdu ou codes égarés"
          purpose="Retrouver l’accès si vous ne pouvez plus produire de code."
          steps={[
            <>Utilisez un code de récupération si vous en avez encore un.</>,
            <>Sinon, demandez à un administrateur de <Ui>Réinitialiser la double authentification</Ui> de votre compte.</>,
            <>À la connexion suivante, configurez à nouveau la double authentification.</>,
          ]}
        />

        <GuideTopic
          title="Profil et préférences"
          purpose="Consulter votre compte et régler l’affichage sur cet appareil."
          steps={[
            <>Menu utilisateur → <Ui>Profil</Ui> : nom, e-mail et rôle (lecture seule).</>,
            <>Menu utilisateur → <Ui>Préférences</Ui> : <Ui>Thème</Ui> clair ou sombre et <Ui>Densité</Ui> (<Ui>Confort</Ui> / <Ui>Compact</Ui>).</>,
            <>Pour quitter : menu utilisateur → <Ui>Déconnexion</Ui>.</>,
          ]}
        />
      </GuideSection>

      <GuideSection id="organisation">
        <GuideTopic
          title="Backlogs"
          purpose="Un backlog regroupe les tickets d’une équipe ou d’un projet, avec ses statuts, sprints, releases et vues."
          steps={[
            <>Changez de backlog avec le sélecteur en haut de la barre latérale.</>,
            <>Dans la section <Ui>Filtres</Ui> de la barre latérale, <Ui>Tous les items</Ui> affiche le backlog courant sans filtre ; <Ui>Mes items</Ui> liste les tickets qui vous sont assignés, tous backlogs confondus.</>,
            <>Depuis n’importe quelle page (Aide, Administration, Releases…), cliquez sur le logo <Ui>Jiroo</Ui> ou sur le nom du backlog dans le fil d’Ariane, au-dessus du titre de la page, pour revenir à l’accueil du backlog.</>,
          ]}
        >
          <GuideNote>
            Chaque ticket a une clé : clé du backlog + numéro (ex. CASS-12). Les numéros sont uniques mais pas
            forcément consécutifs dans un backlog.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Retrouver ses backlogs"
          purpose="Voir d’un coup d’œil tous les backlogs auxquels vous avez accès et garder vos favoris à portée de main."
          steps={[
            <>Ouvrez l’accueil avec <Ui>Tous les backlogs</Ui>, sous le sélecteur de backlog de la barre latérale.</>,
            <>Chaque ligne affiche le nom et la clé du backlog, le nombre d’items ouverts (statut hors catégorie Terminé), le sprint actif avec ses points terminés sur les points engagés au démarrage (ou <Ui>Aucun sprint actif</Ui>) et le responsable.</>,
            <>Cliquez sur une ligne pour ouvrir le backlog.</>,
            <>Cliquez sur l’étoile (infobulle <Ui>Ajouter aux favoris</Ui>) pour placer un backlog en tête de liste ; cliquez à nouveau (<Ui>Retirer des favoris</Ui>) pour l’enlever. Pour les lecteurs d’écran, le bouton s’appelle « Favori » suivi du nom du backlog et indique s’il est activé.</>,
          ]}
        >
          <GuideNote>
            Les favoris sont personnels. Ils apparaissent d’abord sur l’accueil et dans le sélecteur de backlog,
            marqués d’une étoile ; les autres backlogs suivent par ordre alphabétique. Les backlogs archivés n’y
            figurent pas.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Hiérarchie"
          purpose="Ranger le travail du plus large au plus précis : Composant → Epic → Tâche → Sous-tâche."
        >
          <ul className="t-body list-disc space-y-1 pl-5">
            <li><Ui>Composant</Ui> : racine, sans parent.</li>
            <li><Ui>Epic</Ui> : parent obligatoire, un Composant.</li>
            <li><Ui>Tâche</Ui> : parent obligatoire, une Epic.</li>
            <li><Ui>Sous-tâche</Ui> : parent obligatoire, une Tâche.</li>
          </ul>
          <GuideNote>
            Le parent se choisit à la création et doit appartenir au même backlog. Seules les tâches s’estiment et
            se planifient dans un sprint.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Statuts"
          purpose="Suivre l’avancement d’un ticket ; sur le Board, chaque statut est une colonne."
        >
          <p className="t-body">
            Par défaut : <Ui>À faire</Ui>, <Ui>En cours</Ui>, <Ui>En revue</Ui>, <Ui>Terminé</Ui>. Chaque statut
            appartient à une catégorie (À faire, En cours, Terminé) ; « terminé » dans les rapports signifie
            « catégorie Terminé ».
          </p>
          <GuideNote>
            Les personnes autorisées adaptent les statuts d’un backlog depuis le Board, à droite du titre, avec <Ui>Gérer les colonnes</Ui>
            {" "}(ajouter, renommer, réordonner, supprimer avec un <Ui>Statut de destination</Ui>).
          </GuideNote>
        </GuideTopic>

        <GuideTopic title="Priorité, nature et points" purpose="Qualifier un ticket pour le trier et le planifier.">
          <ul className="t-body list-disc space-y-1 pl-5">
            <li><Ui>Priorité</Ui> : Aucune, Basse, Moyenne, Haute, Urgent.</li>
            <li><Ui>Nature</Ui> : Fonctionnalité (par défaut) ou Bug, quel que soit le type.</li>
            <li><Ui>Points</Ui> : estimation d’une tâche, de 0 à 999,99. Raccourcis 1, 2, 3, 5, 8, 13.</li>
          </ul>
        </GuideTopic>

        <GuideTopic
          title="Modèles"
          purpose="Pré-remplir un nouveau ticket avec une structure de description."
          steps={[
            <>Dans la fenêtre <Ui>Nouvel item</Ui> (bouton <Ui>+ Créer</Ui>), choisissez un <Ui>Modèle</Ui>.</>,
            <><Ui>Rapport de bug</Ui> : nature Bug, sections Étapes pour reproduire, Comportement attendu, Comportement observé, Environnement.</>,
            <><Ui>User story</Ui> : « En tant que… je veux… afin de… » et critères d’acceptation.</>,
          ]}
        />
      </GuideSection>

      <GuideSection id="vues">
        <GuideTopic
          title="Choisir une vue"
          purpose="Regarder le même backlog sous l’angle utile au moment."
          steps={[
            <>Choisissez la vue dans la barre latérale, sous le sélecteur de backlog : <Ui>Backlog</Ui>, <Ui>Board</Ui>, <Ui>Liste</Ui>, <Ui>Arbre</Ui> (puis <Ui>Releases</Ui> et <Ui>Rapports</Ui>).</>,
            <>Le titre de la page reprend le nom de la vue ; le fil d’Ariane au-dessus indique le backlog et, le cas échéant, la vue enregistrée active.</>,
          ]}
        >
          <ul className="t-body list-disc space-y-1 pl-5">
            <li><Ui>Backlog</Ui> : les tâches par sprint et la section Backlog, une ligne compacte par tâche ; glisser-déposer pour classer et planifier.</li>
            <li><Ui>Board</Ui> : les tâches du sprint actif, une colonne par statut ; déplacer une carte change son statut.</li>
            <li><Ui>Liste</Ui> : tableau de tous les tickets, colonnes triables, menu <Ui>Colonnes</Ui>.</li>
            <li><Ui>Arbre</Ui> : la hiérarchie ; glisser un ticket sous un autre parent le rattache (règles de hiérarchie).</li>
          </ul>
          <GuideNote>
            Le classement manuel par glisser-déposer n’est possible que sans tri ni regroupement actif.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Lire une ligne du Backlog"
          purpose="Voir l’essentiel d’une tâche et le modifier sans l’ouvrir."
          steps={[
            <>À gauche : case de sélection, poignée de glisser-déposer, type, clé et titre (cliquez sur la ligne pour ouvrir le ticket).</>,
            <>À droite : <Ui>Bug</Ui> si c’est un bug, l’epic parent, la priorité, les Fix versions, le statut, les points et l’assigné.</>,
            <>Cliquez sur le statut, la priorité, les points ou l’avatar de l’assigné pour les modifier sur place.</>,
          ]}
        >
          <GuideNote>
            Une valeur vide n’est pas affichée : sans priorité ni points, leur bouton apparaît au survol de la ligne
            ou au clavier. Un cercle pointillé signale une tâche non assignée.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Filtrer et regrouper"
          purpose="Réduire la vue aux tickets qui vous intéressent."
          steps={[
            <>Tapez dans <Ui>Filtrer…</Ui>, ou cliquez sur un avatar pour ne voir que les tickets de cette personne (l’icône <Ui>Non assigné</Ui> pour les tickets sans assigné) ; un avatar enfoncé est un filtre actif, cliquez à nouveau pour le retirer.</>,
            <>Ouvrez <Ui>Type</Ui>, <Ui>Statut</Ui> ou <Ui>Parent</Ui> (descendants d’un Composant ou d’une Epic). Les autres filtres, <Ui>Priorité</Ui>, <Ui>Label</Ui>, <Ui>Version</Ui>, <Ui>Sprint</Ui> et <Ui>Nature</Ui>, sont derrière <Ui>+ Filtre</Ui>.</>,
            <>Dans la <Ui>Liste</Ui> et l’<Ui>Arbre</Ui>, <Ui>Sprint</Ui> propose le sprint actif, les sprints planifiés et les sprints terminés (les plus récents d’abord), plus <Ui>Aucun sprint</Ui>. Un ticket reporté d’un sprint au suivant reste trouvable sous chacun d’eux ; un ticket retiré d’un sprint avant sa fin n’en fait plus partie. Les sous-tâches suivent leur tâche.</>,
            <>Un filtre actif s’affiche en pastille avec sa valeur (ex. <Ui>Statut : En cours</Ui>) ; sa croix le retire, <Ui>Réinitialiser</Ui> efface tous les filtres.</>,
            <>Regroupez avec le menu <Ui>Affichage</Ui> à droite du titre → <Ui>Grouper par</Ui> (Statut, Priorité, Assigné, Composant ; pas sur l’Arbre).</>,
          ]}
        >
          <GuideNote>Les filtres sont dans l’adresse de la page : copiez-la pour partager exactement la même vue.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Vues enregistrées"
          purpose="Retrouver en un clic une combinaison de vue, filtres, regroupement et tri."
          steps={[
            <>Réglez la vue : dès qu’un filtre, un regroupement ou un tri est actif, le bouton <Ui>Enregistrer la vue</Ui> apparaît à droite de la barre de filtres ; choisissez <Ui>Enregistrer sous…</Ui>. Vous pouvez aussi cliquer sur <Ui>+ Enregistrer une vue</Ui> dans la section <Ui>Filtres</Ui> de la barre latérale.</>,
            <>Donnez un <Ui>Nom de la vue</Ui> ; cochez <Ui>Partager avec l&apos;équipe</Ui> pour la rendre visible des autres.</>,
            <>Retrouvez-la dans la barre latérale, section <Ui>Filtres</Ui> : <Ui>Vues perso</Ui> ou <Ui>Vues partagées</Ui>.</>,
            <>Après modification, le menu de la vue propose <Ui>Enregistrer</Ui>, <Ui>Enregistrer sous…</Ui>, <Ui>Renommer…</Ui> et <Ui>Supprimer</Ui>.</>,
          ]}
        >
          <GuideNote>
            Dans ce menu, vous modifiez vos propres vues si vos droits le permettent ; pour reprendre la vue d’un
            autre utilisateur, utilisez <Ui>Enregistrer sous…</Ui>. Les vues partagées restent soumises aux droits de
            gestion des vues partagées du backlog.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Densité"
          purpose="Afficher plus ou moins de lignes à l’écran."
          steps={[<>Ouvrez le menu <Ui>Affichage</Ui> à droite du titre de la vue et choisissez <Ui>Confort</Ui> ou <Ui>Compact</Ui> (ou dans <Ui>Préférences</Ui>) ; le bouton rappelle la densité courante.</>]}
        />
      </GuideSection>

      <GuideSection id="tickets">
        <GuideTopic
          title="Créer un ticket"
          purpose="Ajouter un Composant, une Epic, une Tâche ou une Sous-tâche."
          steps={[
            <>Dans une vue du backlog, cliquez sur <Ui>+ Créer</Ui> dans la barre du haut, à côté du champ de recherche (ou touche <Key>C</Key>) : la fenêtre <Ui>Nouvel item</Ui> s’ouvre. Dans le Backlog, utilisez aussi <Ui>Créer un item</Ui> en bas d’une section (voir ci-dessous). Depuis le détail d’un ticket, <Ui>+ Créer une tâche</Ui> (ou une sous-tâche, un epic) préremplit le type et le parent.</>,
            <>Choisissez le <Ui>Type</Ui> (et un <Ui>Modèle</Ui> si besoin), puis, sauf pour un Composant, le <Ui>Parent</Ui> obligatoire ; saisissez le <Ui>Titre</Ui> et la <Ui>Description</Ui> dans l’éditeur mis en forme.</>,
            <>Dans <Ui>Détails</Ui>, ajustez <Ui>Statut</Ui> (il affiche le statut que recevra le ticket, le premier statut « À faire » par défaut), <Ui>Assigné</Ui> (ou <Ui>M’assigner</Ui>, à droite du champ), <Ui>Priorité</Ui>, <Ui>Points</Ui> et <Ui>Sprint</Ui> (tâches), <Ui>Nature</Ui>, <Ui>Labels</Ui>, <Ui>Fix versions</Ui>, <Ui>Échéance</Ui>, puis <Ui>Créer</Ui>.</>,
            <>Cochez <Ui>Créer un autre</Ui> pour enchaîner : la fenêtre reste ouverte avec le même type, le même parent et le même sprint ; seuls le titre et la description sont vidés.</>,
          ]}
        >
          <GuideNote>
            Après la création, le message « CASS-7 créé » propose <Ui>Ouvrir</Ui> (affiche le ticket) et <Ui>Annuler</Ui>. Les champs absents de la fenêtre dépendent de vos droits (assignation, planification).
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Créer une tâche depuis le Backlog"
          purpose="Ajouter vite une tâche dans un sprint ou dans la section Backlog."
          steps={[
            <>En bas du sprint ou de la section Backlog, cliquez sur <Ui>Créer un item</Ui>.</>,
            <>Saisissez le titre, choisissez l’<Ui>Epic parent</Ui> (la dernière utilisée est proposée), puis <Key>Entrée</Key>.</>,
            <>Le champ reste ouvert pour la tâche suivante ; <Key>Échap</Key> le referme.</>,
          ]}
        >
          <GuideNote>
            <Ui>Plus d’options</Ui> ouvre la fenêtre de création complète (modèle, statut, priorité, nature, Fix
            versions) pour la même section ; le type y est fixé à <Ui>Tâche</Ui>.
          </GuideNote>
          <GuideNote>
            <Ui>Créer un item</Ui> n’apparaît que si votre rôle permet de planifier : la tâche est rattachée à
            un epic. Sinon, utilisez <Ui>+ Créer</Ui> en haut de l’écran pour les autres types.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Ouvrir et modifier un ticket"
          purpose="Voir et éditer toutes les informations d’un ticket sans quitter la vue."
          steps={[
            <>Cliquez sur un ticket (ou <Key>Entrée</Key> sur une ligne sélectionnée) : le détail s’ouvre en panneau latéral, avec le contenu à gauche et les propriétés à droite (en dessous sur un écran étroit, en plein écran sur mobile).</>,
            <>En-tête : le fil d’Ariane mène au parent ; <Ui>Copier le lien</Ui> copie une adresse qui rouvre ce ticket ; <Ui>Plus d’actions</Ui> permet de supprimer ; <Ui>Item précédent (K)</Ui> et <Ui>Item suivant (J)</Ui> parcourent les tickets dans l’ordre de la vue affichée derrière ; <Ui>Fermer (Échap)</Ui>.</>,
            <>Cliquez sur le titre pour le renommer. Description : écrivez directement dedans, comme sur une page (voir <Ui>Écrire la description</Ui> ci-dessous).</>,
            <>Sous la description, la section des enfants (<Ui>Epics</Ui>, <Ui>Tâches</Ui> ou <Ui>Sous-tâches</Ui>) liste les tickets rattachés avec leur statut ; <Ui>+ Créer…</Ui> en ajoute un.</>,
            <>À droite, le bouton de statut change le statut ; le bouton voisin (par exemple <Ui>En cours →</Ui>) passe directement au statut suivant du flux.</>,
            <>Panneau <Ui>Détails</Ui> : cliquez sur une valeur (<Ui>Assigné</Ui>, <Ui>Priorité</Ui>, <Ui>Échéance</Ui>…) pour la modifier ; <Ui>M’assigner</Ui> vous attribue le ticket. Les panneaux <Ui>Détails</Ui> et <Ui>Développement</Ui> se replient ; ce choix est mémorisé sur l’appareil.</>,
          ]}
        />

        <GuideTopic
          title="Écrire la description"
          purpose="Rédiger la description d’un ticket comme une page, sans mode édition ni bouton d’enregistrement."
          steps={[
            <>Cliquez dans la description et écrivez : elle est toujours modifiable sur place. Vide, elle affiche <Ui>Écrivez, ou tapez « / » pour insérer un bloc…</Ui></>,
            <>L’enregistrement est automatique : après une courte pause de frappe, en quittant la description et à la fermeture du panneau. Sous le texte, l’état indique <Ui>Enregistrement…</Ui> puis <Ui>Enregistré</Ui>.</>,
            <>Tapez <Key>/</Key> en début de ligne ou après une espace pour insérer un bloc : <Ui>Texte</Ui>, <Ui>Titre 1</Ui>, <Ui>Titre 2</Ui>, <Ui>Titre 3</Ui>, <Ui>Liste à puces</Ui>, <Ui>Liste numérotée</Ui>, <Ui>Liste de tâches</Ui>, <Ui>Citation</Ui>, <Ui>Bloc de code</Ui>, <Ui>Séparateur</Ui>. Continuez à taper pour filtrer, <Key>↑</Key> / <Key>↓</Key> puis <Key>Entrée</Key> pour choisir, <Key>Échap</Key> pour fermer le menu.</>,
            <>Sélectionnez du texte pour faire apparaître la barre de mise en forme : <Ui>Gras</Ui>, <Ui>Italique</Ui>, <Ui>Barré</Ui>, <Ui>Code</Ui>, <Ui>Lien</Ui>.</>,
            <><Key>Échap</Key> quitte la description (et l’enregistre) ; un second <Key>Échap</Key> ferme le panneau.</>,
          ]}
        >
          <GuideNote>
            Si l’enregistrement échoue, le message <Ui>Échec de l’enregistrement</Ui> s’affiche et votre texte est conservé : cliquez sur <Ui>Réessayer</Ui>, y compris en revenant sur le ticket après avoir fermé le panneau ou changé d’onglet. Ce texte n’est gardé que dans la page ouverte : tant qu’il n’est pas enregistré, le navigateur demande confirmation avant de quitter ou de recharger la page, et la déconnexion demande <Ui>Se déconnecter quand même ?</Ui>. Sans droit de modification sur le ticket (rôle <Ui>Lecteur</Ui>, par exemple), la description s’affiche avec la même mise en forme, en lecture seule ; ses liens restent cliquables. Les enregistrements successifs d’une même séance d’écriture ne comptent que pour une seule entrée dans l’onglet <Ui>Activité</Ui>.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Mise en forme du texte"
          purpose="Rédiger commentaires et notes de release avec une mise en forme visible, sans écrire de Markdown."
          steps={[
            <>Barre <Ui>Mise en forme</Ui> (commentaires et notes de release) : <Ui>Titre 2</Ui>, <Ui>Titre 3</Ui>, <Ui>Gras</Ui>, <Ui>Italique</Ui>, <Ui>Barré</Ui>, <Ui>Code en ligne</Ui>, <Ui>Liste à puces</Ui>, <Ui>Liste numérotée</Ui>, <Ui>Liste de tâches</Ui>, <Ui>Citation</Ui>, <Ui>Bloc de code</Ui>, <Ui>Lien</Ui>, <Ui>Annuler la modification</Ui>, <Ui>Rétablir la modification</Ui>.</>,
            <>En tapant : <Key>##</Key> + espace (titre), <Key>-</Key> + espace (puce), <Key>1.</Key> + espace (liste numérotée), <Key>[ ]</Key> + espace (tâche), <Key>&gt;</Key> + espace (citation), <Key>**texte**</Key> (gras), <Key>`code`</Key>.</>,
            <><Ui>Lien</Ui> (ou <Key>⌘/Ctrl</Key> + <Key>K</Key> dans l’éditeur) : saisissez une <Ui>Adresse du lien</Ui> en http(s)://, mailto: ou relative, puis <Ui>Appliquer</Ui>.</>,
          ]}
        >
          <GuideNote>
            Un contenu que l’éditeur ne sait pas afficher (tableau, HTML, image, lien d’un autre type…) s’ouvre en Markdown brut, avec un avertissement, pour ne rien perdre. Pour une description dans ce cas, l’enregistrement n’est pas automatique : utilisez <Ui>Enregistrer</Ui> ou <Ui>Annuler</Ui> sous le texte.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Commentaires et activité"
          purpose="Échanger sur un ticket et retrouver qui a changé quoi."
          steps={[
            <>Section <Ui>Activité</Ui> du détail : la zone de commentaire est en tête (touche <Key>M</Key> pour y aller) ; écrivez avec la barre de mise en forme, tapez <Key>@</Key> pour mentionner quelqu’un, puis <Ui>Commenter</Ui> (ou <Key>⌘/Ctrl</Key> + <Key>Entrée</Key>).</>,
            <>Le fil mêle commentaires et historique ; filtrez avec <Ui>Tout</Ui>, <Ui>Commentaires</Ui> ou <Ui>Historique</Ui>, et inversez l’ordre avec <Ui>Plus récents</Ui> / <Ui>Plus anciens</Ui>.</>,
            <>L’historique montre l’ancienne et la nouvelle valeur (statut, parent, nature, priorité, assignation…) et les labels ajoutés ou retirés.</>,
            <>Vous pouvez modifier ou supprimer vos propres commentaires.</>,
          ]}
        >
          <GuideNote>Une mention envoie une notification à la personne mentionnée.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Liens entre tickets"
          purpose="Signaler une dépendance ou un doublon."
          steps={[
            <>Dans le détail, cliquez sur <Ui>Lier un item</Ui> (ou <Ui>+ Lier un item</Ui> dans la section <Ui>Items liés</Ui>), puis choisissez le <Ui>Type de relation</Ui> : Bloque, Est bloqué par, Lié à, Duplique, Est dupliqué par.</>,
            <>Cherchez le ticket dans <Ui>Rechercher un item…</Ui>, puis <Ui>Ajouter le lien</Ui>. Les liens s’affichent groupés par type.</>,
          ]}
        />

        <GuideTopic
          title="Liens GitHub"
          purpose="Rattacher une pull request, un commit ou une branche au ticket."
          steps={[
            <>Panneau <Ui>Développement</Ui> : <Ui>Lier une PR ou un commit</Ui>, collez l’URL GitHub, puis <Ui>Ajouter</Ui>.</>,
            <><Ui>Copier le nom de branche</Ui> copie un nom prêt à l’emploi, par exemple <code className="font-mono text-[0.9em]">cass-3-ecran-de-verification-du-code</code>, pour créer la branche vous-même.</>,
          ]}
        >
          <GuideNote>Saisie manuelle uniquement (adresses https://github.com) : aucune synchronisation automatique avec GitHub.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Actions groupées"
          purpose="Modifier plusieurs tickets d’un coup."
          steps={[
            <>En vue <Ui>Liste</Ui> ou <Ui>Backlog</Ui>, cochez les tickets (<Key>Maj</Key> + clic pour une plage, <Key>⌘/Ctrl</Key> + <Key>A</Key> pour tout).</>,
            <>Dans la barre <Ui>Actions groupées</Ui>, changez <Ui>Statut</Ui>, <Ui>Priorité</Ui>, <Ui>Assigné</Ui>, <Ui>Sprint</Ui>, les points ou les Fix versions.</>,
            <><Ui>Effacer la sélection</Ui> (ou <Key>Échap</Key>) pour terminer.</>,
          ]}
        >
          <GuideNote>500 tickets maximum. Sprint et points ne s’appliquent qu’aux tâches. Pas de suppression groupée.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Supprimer et restaurer (corbeille)"
          purpose="Retirer un ticket sans le perdre tout de suite."
          steps={[
            <>Dans le détail, menu « … » → <Ui>Supprimer l&apos;item</Ui> : le ticket et ses sous-items partent à la corbeille.</>,
            <>Ouvrez <Ui>Corbeille</Ui> (barre latérale) puis <Ui>Restaurer</Ui>, ou <Ui>Supprimer définitivement</Ui>.</>,
          ]}
        >
          <GuideNote>
            Restauration possible pendant 30 jours. Si le parent est aussi supprimé, restaurez-le d’abord. La
            suppression définitive est irréversible.
          </GuideNote>
        </GuideTopic>
      </GuideSection>

      <GuideSection id="sprints">
        <GuideTopic
          title="Créer et modifier un sprint"
          purpose="Préparer une période de travail de l’équipe."
          steps={[
            <>Vue <Ui>Backlog</Ui> → <Ui>Créer un sprint</Ui>, dans l’en-tête de la section Backlog : il est créé aussitôt (Sprint 1, Sprint 2…).</>,
            <>Dans l’en-tête du sprint, menu <Ui>⋯</Ui> → <Ui>Modifier</Ui> (ou lien <Ui>Ajouter des dates et un objectif</Ui>) pour changer <Ui>Nom</Ui>, <Ui>Objectif</Ui>, <Ui>Début prévu</Ui>, <Ui>Fin prévue</Ui> et <Ui>Capacité (points)</Ui>. Une date suffit : l’heure est facultative (9 h pour le début, 18 h pour la fin par défaut).</>,
            <>Menu <Ui>⋯</Ui> → <Ui>Monter</Ui> ou <Ui>Descendre</Ui> pour réordonner les sprints planifiés.</>,
          ]}
        />

        <GuideTopic
          title="Planifier et estimer"
          purpose="Choisir les tâches du sprint et mesurer la charge."
          steps={[
            <>Glissez les tâches de la section Backlog vers le sprint (ou action groupée <Ui>Sprint</Ui>). Un sprint vide affiche la zone « Glissez des items du backlog ici pour planifier le sprint ».</>,
            <>Estimez chaque tâche en cliquant sur ses points dans la ligne (au survol si elle n’est pas encore estimée).</>,
            <>L’en-tête du sprint affiche les points par statut (À faire, En cours, Terminé), le nombre d’items et de non estimés, la capacité et un éventuel dépassement.</>,
          ]}
        >
          <GuideNote>
            Seules les tâches entrent dans un sprint. L’en-tête compare l’engagement à la moyenne des 5 derniers
            sprints clôturés ; un dépassement est un avertissement, pas un blocage.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Démarrer et suivre"
          purpose="Lancer le sprint et suivre son avancement au quotidien."
          steps={[
            <>Sur un sprint planifié, cliquez sur <Ui>Démarrer le sprint</Ui>.</>,
            <>Vérifiez <Ui>Nom</Ui>, <Ui>Début</Ui> et <Ui>Fin</Ui> (obligatoires), puis <Ui>Confirmer le démarrage</Ui>. Sans dates prévues, le début est proposé à maintenant et la fin deux semaines plus tard ; l’heure reste facultative.</>,
            <>Le <Ui>Board</Ui> affiche alors le sprint actif : déplacez les cartes de colonne en colonne.</>,
          ]}
        >
          <GuideNote>Un seul sprint actif par backlog. L’engagement est figé au démarrage pour les rapports.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Terminer un sprint"
          purpose="Terminer le sprint et décider du sort des tâches inachevées."
          steps={[
            <>Sur le sprint actif, cliquez sur <Ui>Terminer le sprint</Ui>.</>,
            <>Choisissez la <Ui>Destination des tâches incomplètes</Ui> : <Ui>Backlog</Ui>, un sprint planifié ou <Ui>Nouveau sprint</Ui>.</>,
            <>Confirmez avec le bouton <Ui>Terminer le sprint</Ui> de la fenêtre.</>,
          ]}
        >
          <GuideNote>
            Les sous-tâches doivent être terminées avant la fin du sprint. Un sprint ne se supprime pas.
            Un sprint terminé disparaît du Backlog et du Board ; pour retrouver ses tickets, ouvrez
            {" "}<Ui>Rapports</Ui> → <Ui>Rapport de sprint</Ui>, ou filtrez la <Ui>Liste</Ui> ou l’<Ui>Arbre</Ui>
            {" "}avec <Ui>+ Filtre</Ui> → <Ui>Sprint</Ui>.
          </GuideNote>
        </GuideTopic>
      </GuideSection>

      <GuideSection id="releases">
        <GuideTopic
          title="Créer une version"
          purpose="Planifier une livraison et suivre sa progression."
          steps={[
            <>Barre latérale → <Ui>Releases</Ui> → <Ui>Créer une version</Ui>.</>,
            <>Renseignez <Ui>Nom</Ui> (obligatoire), <Ui>Description</Ui>, <Ui>Date de début</Ui>, <Ui>Date cible</Ui>, <Ui>Pilote</Ui>, puis <Ui>Créer</Ui>.</>,
          ]}
        />

        <GuideTopic
          title="Affecter des tickets"
          purpose="Dire dans quelle version un ticket sera livré."
          steps={[
            <>Dans le détail ou à la création, renseignez <Ui>Fix versions</Ui> (plusieurs possibles).</>,
            <>Pour plusieurs tickets : action groupée Fix versions (ajouter, remplacer, retirer).</>,
          ]}
        >
          <GuideNote>Une version archivée ne peut plus être choisie.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Publier"
          purpose="Marquer la version comme livrée et conserver un instantané de son contenu à la publication. Le périmètre courant peut encore évoluer."
          steps={[
            <>Cliquez sur <Ui>Publier</Ui> et indiquez la <Ui>Date de publication</Ui>.</>,
            <>S’il reste des tickets non terminés : <Ui>Conserver dans cette version</Ui> ou <Ui>Déplacer vers une autre version</Ui>.</>,
          ]}
        >
          <GuideNote>
            La publication enregistre un <Ui>Instantané de publication</Ui> visible dans le détail de la version.
            <Ui>Annuler la publication</Ui> reste possible ; l’instantané demeure dans l’historique.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Ranger les versions"
          purpose="Garder une liste de versions claire."
          steps={[
            <>Réordonnez avec la poignée ou <Ui>Monter</Ui> / <Ui>Descendre</Ui>.</>,
            <><Ui>Archiver</Ui> masque la version (réversible avec <Ui>Désarchiver</Ui>).</>,
            <><Ui>Fusionner</Ui> transfère les tickets vers une autre version, puis supprime celle-ci.</>,
            <><Ui>Supprimer</Ui> : choisissez <Ui>Transférer vers une autre version</Ui> ou <Ui>Retirer la version des éléments</Ui>.</>,
          ]}
        />

        <GuideTopic
          title="Notes de release"
          purpose="Produire le texte de livraison à partir des tickets de la version."
          steps={[
            <>Dans le détail de la version, ouvrez <Ui>Notes de release</Ui>.</>,
            <>Ajustez le texte dans l’éditeur mis en forme (aperçu à côté), puis <Ui>Copier le Markdown</Ui>, <Ui>Copier le HTML</Ui>, <Ui>Télécharger .md</Ui> ou <Ui>Télécharger .html</Ui>.</>,
          ]}
        >
          <GuideNote>Les modifications des notes ne sont pas enregistrées dans Jiroo : copiez ou téléchargez le résultat.</GuideNote>
        </GuideTopic>
      </GuideSection>

      <GuideSection id="rapports">
        <GuideTopic
          title="Ouvrir un rapport"
          purpose="Mesurer ce qui a été engagé et livré."
          steps={[
            <>Barre latérale → <Ui>Rapports</Ui>, puis <Ui>Rapport de sprint</Ui>, <Ui>Vélocité</Ui> ou <Ui>Burndown</Ui>.</>,
            <>Pour <Ui>Rapport de sprint</Ui> et <Ui>Burndown</Ui>, choisissez le <Ui>Sprint</Ui> puis <Ui>Afficher</Ui>. Pour <Ui>Vélocité</Ui>, choisissez <Ui>7 sprints</Ui> ou <Ui>12 sprints</Ui>.</>,
          ]}
        >
          <GuideNote>
            <Ui>Données en cours</Ui> : sprint actif. <Ui>Historique figé</Ui> : sprint clôturé, les chiffres ne bougent plus.
          </GuideNote>
        </GuideTopic>

        <GuideTopic title="Lire les rapports" purpose="Savoir ce que montre chaque rapport.">
          <ul className="t-body list-disc space-y-1 pl-5">
            <li><Ui>Rapport de sprint</Ui> : engagement au démarrage, terminés, périmètre, tickets ajoutés ou retirés après le démarrage, journal du sprint.</li>
            <li><Ui>Vélocité</Ui> : engagement et points terminés des derniers sprints (7 ou 12), avec la moyenne.</li>
            <li><Ui>Burndown</Ui> : travail restant jour après jour face à une trajectoire idéale ; compare l’engagement au démarrage à la moyenne des sprints précédents.</li>
          </ul>
          <GuideNote>La trajectoire idéale exige une date de fin ; c’est un repère, pas une garantie de livraison.</GuideNote>
        </GuideTopic>
      </GuideSection>

      <GuideSection id="recherche">
        <GuideTopic
          title="Rechercher"
          purpose="Retrouver un ticket dans tous vos backlogs."
          steps={[
            <>Cliquez sur le champ <Ui>Rechercher un item…</Ui> au centre de la barre du haut (ou <Key>⌘/Ctrl</Key> + <Key>K</Key>, ou <Key>/</Key>).</>,
            <>Tapez un mot du titre ou de la description, ou une clé (ex. CASS-39).</>,
            <>Naviguez avec <Key>↑</Key> <Key>↓</Key> et ouvrez avec <Key>Entrée</Key>.</>,
          ]}
        >
          <GuideNote>Champ vide : vos tickets récents. Les tickets supprimés n’apparaissent pas.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Notifications"
          purpose="Savoir quand quelqu’un vous mentionne."
          steps={[
            <>La cloche affiche le nombre de notifications non lues.</>,
            <>Cliquez sur une notification pour ouvrir le ticket ; <Ui>Tout marquer comme lu</Ui> pour vider le compteur.</>,
          ]}
        >
          <GuideNote>Seules les mentions (@) dans les commentaires génèrent une notification.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Raccourcis clavier"
          purpose="Aller plus vite sans la souris, avec les touches de Jira."
          steps={[
            <>Appuyez sur <Key>?</Key> (hors saisie) pour afficher la fenêtre <Ui>Raccourcis clavier</Ui> ; <Key>Échap</Key> la ferme.</>,
            <>Pour <Key>G</Key> puis une lettre, tapez les deux touches à moins d’une seconde d’intervalle. Hors d’un backlog, le dernier backlog consulté est utilisé.</>,
            <>Dans une vue, <Key>J</Key> et <Key>K</Key> sélectionnent le ticket suivant ou précédent ; <Key>O</Key> ou <Key>Entrée</Key> l’ouvre.</>,
            <>Pour désactiver les raccourcis à une touche, décochez <Ui>Raccourcis à une touche</Ui> dans la fenêtre <Ui>Raccourcis clavier</Ui> ou dans <Ui>Préférences</Ui> (menu de votre profil). Ce choix est conservé sur cet appareil.</>,
          ]}
        >
          <GuideNote>
            Les raccourcis à une touche sont sans effet pendant la saisie dans un champ, dans une autre fenêtre ou un menu ouvert, et quand une action ne vous est pas permise (par exemple <Key>I</Key> sans le droit d’assigner).
          </GuideNote>
          <ShortcutList headingLevel={4} idPrefix="guide-shortcuts" />
        </GuideTopic>
      </GuideSection>

      <GuideSection id="droits">
        <GuideTopic
          title="Rôles dans un backlog"
          purpose="Ce que chacun peut faire dépend de son rôle dans chaque backlog."
        >
          <p className="t-body">Dans la configuration par défaut :</p>
          <ul className="t-body list-disc space-y-1 pl-5">
            <li><Ui>Lecteur</Ui> : consulte le backlog, sans rien modifier.</li>
            <li><Ui>Membre</Ui> : crée, modifie, change le statut, planifie et assigne les tickets ; commente ; crée des liens.</li>
            <li><Ui>Administrateur</Ui> : tout ce que fait un membre, plus supprimer et restaurer, gérer sprints, releases, statuts, membres et vues partagées.</li>
          </ul>
          <GuideNote>
            Les droits s’additionnent (utilisateur, groupes, rôles) et peuvent être ajustés par backlog. Les actions
            disponibles dépendent de vos droits et de l&apos;état de l&apos;élément.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Administration (administrateurs)"
          purpose="Gérer comptes, groupes, backlogs et accès."
          steps={[
            <>Barre latérale → <Ui>Administration</Ui> (visible seulement si vous avez un droit d’administration ; chaque onglet dépend de vos permissions).</>,
            <><Ui>Utilisateurs</Ui> : <Ui>Nouvel utilisateur</Ui> ; menu « … » → <Ui>Réinitialiser le mot de passe</Ui> ou <Ui>Réinitialiser la double authentification</Ui>.</>,
            <><Ui>Groupes</Ui> : créer, renommer, ajouter ou retirer des membres ; attribuer les permissions globales.</>,
            <><Ui>Backlogs</Ui> : <Ui>Nouveau backlog</Ui>, <Ui>Modifier</Ui>, <Ui>Archiver</Ui>, et <Ui>Accès</Ui> pour affecter personnes et groupes aux rôles.</>,
            <><Ui>Backlogs</Ui> → <Ui>Modifier</Ui> → <Ui>Responsable</Ui> : choisissez la personne affichée comme responsable sur l’accueil, ou <Ui>Aucun</Ui>. Ce champ ne donne aucun droit ; il n’apparaît qu’avec la permission de parcourir les utilisateurs.</>,
            <><Ui>Rôles de projet</Ui> et <Ui>Schémas de permissions</Ui> : réglages fins des accès.</>,
          ]}
        >
          <GuideNote>
            La récupération des accès (mot de passe, double authentification) et l’attribution de permissions
            globales sont réservées aux administrateurs de Jiroo ; la récupération concerne un autre compte que le
            vôtre. Les accès dépendent des permissions du backlog : elles peuvent être attribuées à une personne, à
            un groupe, à un rôle ou à tous les utilisateurs connectés. Vérifiez les accès avant de créer un compte de
            test. Pas de désactivation de compte dans l’interface.
          </GuideNote>
        </GuideTopic>
      </GuideSection>

      <GuideSection id="recette">
        <GuideTopic
          title="Données fictives uniquement"
          purpose="Cet environnement sert à tester Jiroo, pas à travailler sur de vrais dossiers."
        >
          <GuideNote>
            N’y saisissez aucune donnée réelle ou confidentielle : noms, dossiers et contenus doivent être inventés.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Remonter un retour"
          purpose="Signaler un bug ou proposer une amélioration pendant les tests."
          steps={[
            <>Si l’administrateur a créé un backlog « Recette », ouvrez-le avec le sélecteur de backlog.</>,
            <>Créez un ticket avec le modèle <Ui>Rapport de bug</Ui> (ou <Ui>User story</Ui> pour une idée).</>,
            <>Décrivez les étapes, le résultat attendu et le résultat observé.</>,
            <>À défaut de backlog « Recette », transmettez votre retour directement à l’administrateur.</>,
          ]}
        />
      </GuideSection>
    </div>
  );
}
