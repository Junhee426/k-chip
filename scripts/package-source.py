"""Regenerate standalone HTML and source ZIP using the shared Node build."""
from pathlib import Path
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
subprocess.run(['node', str(root / 'scripts' / 'build-render.mjs')], check=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
for name in ['kleo-chip-standalone.html', f'kleo-chip-v{version}-source.zip']:
    shutil.copy2(root / 'build' / name, root / 'dist' / name)
    print(f'Updated dist/{name}')
