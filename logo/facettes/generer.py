# Pistes de logo « Facettes » (noir, viewBox 256) — générées pour garder une géométrie exacte
import math
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
TETE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>Facettes</title>'

# A — La facette qui saute : une boule faite de tuiles, une tuile part comme une carte qu'on fait glisser
pas, cote, r = 36, 30, 96
tuiles = []
for ligne in range(7):
    for col in range(7):
        cx, cy = 20 + col * pas, 20 + ligne * pas
        if math.hypot(cx - 128, cy - 128) <= r:
            tuiles.append((cx, cy))
sautee = max(tuiles, key=lambda t: (t[0] - 128) - (t[1] - 128) * 1.01)
corps = ''.join(f'<rect x="{cx - cote / 2}" y="{cy - cote / 2}" width="{cote}" height="{cote}" rx="7"/>'
                for cx, cy in tuiles if (cx, cy) != sautee)
sx, sy = sautee
saut = (f'<rect x="{sx - cote / 2}" y="{sy - cote / 2}" width="{cote}" height="{cote}" rx="7" '
        f'transform="translate(20 -20) rotate(15 {sx} {sy})"/>')
open('a-facette-sautee.svg', 'w').write(TETE + f'<g fill="#000" transform="translate(-8 8)">{corps}{saut}</g></svg>')

# B — Un F en tuiles : la lettre construite comme une mosaïque de facettes, une facette inclinée
p2, c2 = 52, 44
cases = [(0, 0), (1, 0), (2, 0), (0, 1), (0, 2), (1, 2), (0, 3)]
largeur, hauteur = 3 * p2 - (p2 - c2), 4 * p2 - (p2 - c2)
ox, oy = (256 - largeur) / 2, (256 - hauteur) / 2
morceaux = []
for col, ligne in cases:
    x, y = ox + col * p2, oy + ligne * p2
    tourne = f' transform="rotate(15 {x + c2 / 2} {y + c2 / 2})"' if (col, ligne) == (2, 0) else ''
    morceaux.append(f'<rect x="{x}" y="{y}" width="{c2}" height="{c2}" rx="9"{tourne}/>')
open('b-f-mosaique.svg', 'w').write(TETE + f'<g fill="#000">{"".join(morceaux)}</g></svg>')

# C — L'éclat : une boule pleine, percée de l'étincelle qui la fait briller (espace négatif)
def etoile(cx, cy, bras, taille):
    return (f'M{cx} {cy - bras}Q{cx + taille} {cy - taille} {cx + bras} {cy}'
            f'Q{cx + taille} {cy + taille} {cx} {cy + bras}Q{cx - taille} {cy + taille} {cx - bras} {cy}'
            f'Q{cx - taille} {cy - taille} {cx} {cy - bras}Z')
cercle = 'M128 24A104 104 0 1 1 128 232A104 104 0 1 1 128 24Z'
open('c-eclat.svg', 'w').write(TETE + f'<path fill="#000" fill-rule="evenodd" d="{cercle}{etoile(100, 100, 50, 9)}"/></svg>')
print('ok', len(tuiles), 'tuiles, sautée', sautee)
