# Gera server/metodos-django.json: para cada endereço do AppClinic (fora o DRF), se a view é
# uma classe (e quais métodos ela tem) ou uma função (aceita qualquer método).
# Uso (na pasta do appclinic, com o venv do Django):
#   DJ_DB=/tmp/x.sqlite3 DJANGO_SETTINGS_MODULE=teste_settings \
#   PYTHONPATH=<inno>/tools/comparacao:. python <inno>/tools/comparacao/metodos_django.py > <inno>/server/metodos-django.json
import json
import django
django.setup()
from django.urls import get_resolver, URLResolver

out = []


def anda(pats, pre):
    for p in pats:
        if isinstance(p, URLResolver):
            anda(p.url_patterns, pre + str(p.pattern))
            continue
        cb = p.callback
        rota = pre + str(p.pattern)
        if hasattr(cb, 'actions') or hasattr(cb, 'cls'):   # DRF: o viewset do Inno já confere
            continue
        vc = getattr(cb, 'view_class', None)
        if vc:
            met = [m.upper() for m in vc.http_method_names if hasattr(vc, m) and m != 'options']
            if 'GET' in met and 'HEAD' not in met:
                met.append('HEAD')
            out.append([rota, 'classe', met])
        else:
            out.append([rota, 'funcao', None])


anda(get_resolver().url_patterns, '/')
print(json.dumps(out))
