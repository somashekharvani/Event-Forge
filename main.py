import os
import sys
from pathlib import Path

# Serverless and thread safety configuration
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")

if 'EVENTFORGE_DB' not in os.environ:
    os.environ['EVENTFORGE_DB'] = '/tmp/eventforge.db'

root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / 'backend'
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app import app
