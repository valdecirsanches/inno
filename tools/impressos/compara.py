# Uso: python3 compara.py <nome> [nome_da_referencia]  (precisa de pdftoppm e Pillow)
# compara PDFs página a página: pixels diferentes e imagem lado a lado
import sys, subprocess, glob, os
from PIL import Image, ImageChops
n = sys.argv[1]; ref = sys.argv[2] if len(sys.argv) > 2 else n
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
for f in glob.glob(f'{d}/png_{n}*'): os.remove(f)
subprocess.run(['pdftoppm', '-r', '60', '-png', f'{d}/{ref}.ref.pdf', f'{d}/png_{n}_ref'], check=True)
subprocess.run(['pdftoppm', '-r', '60', '-png', f'{d}/{n}.inno.pdf', f'{d}/png_{n}_inno'], check=True)
R = sorted(glob.glob(f'{d}/png_{n}_ref*.png')); I = sorted(glob.glob(f'{d}/png_{n}_inno*.png'))
print(n, 'páginas ref/inno:', len(R), len(I))
lado = []
for a, b in zip(R, I):
    A = Image.open(a).convert('L'); Bm = Image.open(b).convert('L')
    if A.size != Bm.size: print('  tamanho diferente', A.size, Bm.size); Bm = Bm.resize(A.size)
    df = ImageChops.difference(A, Bm).point(lambda v: 255 if v > 60 else 0)
    print(f'  {os.path.basename(a)}: {sum(df.histogram()[255:]) / (A.size[0]*A.size[1]) * 100:.2f}% pixels diferentes')
    W, H = A.size
    S = Image.new('RGB', (W * 3, H), 'white')
    S.paste(A.convert('RGB'), (0, 0)); S.paste(Bm.convert('RGB'), (W, 0))
    S.paste(Image.merge('RGB', (A, Bm, Bm)), (2 * W, 0))
    lado.append(S)
if lado:
    T = Image.new('RGB', (lado[0].size[0], sum(s.size[1] for s in lado)), 'white'); y = 0
    for s in lado: T.paste(s, (0, y)); y += s.size[1]
    T.save(f'{d}/lado_{n}.png')
