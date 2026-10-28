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
          purpose="Accéder à Jiroo avec le compte créé par un administrateur Jiroo."
          steps={[
            <>Saisissez votre <Ui>E-mail</Ui> et votre <Ui>Mot de passe</Ui>, puis cliquez sur <Ui>Se connecter</Ui>.</>,
            <>Saisissez le code à 6 chiffres de votre application d’authentification, puis <Ui>Vérifier</Ui>.</>,
          ]}
        >
          <GuideNote>
            Pas d’inscription libre ni de mot de passe oublié en libre-service : une personne autorisée crée les comptes
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
            <>Mettez les <Ui>Codes de récupération — conservez-les</Ui> en lieu sûr : <Ui>Copier les codes</Ui> (par exemple vers un gestionnaire de mots de passe) ou <Ui>Télécharger (.txt)</Ui>.</>,
            <>Cochez la case obligatoire <Ui>J&apos;ai enregistré mes codes de récupération</Ui> : sans elle, <Ui>Activer et continuer</Ui> affiche un message sous la case.</>,
            <>Saisissez le code affiché par l’application et cliquez sur <Ui>Activer et continuer</Ui>.</>,
          ]}
        >
          <GuideNote>
            Les codes de récupération ne sont affichés qu’une seule fois. Chacun remplace le code à 6 chiffres :
            sur l’écran de vérification, choisissez <Ui>Utiliser un code de récupération</Ui>. Ne partagez ni ces
            codes ni la clé manuelle (pas de capture d’écran envoyée) : ils donnent accès à votre compte. La copie et
            le fichier sont produits dans votre navigateur ; Jiroo ne les conserve pas.
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
            <>Sinon, demandez à un administrateur Jiroo de <Ui>Réinitialiser la double authentification</Ui> de votre compte.</>,
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
            <>Dans la section <Ui>Filtres</Ui> de la barre latérale, <Ui>Tous les items</Ui> affiche la liste de tous les tickets du backlog courant, sans filtre (vue <Ui>Liste</Ui> ; le compteur en donne le nombre) ; <Ui>Mes items</Ui> liste les tickets qui vous sont assignés, tous backlogs confondus ; <Ui>Absences et congés</Ui> ouvre le tableau des absences et du travail de l’équipe dans le temps (voir la section Le point).</>,
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

      <GuideSection id="le-point">
        <GuideTopic
          title="Comprendre où tu en es"
          purpose="En ouvrant Le point, tu vois où en est toute l’équipe et quoi faire ensuite, sans parcourir le tableau."
          steps={[
            <>Choisis ton projet avec le sélecteur de la barre latérale.</>,
            <>Ouvre <Ui>Le point</Ui>, la première des vues du projet, au-dessus de <Ui>Backlog</Ui>.</>,
            <>En haut, <Ui>Santé du sprint</Ui> dit en un mot où en est le sprint, le montre sur une barre avec le trait « aujourd’hui », dit s’il peut finir à temps, et donne quatre chiffres : terminés, bloqués, ajoutés, jours restants. L’objectif du sprint est rappelé sous le verdict ; un clic sur les ajoutés ouvre le périmètre, l’engagement de départ face à la vélocité moyenne et chaque ticket ajouté ou retiré, daté et signé. Le petit <Ui>i</Ui> explique le calcul.</>,
            <>Dessous, <Ui>Charge par personne</Ui> donne une pastille par personne, avec la couleur de sa situation et ses tickets ouverts. Les membres sans ticket apparaissent avec « rien d’assigné », les personnes absentes avec « en congé jusqu’au… » : depuis sa pastille, chacun déclare ses absences, en demi-journées (matin, après-midi), et un administrateur du backlog celles des membres ; ces demi-journées ne comptent ni dans l’inactivité ni dans les jours-personne du sprint, et les jours ouvrés excluent les week-ends et les jours fériés français. Clique dessus pour voir ses tickets ; <Ui>Voir dans la Liste</Ui> ouvre la Liste filtrée sur elle, <Ui>Tout voir</Ui> affiche le tableau complet. Cette carte est la même pour tout le monde.</>,
            <>Par défaut, la page montre <Ui>Toute l’équipe</Ui>. Choisis <Ui>Moi</Ui> dans la barre sous le titre pour ne garder que tes tickets et les décisions qu’on te demande ; ton choix est mémorisé sur ton appareil.</>,
          ]}
        />
        <GuideTopic
          title="Choisir ta perspective"
          purpose="Retrouver les informations utiles à ce que tu fais sur le projet."
          steps={[
            <>Choisis <Ui>Développement</Ui> pour voir ce qui est en cours, ce qui bloque, ce qui arrive ensuite et ce qui a changé depuis ta dernière visite. Pour toute l’équipe, chaque ligne nomme qui tient le ticket.</>,
            <>Choisis <Ui>Produit</Ui> pour retrouver les décisions demandées par une mention (à qui, pour toute l’équipe), l’avancement des objectifs (epics), ce qui les met en difficulté et la prochaine livraison (release).</>,
          ]}
        >
          <GuideNote>
            Le choix de la perspective ou de la portée ne change aucun droit. La page est en lecture seule : elle ne modifie rien dans le projet. Comme sur les autres vues, <Ui>+ Créer</Ui> reste en haut à droite pour ajouter un ticket.
          </GuideNote>
        </GuideTopic>
        <GuideTopic
          title="Lire une ligne et ouvrir un ticket"
          purpose="Savoir pourquoi un ticket apparaît et l’ouvrir pour agir."
          steps={[
            <>Regarde d’abord les quatre chiffres en haut : chacun mène à sa section.</>,
            <>Lis l’étiquette en fin de ligne : elle dit pourquoi le ticket est là (« En retard de 2 jours », « Attend PORT-84 », « Demandé par Leo R. »). Survole-la pour la phrase complète.</>,
            <>Clique sur une ligne pour ouvrir le ticket dans son panneau habituel, sans quitter Le point, et agir dessus selon tes droits.</>,
          ]}
        >
          <GuideNote>
            C’est un pilote. <Ui>Depuis ta dernière visite</Ui> est mémorisé sur ton appareil.
            La première fois, tu vois les 7 derniers jours.
          </GuideNote>
        </GuideTopic>
        <GuideTopic
          title="Déclarer les absences et voir le travail dans le temps"
          purpose="Savoir qui est là, qui ne l’est pas, et ce que chaque développeur a en cours ou a terminé, jour par jour."
          steps={[
            <>Ouvre <Ui>Absences et congés</Ui> dans la barre latérale (ou depuis la carte de Le point). La page montre tous les backlogs que tu peux consulter ; le sélecteur en tête la limite à un backlog, qui affiche alors ses sprints et la vue <Ui>Sprint</Ui>. <Ui>Mois</Ui> et <Ui>Année</Ui> valent pour toute portée.</>,
            <>Chaque ligne est une personne, Développement puis Produit ; chaque case un jour, en deux demi-journées (matin à gauche, après-midi à droite). Les week-ends et les jours fériés français sont grisés et ne comptent jamais.</>,
            <>Pour déclarer une absence, clique une demi-case et glisse jusqu’à la dernière, puis <Ui>Enregistrer</Ui>, ou ouvre <Ui>Déclarer une absence</Ui> pour saisir la personne et les demi-journées au clavier ; les cases absentes passent en rouge, hachurées tant qu’elles sont à venir. Un clic sur une case rouge retire la demi-journée, la journée ou toute l’absence ; glisser sur des cases rouges retire la sélection. Chacun déclare les siennes ; un administrateur d’un backlog, celles de ses membres.</>,
            <>Sous les demi-cases, les barres sont les tickets d’un développeur, du jour où ils passent « En cours » (bleu) au jour « Terminé » (vert). Clique une case pour les tickets du jour, un nom pour ceux de la période, un sprint pour tous les tickets du sprint : ils s’affichent comme dans la Liste et s’ouvrent au clic. « Dates approximatives » signale un journal incomplet.</>,
            <><Ui>Exporter la période</Ui> et <Ui>Exporter les absences</Ui> donnent deux fichiers CSV qu’Excel ouvre tels quels. Le petit <Ui>i</Ui> rappelle les règles, les mêmes que dans Le point et le Bilan des sprints.</>,
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
            <li><Ui>Board</Ui> : les tâches du sprint actif, une colonne par statut ; déplacer une carte change son statut. Sans sprint actif, le bandeau <Ui>Aucun sprint actif</Ui> et son lien <Ui>Voir le Backlog</Ui> surmontent les colonnes, vides et sans glisser-déposer.</li>
            <li><Ui>Liste</Ui> : tous les tickets, à plat, dans le même tableau que le Backlog, intitulé <Ui>Tous les items</Ui> (nombre d’items et de non estimés, points par statut, <Ui>Créer un item</Ui> en bas) ; la ligne <Ui>Trier</Ui> de son en-tête pour trier, le menu <Ui>Colonnes</Ui> pour afficher des informations en plus. Groupée (<Ui>Affichage</Ui>), elle montre un tableau par groupe, repliable comme les sections du Backlog.</li>
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
          <p className="t-body">
            La même ligne présente les tickets partout où ils sont listés : <Ui>Liste</Ui>, <Ui>Mes items</Ui>,{" "}
            <Ui>Corbeille</Ui> (avec la date de suppression et <Ui>Restaurer</Ui>), périmètre d’une release,
            sections du rapport de sprint, enfants et items liés du panneau de détail. Hors du Backlog, elle n’a pas
            de poignée ; hors du Backlog et de la Liste, elle se lit sans modification sur place.
          </p>
          <p className="t-body">
            Sauf dans le panneau de détail, ces lignes sont aussi rangées dans le même tableau que les sections du
            Backlog : un cadre dont l’en-tête donne le nom (le backlog pour <Ui>Mes items</Ui> et la{" "}
            <Ui>Corbeille</Ui>), le nombre d’items et, quand les tickets ont des points, le nombre de non estimés et
            les points par statut. La flèche à gauche du nom replie ou déplie le tableau.
          </p>
        </GuideTopic>

        <GuideTopic
          title="Trier la Liste et choisir ses colonnes"
          purpose="Ranger tous les tickets selon un critère et n’afficher que l’utile."
          steps={[
            <>Dans la ligne <Ui>Trier</Ui> de l’en-tête du tableau (du premier tableau quand la Liste est groupée), cliquez sur <Ui>Clé</Ui>, <Ui>Titre</Ui>, <Ui>Échéance</Ui>, <Ui>Priorité</Ui> ou <Ui>Statut</Ui> : un premier clic trie par ordre croissant (▲), un second par ordre décroissant (▼) ; le critère actif est mis en évidence (au clavier : <Key>Tab</Key> jusqu’au bouton, puis <Key>Entrée</Key>).</>,
            <>Ouvrez <Ui>Colonnes</Ui>, à côté d’<Ui>Affichage</Ui>, et cochez <Ui>Labels</Ui>, <Ui>Échéance</Ui> ou <Ui>Fix versions</Ui> : chaque information cochée s’ajoute en pastille au bout des lignes.</>,
          ]}
        >
          <GuideNote>
            La Liste est plate : le parent d’un ticket figure en pastille, la hiérarchie se lit dans l’<Ui>Arbre</Ui>.
            Le tri et les colonnes restent dans l’adresse de la page et sont enregistrés avec une vue.
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
          title="Démarrer dans un nouveau backlog"
          purpose="Savoir par où commencer quand le backlog est vide : une Tâche se rattache toujours à une Epic, elle-même rangée dans un Composant."
          steps={[
            <>Créez d’abord un Composant (un domaine ou un produit). Dans un backlog vide, les vues Backlog, Liste et Arbre affichent <Ui>Commencez par créer un Composant (un domaine ou un produit)</Ui> : cliquez sur <Ui>Nouveau Composant</Ui> (ou sur <Ui>+ Créer</Ui>, type <Ui>Composant</Ui>), saisissez le <Ui>Titre</Ui>, puis <Ui>Créer</Ui>.</>,
            <>Créez ensuite une Epic dans ce Composant. Le message devient <Ui>Créez une Epic dans un Composant</Ui> : cliquez sur <Ui>Nouvelle Epic</Ui>. La fenêtre <Ui>Nouvel item</Ui> s’ouvre avec le type <Ui>Epic</Ui> ; s’il n’y a qu’un Composant, il est déjà choisi comme <Ui>Parent</Ui>.</>,
            <>Ajoutez enfin vos tâches. Dans le Backlog, <Ui>Créer un item</Ui> revient en bas des sections, avec la première Epic proposée comme <Ui>Epic parent</Ui> ; ailleurs, utilisez <Ui>+ Créer</Ui> avec le type <Ui>Tâche</Ui>.</>,
            <>Vous avez commencé par <Ui>+ Créer</Ui> (ou <Key>C</Key>) avec le type <Ui>Epic</Ui> alors qu’aucun Composant n’existe ? Sous <Ui>Parent</Ui>, cliquez sur <Ui>Créer un Composant</Ui> : la même fenêtre passe au type <Ui>Composant</Ui> en gardant le titre et la description saisis. Créez-le, puis rouvrez <Ui>+ Créer</Ui> pour votre Epic : le Composant est proposé comme <Ui>Parent</Ui>. De même, <Ui>Créer une Epic</Ui> pour une Tâche et <Ui>Créer une Tâche</Ui> pour une Sous-tâche.</>,
          ]}
        >
          <GuideNote>
            Pourquoi cet ordre : la hiérarchie est fixe. Une Tâche a toujours une Epic pour parent, et une Epic un
            Composant. Tant qu’aucune Epic n’existe, le Backlog remplace <Ui>Créer un item</Ui> par le bouton de
            l’étape manquante ; sous des filtres actifs, il propose <Ui>Effacer les filtres</Ui> pour y accéder.
            Créer une Epic demande le droit de planifier ; sans le droit nécessaire, les vues
            indiquent seulement <Ui>Ce backlog est vide</Ui> ou <Ui>Aucune Epic pour l’instant</Ui>. Sous un filtre
            Version, <Ui>Nouvel item</Ui> et <Ui>Créer un item</Ui> proposent tous les parents du backlog, même
            ceux que le filtre masque. Un ticket créé sans cette version n’apparaît pas dans la vue filtrée : le
            message « CASS-7 créé — masqué par les filtres de la vue. » le signale, avec <Ui>Ouvrir</Ui> pour
            l’afficher ; effacez le filtre (ou ajoutez la version dans <Ui>Fix versions</Ui>) pour le voir dans
            la liste.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Créer un ticket"
          purpose="Ajouter un Composant, une Epic, une Tâche ou une Sous-tâche."
          steps={[
            <>Sur toutes les pages d’un backlog (vues, Roadmap, Releases, Rapports, Paramètres), cliquez sur <Ui>+ Créer</Ui> dans la barre du haut, à côté du champ de recherche (ou touche <Key>C</Key>) : la fenêtre <Ui>Nouvel item</Ui> s’ouvre, avec la clé du backlog dans sa couleur. Sur le Board, le ticket rejoint le sprint actif ; sans sprint actif, il va dans le backlog. Dans le Backlog, utilisez aussi <Ui>Créer un item</Ui> en bas d’une section (voir ci-dessous). Depuis le détail d’un ticket, <Ui>+ Créer une tâche</Ui> (ou une sous-tâche, un epic) préremplit le type et le parent.</>,
            <>Choisissez le <Ui>Type</Ui> (et un <Ui>Modèle</Ui> si besoin), puis, sauf pour un Composant, le <Ui>Parent</Ui> obligatoire (marqué d’un astérisque ; une Epic se rattache à un Composant, une Tâche à une Epic, une Sous-tâche à une Tâche) ; saisissez le <Ui>Titre</Ui> et la <Ui>Description</Ui> dans l’éditeur mis en forme. Si le backlog n’a encore aucun parent possible, le champ <Ui>Parent</Ui> propose de le créer d’abord (voir « Démarrer dans un nouveau backlog »).</>,
            <>Dans <Ui>Modèle</Ui>, retrouvez les modèles fixes <Ui>Rapport de bug</Ui> et <Ui>User story</Ui>, puis les <Ui>Modèles du backlog</Ui>. Un modèle partagé préremplit le type (si autorisé dans ce contexte), la nature, le titre, la description, la priorité et les labels. Tout reste modifiable avant de créer ; <Ui>Aucun</Ui> retire le préremplissage.</>,
            <>Dans <Ui>Détails</Ui>, ajustez <Ui>Statut</Ui> (il affiche le statut que recevra le ticket, le premier statut « À faire » par défaut), <Ui>Assigné</Ui> (ou <Ui>M’assigner</Ui>, à droite du champ), <Ui>Priorité</Ui>, <Ui>Points</Ui> et <Ui>Sprint</Ui> (tâches), <Ui>Nature</Ui>, <Ui>Labels</Ui>, <Ui>Fix versions</Ui>, <Ui>Échéance</Ui>, puis <Ui>Créer</Ui>.</>,
            <>Sans parent choisi, <Ui>Créer</Ui> ne crée rien : le message « Parent obligatoire : choisissez une Epic. » apparaît sous le champ <Ui>Parent</Ui>, qui reçoit le focus. Il disparaît dès que vous choisissez le parent.</>,
            <>Cochez <Ui>Créer un autre</Ui> pour enchaîner : la fenêtre reste ouverte avec le même type, le même parent et le même sprint ; seuls le titre et la description sont vidés.</>,
          ]}
        >
          <GuideNote>
            Si un label du modèle a été supprimé, il est ignoré et la fenêtre le signale. Le modèle ne fixe ni parent, ni assigné, ni statut, ni sprint, ni dates, ni Fix versions, ni points.
            <br />
            Après la création, le message « CASS-7 créé » propose <Ui>Ouvrir</Ui> (affiche le ticket) et <Ui>Annuler</Ui>. Si les filtres de la vue écartent le nouveau ticket, il devient « CASS-7 créé — masqué par les filtres de la vue. ». Les champs absents de la fenêtre dépendent de vos droits (assignation, planification).
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Créer une tâche depuis le Backlog"
          purpose="Ajouter vite une tâche dans un sprint ou dans la section Backlog."
          steps={[
            <>En bas du sprint ou de la section Backlog, cliquez sur <Ui>Créer un item</Ui>.</>,
            <>Saisissez le titre, choisissez l’<Ui>Epic parent</Ui> (la dernière utilisée est proposée), puis <Key>Entrée</Key>. Sans epic choisie, « Choisissez l’epic parent. » s’affiche et le champ <Ui>Epic parent</Ui> reçoit le focus.</>,
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
            <>En-tête : le fil d’Ariane affiche la clé et le titre du parent (titre complet au survol) et mène à lui ; <Ui>Copier le lien</Ui> copie une adresse qui rouvre ce ticket ; <Ui>Plus d’actions</Ui> permet de supprimer ; <Ui>Item précédent (K)</Ui> et <Ui>Item suivant (J)</Ui> parcourent les tickets dans l’ordre de la vue affichée derrière ; <Ui>Fermer (Échap)</Ui>.</>,
            <>Cliquez sur le titre pour le renommer. Description : écrivez directement dedans, comme sur une page (voir <Ui>Écrire la description</Ui> ci-dessous).</>,
            <>Sous la description, la section des enfants (<Ui>Epics</Ui>, <Ui>Tâches</Ui> ou <Ui>Sous-tâches</Ui>) liste les tickets rattachés avec leur statut ; <Ui>+ Créer…</Ui> en ajoute un.</>,
            <>À droite, le bouton de statut change le statut ; le bouton voisin (par exemple <Ui>En cours →</Ui>) passe directement au statut suivant du flux.</>,
            <>Panneau <Ui>Détails</Ui> : cliquez sur une valeur (<Ui>Assigné</Ui>, <Ui>Priorité</Ui>, <Ui>Début</Ui>, <Ui>Échéance</Ui>…) pour la modifier ; <Ui>M’assigner</Ui> vous attribue le ticket. Les panneaux <Ui>Détails</Ui> et <Ui>Développement</Ui> se replient ; ce choix est mémorisé sur l’appareil.</>,
            <>Sans la permission globale <Ui>Parcourir les utilisateurs</Ui>, le champ <Ui>Assigné</Ui> explique pourquoi la liste est restreinte et invite à contacter un administrateur Jiroo, y compris à la création et dans les menus en ligne.</>,
            <>La date <Ui>Début</Ui> est facultative et sert à planifier le ticket dans la vue Roadmap ; elle doit précéder l’<Ui>Échéance</Ui> ou lui être égale si celle-ci est renseignée.</>,
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
            <>Dans <Ui>Liens web</Ui>, cliquez sur <Ui>Ajouter un lien web</Ui> pour rattacher une maquette Figma, une spec ou un document : saisissez une URL http ou https et un <Ui>Texte affiché</Ui> facultatif, puis <Ui>Ajouter</Ui>. Le lien s’ouvre dans un nouvel onglet ; le bouton de suppression apparaît au survol ou au focus.</>,
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
          <GuideNote>Le lien manuel accepte les adresses https://github.com. Pour que les références arrivent seules, connectez le dépôt (rubrique suivante).</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Connecter un dépôt GitHub ou GitLab"
          purpose="Voir sur chaque ticket, sans rien coller, les branches, commits et pull / merge requests qui citent sa clé."
          steps={[
            <>Administrateur du backlog : <Ui>Administration</Ui> → <Ui>Backlogs</Ui> → <Ui>Développement</Ui> (ou l’onglet <Ui>Développement</Ui> à côté d’<Ui>Accès</Ui>), puis <Ui>Connecter un dépôt</Ui>.</>,
            <>Sans référence détectée, le panneau <Ui>Développement</Ui> du ticket explique comment utiliser sa clé pour la liaison automatique et indique si un dépôt est connecté ; quand aucun ne l’est, les administrateurs du backlog y trouvent le lien <Ui>Connecter un dépôt</Ui>.</>,
            <>Choisissez la forge (<Ui>GitHub</Ui> ou <Ui>GitLab</Ui>), saisissez le dépôt (<code className="font-mono text-[0.9em]">propriétaire/dépôt</code>) ou le chemin du projet GitLab, et l’<Ui>URL de l’instance GitLab</Ui> si elle n’est pas gitlab.com, puis <Ui>Connecter le dépôt</Ui>.</>,
            <>Copiez l’<Ui>URL du webhook</Ui> et le <Ui>Secret du webhook</Ui> : le secret n’est affiché qu’une fois. Créez le webhook dans la forge en suivant les étapes affichées (GitHub : format JSON, événements Pushes, Pull requests et Branch or tag creation ; GitLab : jeton secret, Push events et Merge request events), puis <Ui>J’ai copié le secret</Ui>.</>,
            <>Nommez vos branches, commits et pull / merge requests avec la clé du ticket, par exemple <code className="font-mono text-[0.9em]">cass-12-formulaire</code> ou « CASS-12 Ajoute le formulaire » : ils apparaissent dans le panneau <Ui>Développement</Ui> du ticket, groupés en pull requests (avec leur état : <Ui>Ouverte</Ui>, <Ui>Fusionnée</Ui>, <Ui>Fermée</Ui>), branches et commits (les plus récents d’abord, <Ui>Voir tout</Ui> pour la suite).</>,
            <>Sur la page <Ui>Développement</Ui>, chaque dépôt affiche son dernier événement et sa dernière erreur. <Ui>Régénérer le secret</Ui> refuse aussitôt l’ancien ; <Ui>Désactiver</Ui> suspend la réception ; <Ui>Supprimer</Ui> retire la connexion.</>,
          ]}
        >
          <GuideNote>
            Jiroo ne fait que recevoir les webhooks : aucun jeton d’accès, aucune requête vers GitHub ou GitLab. Seuls la clé du backlog connecté et les tickets non supprimés sont reconnus ; seule la première ligne des messages de commit est conservée, sans adresse e-mail ni contenu de code. L’historique antérieur à la connexion n’est pas importé, et les références restent sur les tickets après suppression de la connexion ; elles peuvent alors être retirées une à une.
          </GuideNote>
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

      <GuideSection id="collaboration">
        <ul className="t-body list-disc space-y-1 pl-5">
          <li>Quand quelqu’un d’autre modifie le backlog affiché, le bandeau <Ui>Ce backlog a été modifié par quelqu&apos;un d&apos;autre.</Ui> apparaît en haut de l’écran.</li>
          <li>Les vues Backlog, Board, Liste et Arbre restent en place : cliquez sur <Ui>Actualiser</Ui> pour voir les changements, ou sur <Ui>Masquer</Ui> pour fermer le bandeau.</li>
          <li>Vos propres modifications ne font pas apparaître ce bandeau.</li>
          <li>Le panneau de détail ouvert se met à jour tout seul quand quelqu’un d’autre modifie ce ticket.</li>
          <li>La cloche se met à jour toute seule quand quelqu’un vous mentionne dans un commentaire.</li>
          <li>Si un onglet reste caché plus d’une minute, le suivi se met en pause ; à votre retour, le panneau ouvert et la cloche rattrapent les changements.</li>
          <li>Vous ne voyez pas qui regarde un ticket et l’écriture à plusieurs en direct n’est pas proposée.</li>
        </ul>
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

      <GuideSection id="roadmap">
        <GuideTopic
          title="Lire et planifier la Roadmap"
          purpose="Voir les composants, leurs epics et leurs tâches sur un calendrier, puis ajuster leurs dates."
          steps={[
            <>Ouvrez <Ui>Roadmap</Ui> dans les vues du backlog. Les composants regroupent leurs epics ; dépliez un epic pour voir ses tâches. Cliquez sur un libellé ou une barre pour ouvrir le panneau du ticket.</>,
            <>Une barre montre les dates du ticket. Hachurée, elle est déduite : une tâche reprend les dates de son sprint, un epic l’étendue de ses tâches. La barre du composant couvre ses epics et reste en lecture seule.</>,
            <>Glissez une barre pour déplacer ses deux dates. Étirez son bord gauche pour changer le début, ou son bord droit pour changer l’échéance.</>,
            <>Sur une ligne sans barre, cliquez à la date voulue pour planifier sept jours, ou glissez pour choisir la période.</>,
            <>Au clavier, ciblez une barre avec <Key>Tab</Key> : <Key>←</Key> et <Key>→</Key> déplacent d’un jour, <Key>Maj</Key> avec une flèche change l’échéance, <Key>Alt</Key> avec une flèche change le début. L’enregistrement est automatique après une courte pause.</>,
            <>Choisissez <Ui>Semaines</Ui>, <Ui>Mois</Ui> ou <Ui>Trimestres</Ui> ; le zoom est mémorisé sur cet appareil. <Ui>Aujourd’hui</Ui> recentre le calendrier. Les sprints et les releases servent de repères.</>,
            <>Cochez <Ui>Afficher les éléments terminés</Ui> pour retrouver les epics terminés depuis plus de 30 jours, masqués par défaut.</>,
            <>Le début doit précéder l’échéance ou lui être égal. Sans droit de modification des tickets, vous pouvez consulter les barres et ouvrir le panneau, mais pas changer leurs dates.</>,
          ]}
        />
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
            <>Barre latérale → <Ui>Rapports</Ui>, puis <Ui>Rapport de sprint</Ui>, <Ui>Vélocité</Ui>, <Ui>Burndown</Ui> ou <Ui>Bilan des sprints</Ui>.</>,
            <>Pour <Ui>Bilan des sprints</Ui>, le tableau regroupe les sprints sans sélection supplémentaire.</>,
            <>Pour <Ui>Rapport de sprint</Ui> et <Ui>Burndown</Ui>, choisissez le <Ui>Sprint</Ui> puis <Ui>Afficher</Ui>. Pour <Ui>Vélocité</Ui>, choisissez <Ui>7 sprints</Ui> ou <Ui>12 sprints</Ui>.</>,
          ]}
        >
          <GuideNote>
            <Ui>Données en cours</Ui> : sprint actif. <Ui>Historique figé</Ui> : sprint clôturé, les chiffres des tickets ne bougent plus.
          </GuideNote>
        </GuideTopic>

        <GuideTopic title="Lire les rapports" purpose="Savoir ce que montre chaque rapport.">
          <ul className="t-body list-disc space-y-1 pl-5">
            <li><Ui>Rapport de sprint</Ui> : engagement au démarrage, terminés, périmètre, tickets ajoutés ou retirés après le démarrage, journal du sprint.</li>
            <li><Ui>Bilan des sprints</Ui> : le sprint actif en tête, puis les 50 derniers sprints clos au plus. Comparez l’engagement, les ajouts et retraits, les terminés, les points et les bugs. La présence couvre les jours ouvrés du sprint, avec l’effectif assignable actuel et hors absences déclarées ; elle est recalculée même après clôture et demande l’accès à l’annuaire. Les chiffres des tickets clos restent figés. Les seuils rouges sont des repères à discuter, sans classement individuel.</li>
            <li><Ui>Vélocité</Ui> : engagement et points terminés des derniers sprints (7 ou 12), avec la moyenne.</li>
            <li><Ui>Burndown</Ui> : travail restant jour après jour face à une trajectoire idéale ; compare l’engagement au démarrage à la moyenne des sprints précédents. Sur un sprint en cours, le trait <Ui>Aujourd’hui</Ui> montre où l’on en est, et la valeur au bout de la ligne donne le travail restant.</li>
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
            <li><Ui>Administrateur du backlog</Ui> : tout ce que fait un membre, plus supprimer et restaurer, gérer sprints, releases, statuts, membres et vues partagées.</li>
          </ul>
          <GuideNote>
            Le rôle Administrateur du backlog ne donne pas la permission globale Administrer Jiroo. Un administrateur Jiroo dispose de cette permission globale et peut gérer les accès de la plateforme.
            Les droits s’additionnent (utilisateur, groupes, rôles) et peuvent être ajustés par backlog. Les actions
            disponibles dépendent de vos droits et de l&apos;état de l&apos;élément.
          </GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Parcourir les utilisateurs et assigner"
          purpose="Comprendre pourquoi le menu Assigné peut ne proposer aucun utilisateur."
          steps={[
            <>La permission globale <Ui>Parcourir les utilisateurs</Ui> est accordée par défaut à tous les utilisateurs authentifiés. Elle permet d’afficher les candidats ; le droit d’assigner dans le backlog reste nécessaire pour modifier l’assigné.</>,
            <>Un administrateur Jiroo peut retirer cet accès depuis <Ui>Administration</Ui> → <Ui>Groupes</Ui> → <Ui>Permissions globales</Ui>.</>,
            <>Sans cette permission, le menu <Ui>Assigné</Ui> de la création, du détail, de la Liste et du Backlog explique le droit manquant et invite à le demander à un administrateur Jiroo. <Ui>Non assigné</Ui> reste proposé ; <Ui>M’assigner</Ui> reste disponible quand votre compte fait déjà partie des candidats.</>,
          ]}
        />

        <GuideTopic
          title="Paramètres du backlog"
          purpose="Ouvrir les réglages d’un backlog et partager des modèles de tickets avec les personnes qui y créent."
          steps={[
            <>Dans la barre latérale, sous les vues du projet, cliquez sur <Ui>Paramètres</Ui> : l’entrée n’apparaît qu’aux personnes qui administrent le backlog ou en gèrent les membres, et ouvre l’onglet <Ui>Accès</Ui>.</>,
            <>Ouvrez l’onglet <Ui>Modèles</Ui>. Il est réservé aux personnes ayant la permission <Ui>Administrer le backlog</Ui>, comme les autres onglets de paramètres.</>,
            <>Cliquez sur <Ui>Nouveau modèle</Ui> et donnez-lui un nom unique dans ce backlog. Choisissez éventuellement un type, puis la nature, le titre de départ, la description, la priorité et les labels du backlog ; cliquez sur <Ui>Créer le modèle</Ui>.</>,
            <>Utilisez <Ui>Modifier</Ui> pour ajuster un modèle, ou <Ui>Supprimer</Ui> puis confirmez. Les tickets déjà créés restent inchangés. Chaque backlog peut conserver jusqu’à 50 modèles.</>,
          ]}
        >
          <GuideNote>Les membres utilisent les modèles depuis <Ui>Nouvel item</Ui>, sans pouvoir les administrer. Un label supprimé est signalé et ignoré à la création. Les deux modèles fixes restent disponibles partout.</GuideNote>
        </GuideTopic>

        <GuideTopic
          title="Administration et administrateurs Jiroo"
          purpose="Gérer comptes, groupes, backlogs et accès."
          steps={[
            <>Barre latérale → <Ui>Administration</Ui> (visible seulement si vous avez un droit d’administration ; chaque onglet dépend de vos permissions).</>,
            <><Ui>Utilisateurs</Ui> : <Ui>Nouvel utilisateur</Ui> crée un compte sans attribution directe de droits globaux ; les droits accordés à tous les utilisateurs authentifiés restent applicables. Le formulaire renvoie vers <Ui>Groupes</Ui> pour lui en donner d’autres ; menu « … » → <Ui>Réinitialiser le mot de passe</Ui> ou <Ui>Réinitialiser la double authentification</Ui>.</>,
            <><Ui>Groupes</Ui> : créer, renommer, ajouter ou retirer des membres ; attribuer les permissions globales.</>,
            <><Ui>Backlogs</Ui> : <Ui>Nouveau backlog</Ui>, <Ui>Modifier</Ui>, <Ui>Archiver</Ui>, <Ui>Accès</Ui> pour affecter personnes et groupes aux rôles, et <Ui>Développement</Ui> pour connecter des dépôts GitHub ou GitLab.</>,
            <><Ui>Backlogs</Ui> → <Ui>Accès</Ui> : la barre latérale et le fil d’Ariane (<Ui>Administration</Ui> / <Ui>Backlogs</Ui> / nom du backlog / <Ui>Accès</Ui>) suivent le backlog affiché. En <Ui>Mode Simple</Ui>, choisissez le rôle de chaque personne ou groupe, ajoutez-en, ou cliquez <Ui>Retirer</Ui> sur sa ligne. Le dernier administrateur effectif du backlog ne peut être ni retiré ni changé de rôle.</>,
            <><Ui>Backlogs</Ui> → <Ui>Modifier</Ui> → <Ui>Responsable</Ui> : choisissez la personne affichée comme responsable sur l’accueil, ou <Ui>Aucun</Ui>. Ce champ ne donne aucun droit ; il n’apparaît qu’avec la permission de parcourir les utilisateurs.</>,
            <><Ui>Rôles de projet</Ui> et <Ui>Schémas de permissions</Ui> : réglages fins des accès.</>,
          ]}
        >
          <GuideNote>
            La récupération des accès (mot de passe, double authentification) et l’attribution de permissions
            globales sont réservées aux administrateurs Jiroo ; la récupération concerne un autre compte que le
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
            <>Si un administrateur Jiroo a créé un backlog « Recette », ouvrez-le avec le sélecteur de backlog.</>,
            <>Créez un ticket avec le modèle <Ui>Rapport de bug</Ui> (ou <Ui>User story</Ui> pour une idée).</>,
            <>Décrivez les étapes, le résultat attendu et le résultat observé.</>,
            <>À défaut de backlog « Recette », transmettez votre retour directement à un administrateur Jiroo.</>,
          ]}
        />
      </GuideSection>
    </div>
  );
}
