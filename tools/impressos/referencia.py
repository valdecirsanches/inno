"""Roda os reports.py originais do AppClinic (ReportLab) com um ORM falso em
memória, a partir de dados.json, e grava os PDFs de referência.
Uso: APPCLINIC=/caminho/do/appclinic python3 -I referencia.py <saida.pdf> <relatorio> [parametros GET como k=v ...]
"""
import sys, os, json, types, datetime, importlib, decimal, io
from importlib.machinery import ModuleSpec

AQUI = os.path.dirname(os.path.abspath(__file__))
APP = os.environ.get('APPCLINIC', os.path.join(AQUI, '..', '..', '..', 'appclinic'))
MODELOS = json.load(open(os.path.join(AQUI, '..', '..', 'server', 'modelos.json')))
DADOS = json.load(open(os.path.join(AQUI, 'dados.json')))

# ------------------------------------------------------------ conversão
def conv(tipo, v):
    if v is None: return None
    if tipo == 'DateField': return datetime.date.fromisoformat(v[:10])
    if tipo == 'DateTimeField': return datetime.datetime.fromisoformat(v)
    if tipo == 'TimeField': return datetime.time.fromisoformat(v)
    if tipo == 'DecimalField': return decimal.Decimal(v)
    return v

class Obj:
    def __init__(self, modelo, linha):
        object.__setattr__(self, '_m', modelo)
        campos = {c['atributo']: c for c in MODELOS[modelo]['campos']}
        for a, c in campos.items():
            object.__setattr__(self, a, conv(c['tipo'], linha.get(a)))
        self.__dict__['pk'] = self.__dict__.get('id')
    def __getattr__(self, n):
        campos = {c['nome']: c for c in MODELOS[self._m]['campos']}
        c = campos.get(n)
        if c and c.get('ref'):
            fid = self.__dict__.get(c['atributo'])
            if fid is None: return None
            return Model.registro(c['ref']).objects.get(id=fid)
        raise AttributeError(n)
    def __setattr__(self, n, v):
        campos = {c['nome']: c for c in MODELOS[self._m]['campos']}
        c = campos.get(n)
        if c and c.get('ref') and c['atributo'] != n:
            self.__dict__[c['atributo']] = None if v is None else v.id
        else:
            self.__dict__[n] = v
    def save(self): pass
    def delete(self): pass

def valor(o, caminho):
    for p in caminho.split('__'):
        o = getattr(o, p) if o is not None else None
    return o

class QS(list):
    def filter(self, *a, **kw):
        r = QS(self)
        for k, v in kw.items():
            op = 'exact'
            for s in ('lte', 'gte', 'icontains', 'in'):
                if k.endswith('__' + s): k, op = k[:-len(s) - 2], s
            if isinstance(v, Obj): v = v.id
            if isinstance(v, str) and k in ('data',): v = datetime.date.fromisoformat(v)
            def ok(o):
                x = valor(o, k)
                if isinstance(x, Obj): x = x.id
                if op == 'exact':
                    if isinstance(x, int) and isinstance(v, str): return str(x) == v
                    return x == v
                if op == 'lte': return x is not None and x <= v
                if op == 'gte': return x is not None and x >= v
                if op == 'in': return x in v
                if op == 'icontains': return x is not None and str(v).lower() in str(x).lower()
            r = QS(o for o in r if ok(o))
        return r
    def exclude(self, **kw):
        tira = set(id(o) for o in self.filter(**kw))
        return QS(o for o in self if id(o) not in tira)
    def order_by(self, *campos):
        r = list(self)
        for c in reversed(campos):
            d = c.startswith('-'); c = c.lstrip('-')
            r.sort(key=lambda o: (valor(o, c) is not None, valor(o, c) if valor(o, c) is not None else 0), reverse=d)
        return QS(r)
    def all(self): return QS(self)
    def first(self): return self[0] if self else None
    def last(self): return sorted(self, key=lambda o: o.id)[-1] if self else None
    def exists(self): return bool(self)
    def count(self): return len(self)
    def get(self, **kw):
        r = self.filter(**kw)
        if len(r) != 1: raise Exception('DoesNotExist' if not r else 'MultipleObjectsReturned')
        return r[0]

class Manager:
    def __init__(self, m): self.m = m
    def _qs(self): return QS(Obj(self.m, l) for l in DADOS.get(self.m, []))
    def __getattr__(self, n): return getattr(self._qs(), n)

