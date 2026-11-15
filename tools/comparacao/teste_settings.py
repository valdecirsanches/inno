# Configuração de teste: o settings.py do AppClinic, com SQLite no lugar do MySQL.
import os
from appClinic.settings import *   # noqa
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': os.environ['DJ_DB']}}
if os.environ.get('DJ_MYSQL'):
    # MySQL/MariaDB pelo PyMySQL (sem compilar o mysqlclient)
    import pymysql
    pymysql.version_info = (1, 4, 6, 'final', 0)
    pymysql.install_as_MySQLdb()
    DATABASES = {'default': {'ENGINE': 'django.db.backends.mysql', 'NAME': os.environ['DJ_MYSQL'],
                             'USER': os.environ.get('MYSQL_USER', 'teste'), 'PASSWORD': os.environ.get('MYSQL_PASSWORD', 'teste'),
                             'HOST': os.environ.get('MYSQL_HOST', '127.0.0.1'), 'OPTIONS': {'charset': 'utf8mb4'}}}
DEBUG = False
ALLOWED_HOSTS = ['*']
SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
MEDIA_ROOT = os.environ.get('DJ_MEDIA', '/tmp/dj-media')
LOGGING = {'version': 1, 'disable_existing_loggers': False,
           'handlers': {'e': {'class': 'logging.StreamHandler', 'level': 'ERROR'}},
           'loggers': {'django.request': {'handlers': ['e'], 'level': 'ERROR', 'propagate': False}}}
