import os
import sys
from pathlib import Path

# Serverless environment DB location
if 'EVENTFORGE_DB' not in os.environ:
    os.environ['EVENTFORGE_DB'] = '/tmp/eventforge.db'

root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app import app
