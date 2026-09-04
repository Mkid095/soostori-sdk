"""Add /src and fix depth for business packages — direct fix."""
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))


def find_pkg_for_file(file_path):
    parts = file_path.replace('\\', '/').split('/')
    if 'packages' not in parts:
        return None
    idx = parts.index('packages')
    if len(parts) <= idx + 1:
        return None
    if parts[idx + 1] == 'business' and len(parts) > idx + 2:
        return f'business/{parts[idx + 2]}'
    return parts[idx + 1]


def process_file(file_path):
    if not file_path.endswith('.ts'):
        return False
    if '/test/' in file_path or '\\test\\' in file_path:
        return False
    current_pkg = find_pkg_for_file(file_path)
    if not current_pkg:
        return False

    # Compute required depth
    parts = file_path.replace('\\', '/').split('/')
    if current_pkg.startswith('business/'):
        idx = parts.index('business')
        pkg_dir_idx = idx + 2
    else:
        idx = parts.index('packages')
        pkg_dir_idx = idx + 1
    subpath_depth = len(parts) - pkg_dir_idx - 1  # sub-dirs between pkg dir and file
    # File is at: packages/<pkg>/sub/file.ts
    # Need: ../'s to get out of sub dirs, then 1 more to get out of pkg/, then to_pkg/src
    required_dots = subpath_depth + 1  # to reach packages/

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Match any relative import (with or without /src suffix)
    pattern = re.compile(r"from '(\.\./)+([A-Za-z0-9_-]+)(/src)?'")
    def repl(m):
        dots_count = len(m.group(1)) // 3  # each '..' followed by '/' = 3 chars
        target_pkg = m.group(2)
        # Force required depth
        return f"from '{'../' * required_dots}{target_pkg}/src'"

    new = pattern.sub(repl, content)
    if new != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new)
        return True
    return False


changed = 0
for root, dirs, files in os.walk(os.path.join(ROOT, 'packages')):
    if 'node_modules' in root or 'dist' in root:
        continue
    for f in files:
        if not f.endswith('.ts'):
            continue
        full = os.path.join(root, f)
        if process_file(full):
            changed += 1
            print(f'Fixed: {full}')
print(f'Total: {changed}')
