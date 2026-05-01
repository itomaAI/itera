"""
Itera OS: Default Files Builder

This script recursively scans the 'vfs_root' directory and generates
'src/config/default_files.js'.
- JSON files are embedded using JSON.stringify().
- Other text files are safely escaped and embedded as template literals.
"""

import os
import json
from datetime import datetime

# Configuration
SOURCE_DIR = 'vfs_root'
OUTPUT_FILE = 'src/config/default_files.js'

IGNORE_DIRS = {'.git', '__pycache__', '.trash', '.sample'}
IGNORE_FILES = {'.DS_Store'}


def escape_template_literal(text: str) -> str:
    """
    Escape string for safe usage inside JavaScript template literals (`...`).
    """
    # Escape backslashes first
    text = text.replace('\\', '\\\\')
    # Escape backticks
    text = text.replace('`', '\\`')
    # Escape template literal expressions
    text = text.replace('${', '\\${')
    return text


def build_default_files() -> None:
    if not os.path.exists(SOURCE_DIR):
        print(f"Error: Source directory '{SOURCE_DIR}' not found.")
        print(f"Please create '{SOURCE_DIR}' and place your default VFS files there.")
        return

    entries = []

    for root, dirs, files in os.walk(SOURCE_DIR):
        # Modify dirs in-place to skip ignored directories
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file_name in files:
            if file_name in IGNORE_FILES:
                continue

            file_path = os.path.join(root, file_name)
            
            # Normalize path for VFS (e.g., 'system/config/apps.json')
            vfs_path = os.path.relpath(file_path, SOURCE_DIR).replace('\\', '/')

            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                print(f"Warning: Skipping non-text/binary file: {file_path}")
                continue

            # Process based on file extension
            if file_name.endswith('.json'):
                try:
                    # Validate and format JSON
                    json_data = json.loads(content)
                    json_str = json.dumps(json_data, indent=4, ensure_ascii=False)
                    # Wrap with JS JSON.stringify call
                    js_value = f"JSON.stringify({json_str}, null, 4)"
                    entries.append(f'        "{vfs_path}": {js_value}')
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON in {file_path}: {e}")
                    continue
            else:
                # Regular text files (HTML, JS, MD, etc.)
                escaped_content = escape_template_literal(content)
                js_value = f"`\n{escaped_content}`.trim()"
                entries.append(f'        "{vfs_path}": {js_value}')

    # Generate the final JavaScript code
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    entries_str = ",\n\n".join(entries)

    js_code = f"""// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated on: {now}

(function(global) {{
    global.Itera = global.Itera || {{}};
    global.Itera.Config = global.Itera.Config || {{}};

    global.Itera.Config.BUILD_TIME = new Date("{now}").getTime();
    global.Itera.Config.DEFAULT_FILES = {{
{entries_str}
    }};

}})(window);
"""

    # Ensure output directory exists and write file
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_code)

    print(f"✅ Successfully generated {OUTPUT_FILE} with {len(entries)} files.")


if __name__ == '__main__':
    build_default_files()
