#!/usr/bin/env python3
"""
Converte os templates Django do AppClinic para Nunjucks (Inno).

Roda com o ambiente Django do AppClinic, para resolver {% url %} pelos
próprios nomes de rota:

  cd appclinic && DJANGO_SETTINGS_MODULE=appClinic.settings \
     python /caminho/inno/tools/converte_templates.py templates /caminho/inno

O HTML gerado é o mesmo: só a sintaxe dos comandos muda.
  {% load ... %}            -> removido (o Django também não imprime nada)
  {% static 'x' %}          -> /static/x
  {% url 'nome' %}          -> caminho resolvido pelo Django
  {% url 'nome' arg %}      -> {{ url('nome', arg) }}
  {% csrf_token %}          -> input csrfmiddlewaretoken
  {{ block.super }}         -> {{ super() }}
  {% comment %}..{% endcomment %} -> {# .. #}
  |filtro:arg               -> |filtro(arg)
  {% empty %}               -> {% else %}
  forloop.counter/first...  -> loop.index/first...
  for k, v in x.items       -> for k, v in x
"""
import json
import os
import re
import sys

import django

django.setup()
from django.urls import get_resolver, reverse, URLResolver, URLPattern  # noqa: E402

ORIGEM, DESTINO = sys.argv[1], sys.argv[2]


def mapa_de_rotas():
    """nome -> padrão do caminho, para url('nome', args) no Nunjucks."""
    mapa = {}

    def walk(pats, prefixo=''):
        for p in pats:
            if isinstance(p, URLResolver):
                walk(p.url_patterns, prefixo + str(p.pattern))
            elif isinstance(p, URLPattern) and p.name:
                mapa.setdefault(p.name, '/' + prefixo + str(p.pattern))
    walk(get_resolver().url_patterns)
    return mapa


ROTAS = mapa_de_rotas()


def troca_url(m):
    partes = m.group(1).split()
    nome = partes[0].strip('\'"')
    args = partes[1:]
    if not args:
        try:
            return reverse(nome)
        except Exception:
            return ROTAS.get(nome, '#')
    return "{{ url('%s', %s) }}" % (nome, ', '.join(args))


def troca_filtros(expr):
    # |filtro:"arg" ou |filtro:arg  ->  |filtro("arg")
    return re.sub(r'\|(\w+):("[^"]*"|\'[^\']*\'|[\w.]+)', r'|\1(\2)', expr)


def converte(texto):
    t = texto
    t = re.sub(r'\{%\s*load\s+[^%]*%\}', '', t)
    t = re.sub(r'\{%\s*static\s+[\'"]([^\'"]+)[\'"]\s*%\}', r'/static/\1', t)
    t = re.sub(r'\{%\s*url\s+([^%]+?)\s*%\}', troca_url, t)
    t = re.sub(r'\{%\s*csrf_token\s*%\}',
               '<input type="hidden" name="csrfmiddlewaretoken" value="{{ csrf_token }}">', t)
    t = re.sub(r'\{\{\s*block\.super\s*\}\}', '{{ super() }}', t)
    t = re.sub(r'\{%\s*comment[^%]*%\}(.*?)\{%\s*endcomment\s*%\}',
               lambda m: '{#' + m.group(1).replace('#}', '# }') + '#}', t, flags=re.S)
    t = re.sub(r'\{%\s*empty\s*%\}', '{% else %}', t)
    for dj, nj in (('counter0', 'index0'), ('counter', 'index'), ('revcounter0', 'revindex0'),
                   ('revcounter', 'revindex'), ('first', 'first'), ('last', 'last')):
        t = t.replace('forloop.' + dj, 'loop.' + nj)
    t = re.sub(r'(\{%\s*for\s+\w+\s*,\s*\w+\s+in\s+[\w.]+?)\.items(\s*%\})', r'\1\2', t)
    # filtros com argumento, dentro de {{ }} e {% %}
    t = re.sub(r'\{\{.*?\}\}', lambda m: troca_filtros(m.group(0)), t, flags=re.S)
    t = re.sub(r'\{%.*?%\}', lambda m: troca_filtros(m.group(0)), t, flags=re.S)
    return t


def main():
    total = 0
    for raiz, _, arquivos in os.walk(ORIGEM):
        for nome in arquivos:
            if not nome.endswith('.html'):
                continue
            src = os.path.join(raiz, nome)
            rel = os.path.relpath(src, ORIGEM)
            dst = os.path.join(DESTINO, 'templates', rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(src, encoding='utf-8') as f:
                texto = f.read()
            with open(dst, 'w', encoding='utf-8') as f:
                f.write(converte(texto))
            total += 1
    os.makedirs(os.path.join(DESTINO, 'server'), exist_ok=True)
    with open(os.path.join(DESTINO, 'server', 'rotas-nomeadas.json'), 'w', encoding='utf-8') as f:
        json.dump(ROTAS, f, indent=1, ensure_ascii=False, sort_keys=True)
    print(f'{total} templates convertidos; {len(ROTAS)} rotas nomeadas')


if __name__ == '__main__':
    main()