class Model:
    _reg = {}
    @classmethod
    def registro(cls, nome):
        if nome not in cls._reg:
            cls._reg[nome] = type(nome, (), {'objects': Manager(nome)})
        return cls._reg[nome]

# --------------------------------------------------------------- stubs
class HttpResponse(io.BytesIO):
    def __init__(self, content=b'', content_type=None, status=200, **kw):
        super().__init__(); self.headers = {}; self.status_code = status
    def __setitem__(self, k, v): self.headers[k] = v
class JsonResponse(HttpResponse):
    def __init__(self, data, safe=True, status=200, **kw):
        super().__init__(status=status); self.write(json.dumps(data).encode())

def modulo(nome, **attrs):
    m = types.ModuleType(nome); m.__dict__.update(attrs); sys.modules[nome] = m; return m

class ModelModule(types.ModuleType):
    def __getattr__(self, n):
        if n.startswith('__'): raise AttributeError(n)
        return Model.registro(n)

class Finder:
    PACOTES = ('Agenda', 'Cadastros', 'Prontuario', 'Atendimento', 'Configuracoes', 'Seguranca', 'Home', 'Tarefas', 'WhatsApp', 'core', 'appClinic')
    def find_spec(self, nome, path, target=None):

        if nome.split('.')[0] in self.PACOTES and (nome.endswith('.models') or nome.endswith('.forms')):
            return ModuleSpec(nome, self)
        return None
    def create_module(self, spec): return ModelModule(spec.name)
    def exec_module(self, m): pass

sys.meta_path.insert(0, Finder())
modulo('django'); modulo('django.http', HttpResponse=HttpResponse, JsonResponse=JsonResponse)
modulo('django.http.response', HttpResponse=HttpResponse)
modulo('django.http.request', QueryDict=dict)
modulo('django.shortcuts', render=None, get_object_or_404=None)
modulo('django.conf', settings=types.SimpleNamespace(BASE_DIR=APP))
modulo('django.contrib'); modulo('django.contrib.auth'); modulo('django.contrib.auth.decorators', login_required=lambda f: f)
modulo('django.views'); modulo('django.views.generic'); modulo('django.views.generic.base', View=object)
modulo('django.utils'); modulo('django.utils.decorators', method_decorator=lambda d: (lambda f: f))
modulo('django.db'); modulo('django.db.models', Q=None)
modulo('django.forms', model_to_dict=None)
modulo('appClinic.settings', BASE_DIR=APP)
sys.path.insert(0, APP)
os.chdir(APP)
import reportlab.rl_config
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import reportlab
reportlab.rl_config.TTFSearchPath.append(os.path.join(os.path.dirname(reportlab.__file__), 'fonts'))

class User(types.SimpleNamespace): pass

def main():
    saida, rel = sys.argv[1], sys.argv[2]
    GET = dict(a.split('=', 1) for a in sys.argv[3:])
    u = Model.registro('TbUsuario').objects.get(id=1)
    req = types.SimpleNamespace(GET=GET, user=u)
    alvos = {
        'ficha': ('Cadastros.Pacientes.reports', 'ImprimeFicha'),
        'recibo': ('Cadastros.Pacientes.reports', 'ImprimeRecibo'),
        'agenda': ('Agenda.Consultas.reports', 'ImprimeAgenda'),
        'convenio': ('Cadastros.Convenio.reports', 'ImprimirAtendimentos'),
        'atestado': ('Prontuario.Atestado.reports', 'ImprimeAtestado'),
        'exame': ('Prontuario.Exames.reports', 'ImprimeExame'),
        'relatorio': ('Prontuario.Relatorios.reports', 'ImprimeRelatorio'),
        'prescricao': ('Prontuario.Prescricoes.reports', 'ImprimePrescricao'),
        'prontuario': ('Prontuario.views', 'ProntuarioPrint'),
    }
    mod, fn = alvos[rel]
    m = importlib.import_module(mod)
    f = getattr(m, fn)
    r = f().get(req) if isinstance(f, type) else f(req)
    open(saida, 'wb').write(r.getvalue())

import locale
locale.setlocale = lambda *a: None
def _cur(v, grouping=True, symbol=None):
    t = '{:,.2f}'.format(v)
    return t.replace(',', '#').replace('.', ',').replace('#', '.')
locale.currency = _cur
main()
