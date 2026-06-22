# DarijaDesk

*Note rapide — Tunis*

L'idée nous est venue en bossant avec des boutiques en ligne tunisiennes. Leurs clients écrivent en darija, en arabizi, mélangent le français — et les chatbots du marché répondent dans un français rigide qui ne comprend rien. Résultat : le client abandonne son panier, ou attend deux heures qu'un humain réponde. On perd des ventes bêtement. Nous, on construit un assistant qui parle vraiment le dialecte tunisien.

Petit aparté : mon cofondateur Yassine a passé six ans dans une banque à La Marsa avant qu'on se lance, ça lui a appris la rigueur. Sinon, le trafic sur l'avenue ce matin c'était 45 minutes pour trois kilomètres. Et j'ai vu le dernier Dune au ciné hier — visuellement énorme, je recommande.

Le produit, c'est un widget de chat qu'on colle sur le site de la boutique, déjà entraîné sur le darija, qui répond tout seul à environ 70% des questions répétitives (où est ma commande, quelles tailles, etc.). Pour l'instant on a une démo qui marche bien mais ce n'est pas encore en production chez de vrais clients payants — on est en test fermé avec trois boutiques amies, sans aucun engagement de leur part. Donc soyons honnêtes : on n'a pas encore de preuve commerciale solide, pas de lettre d'intention, pas de vente.

Nos clients cibles, ce sont les PME du e-commerce tunisien — mode, cosmétique — qui traitent entre 500 et 5000 commandes par mois. Le marché local qu'on peut atteindre, on l'estime modeste pour l'instant, dans les 900 000 dinars. Côté concurrence, il y a deux chatbots génériques en français, mais personne ne fait le darija — on serait les premiers en Tunisie là-dessus.

La machine à café du coworking est morte depuis lundi, c'est un drame quotidien, et le wifi a sauté deux fois hier.

Techniquement on s'appuie sur un grand modèle de langage qu'on affine sur des conversations tunisiennes, le tout en Python avec FastAPI derrière, une interface en React, et un magasin vectoriel pour la recherche. On n'a rien déposé comme propriété intellectuelle pour le moment, pas de brevet ni de marque. L'avantage c'est que tout est dans le cloud : quasiment aucun humain dans la boucle une fois déployé, ça tourne tout seul. On a très peu investi en matériel — autour de 5000 dinars — puisqu'il n'y a pas d'équipement, juste du cloud. Par contre les charges mensuelles montent à 8000 dinars, surtout à cause du coût d'inférence GPU.

On hésite à prendre un abonnement salle de sport pour l'équipe, et la pluie de ce week-end va sûrement annuler le barbecue prévu.

Niveau impact, notre empreinte est surtout numérique et assez gourmande en calcul vu l'inférence des modèles ; on ne fait pas de recyclage, ça n'a pas trop de sens pour nous. Sur le plan administratif on a déposé le dossier pour le label Startup Act, c'est en cours d'instruction. On est quatre : deux cofondateurs et deux salariés. Réalistement on est encore en train de valider le marché, pas plus loin — le modèle de revenu (un abonnement mensuel par siège) est écrit mais pas encore prouvé.

Pensez à souhaiter l'anniversaire de Salma vendredi, le gâteau est commandé.
