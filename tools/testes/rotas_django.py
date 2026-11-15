# Lista os endereços do AppClinic seguindo os include() a partir de appClinic/urls.py
import re, os, sys, ast
RAIZ = sys.argv[1]
def arq(mod):
    p = os.path.join(RAIZ, *mod.split('.')) + '.py'
    return p if os.path.exists(p) else None
def acoes_viewset(nome_cls, src_mod_file):
    # procura a classe em qualquer .py do projeto e pega os @action
    for dp, _, fs in os.walk(RAIZ):
        if '.git' in dp: continue
        for f in fs:
            if not f.endswith('.py'): continue
            t = open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read()
            m = re.search(r'^class\s+' + nome_cls + r'\b.*?(?=^class\s|\Z)', t, re.S | re.M)
            if not m: continue
            corpo = m.group(0)
            out = []
            for a in re.finditer(r'@action\((.*?)\)\s*\n(?:\s*@.*\n)*\s*def\s+(\w+)', corpo, re.S):
                args, fn = a.group(1), a.group(2)
                up = re.search(r"url_path\s*=\s*['\"]([^'\"]+)", args)
                det = 'detail=True' in args.replace(' ', '')
                out.append(((up.group(1) if up else fn), det))
            return out
    return []
def segue(mod, prefixo, saida):
    p = arq(mod)
    if not p: return
    t = open(p, encoding='utf-8').read()
    t = re.sub(r'(?m)^\s*#.*$', '', t)
    routers = {}
    for m in re.finditer(r"(\w+)\.register\(\s*r?['\"]([^'\"]*)['\"]\s*,\s*(\w+)", t):
        routers.setdefault(m.group(1), []).append((m.group(2), m.group(3)))
    for m in re.finditer(r"(?:path|re_path|url)\(\s*r?['\"]([^'\"]*)['\"]\s*,\s*(include\(\s*['\"]([\w.]+)['\"]|include\((\w+)\.urls\)|[\w.]+(?:\.as_view\(\))?)", t):
        rota, alvo = m.group(1), m.group(2)
        if m.group(3): segue(m.group(3), prefixo + rota, saida)
        elif m.group(4):
            for pre, vs in routers.get(m.group(4), []):
                b = prefixo + rota + (pre + '/' if pre else '')
                saida.append(b + '  [lista]')
                saida.append(b + '<pk>/  [detalhe]')
                for url, det in acoes_viewset(vs, p):
                    saida.append(b + ('<pk>/' if det else '') + url + '/')
        else: saida.append(prefixo + rota)
s = []
segue('appClinic.urls', '/', s)
for r in s: print(r)
