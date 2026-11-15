#!/usr/bin/env python3
"""
Exporta a definição dos modelos Django do AppClinic para server/modelos.json.

O Node usa este arquivo para ler cada coluna com o mesmo tipo que o Django
devolvia (booleano, decimal, data...), e para saber nomes de tabela, coluna
e chaves estrangeiras. Rode de novo sempre que um modelo mudar no AppClinic.
"""
import json
import os
import sys

import django

django.setup()
from django.apps import apps  # noqa: E402

DESTINO = sys.argv[1]
saida = {}
for m in apps.get_models():
    if m._meta.app_label in ('admin', 'contenttypes', 'sessions', 'auth') and m.__name__ != 'TbUsuario':
        continue
    campos = []
    for f in m._meta.concrete_fields:
        c = dict(nome=f.name, atributo=f.attname, coluna=f.column, tipo=f.get_internal_type(),
                 nulo=f.null, pk=f.primary_key, editavel=f.editable, branco=f.blank)
        if getattr(f, 'max_length', None):
            c['max'] = f.max_length
        if f.unique and not f.primary_key:
            c['unico'] = True
        c['verbose'] = str(f.verbose_name)
        if f.choices:
            c['opcoes'] = [k for k, _ in f.flatchoices]
        if f.is_relation and f.related_model is not None:
            c['ref'] = f.related_model.__name__
        if f.get_internal_type() == 'DecimalField':
            c['casas'] = f.decimal_places
        if getattr(f, 'auto_now', False):
            c['auto_now'] = True
        if getattr(f, 'auto_now_add', False):
            c['auto_now_add'] = True
        if f.has_default() and not callable(f.default):
            c['padrao'] = f.default
        campos.append(c)
    saida[m.__name__] = dict(app=m._meta.app_label, tabela=m._meta.db_table,
                             pk=m._meta.pk.attname, campos=campos,
                             verbose=str(m._meta.verbose_name))
os.makedirs(os.path.join(DESTINO, 'server'), exist_ok=True)
with open(os.path.join(DESTINO, 'server', 'modelos.json'), 'w', encoding='utf-8') as f:
    json.dump(saida, f, indent=1, ensure_ascii=False, sort_keys=True, default=str)
print(len(saida), 'modelos exportados')
