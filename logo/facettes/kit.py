# Kit du logo Facettes (piste A, « la facette qui saute ») : versions noir, couleur, icône d'appli, favicon
import math
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
os.makedirs('kit', exist_ok=True)

ENCRE = '#16112B'
# Les couleurs des matières, dans l'ordre d'un arc-en-ciel de boîte de nuit (bandes en diagonale)
DISCO = ['#3D5AFE', '#7B4DFF', '#FF5FA2', '#FF6B3D', '#FFC21A', '#00C08B']


def boule(pas, cote, rayon, n, arrondi):
    """Tuiles dont le centre tombe dans le cercle ; renvoie (tuiles, tuile qui saute)."""
    debut = 128 - pas * (n - 1) / 2
    tuiles = [(debut + c * pas, debut + l * pas, c, l) for l in range(n) for c in range(n)
              if math.hypot(debut + c * pas - 128, debut + l * pas - 128) <= rayon]
    sautee = max(tuiles, key=lambda t: (t[0] - 128) - (t[1] - 128) * 1.01)
    return tuiles, sautee


def dessiner(tuiles, sautee, cote, arrondi, couleurs, couleur_saut, decal, saut):
    morceaux = []
    for x, y, c, l in tuiles:
        if (x, y) == sautee[:2]:
            continue
        coul = couleurs if isinstance(couleurs, str) else couleurs[(c + l) % len(couleurs)]
        morceaux.append(f'<rect x="{x - cote / 2:g}" y="{y - cote / 2:g}" width="{cote}" height="{cote}" rx="{arrondi}" fill="{coul}"/>')
    sx, sy = sautee[:2]
    morceaux.append(f'<rect x="{sx - cote / 2:g}" y="{sy - cote / 2:g}" width="{cote}" height="{cote}" rx="{arrondi}" '
                    f'fill="{couleur_saut}" transform="translate({saut} -{saut}) rotate(15 {sx:g} {sy:g})"/>')
    return f'<g transform="translate({decal[0]} {decal[1]})">{"".join(morceaux)}</g>'


def ecrire(nom, contenu, fond=''):
    open(f'kit/{nom}', 'w', encoding='utf-8').write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Facettes</title>{fond}{contenu}</svg>\n')


# Grande version : 21 tuiles
grand = boule(36, 30, 96, 7, 7)
ecrire('symbole-noir.svg', dessiner(*grand, 30, 7, '#000', '#000', (-8, 8), 20))
ecrire('symbole-couleur.svg', dessiner(*grand, 30, 7, DISCO, ENCRE, (-8, 8), 20))
ecrire('symbole-blanc.svg', dessiner(*grand, 30, 7, '#FFF', '#FFF', (-8, 8), 20))

# Icône d'appli : fond de boîte de nuit plein cadre (l'iPhone arrondit lui-même), tuile qui saute en blanc
petit_dans_icone = boule(30, 25, 80, 7, 6)
ecrire('icone-app.svg', dessiner(*petit_dans_icone, 25, 6, DISCO, '#FFFFFF', (-6, 8), 18),
       fond=f'<rect width="256" height="256" fill="{ENCRE}"/>')

# Petite taille (favicon 16–32 px) : 3×3 tuiles moins les coins = 5 tuiles en croix arrondie + la tuile qui saute
mini = boule(50, 42, 90, 4, 10)
ecrire('favicon.svg', dessiner(*mini, 42, 10, DISCO, '#FFFFFF', (-10, 12), 24),
       fond=f'<rect width="256" height="256" rx="56" fill="{ENCRE}"/>')
print('grand', len(grand[0]), 'tuiles ; icône', len(petit_dans_icone[0]), '; mini', len(mini[0]))

# En-tête de l'appli (environ 24 px) : version simplifiée, fond transparent, tuile qui saute à l'encre
ecrire('symbole-mini-couleur.svg', dessiner(*mini, 42, 10, DISCO, ENCRE, (-10, 12), 24))
