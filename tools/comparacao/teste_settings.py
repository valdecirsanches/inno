# Configuração de teste: o settings.py do AppClinic, com SQLite no lugar do MySQL.
import os
from appClinic.settings import *   # noqa
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ['DJ_DB']}}
DEBUG = False
ALLOWED_HOSTS = ['*']
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
MEDIA_ROOT = os.environ.get('DJ_MEDIA', '/tmp/dj-media')
LOGGING = {'version': 1, 'disable_existing_loggers': False,
           'handlers': {'e': {'class': 'logging.StreamHandler', 'level': 'ERROR'}},
           'loggers': {'django.request': {'handlers': ['e'], 'level': 'ERROR', 'propagate': False}}}
