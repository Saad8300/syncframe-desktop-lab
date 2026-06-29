import re
import os

API_TS_FILE = "frontend/src/utils/api.ts"

with open(API_TS_FILE, "r") as f:
    content = f.read()

# Replace BASE_URL definition
new_base_url_logic = """export function resolveApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    if (window.location.protocol === 'file:') {
      return 'http://127.0.0.1:8000';
    } else if ((window as any).electron) {
      return 'http://127.0.0.1:8000';
    }
  }
  return '';
}

export const API_BASE_URL = resolveApiBaseUrl();

if ((import.meta as any).env?.DEV) {
  console.log('[API] Resolved API_BASE_URL:', API_BASE_URL || 'relative proxy', '| protocol:', typeof window !== 'undefined' ? window.location.protocol : 'none');
}

export function apiUrl(path: string): string {
  if (path.startsWith('/')) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}/${path}`;
}
"""

content = re.sub(
    r"export let BASE_URL = ''[^{]*else if[^\n]*\n  }\n}",
    new_base_url_logic,
    content,
    flags=re.MULTILINE | re.DOTALL
)

# Replace `${BASE_URL}/api/...` with `apiUrl('/api/...')`
content = re.sub(r"`\$\{BASE_URL\}(/[^`]+)`", r"apiUrl('\1')", content)

with open(API_TS_FILE, "w") as f:
    f.write(content)

# Update components
components = [
    "frontend/src/components/AudioMergerPage.tsx",
    "frontend/src/components/ScriptTimestampPage.tsx",
    "frontend/src/components/BatchVideoGeneratorPage.tsx"
]

for comp in components:
    with open(comp, "r") as f:
        comp_content = f.read()
    
    # Replace import { BASE_URL } with import { API_BASE_URL, apiUrl }
    comp_content = comp_content.replace("import { BASE_URL }", "import { API_BASE_URL, apiUrl }")
    comp_content = comp_content.replace("import { BASE_URL,", "import { API_BASE_URL, apiUrl,")
    
    # Replace BASE_URL usages
    comp_content = re.sub(r"`\$\{BASE_URL\}(/[^`]+)`", r"`${API_BASE_URL}\1`", comp_content)
    comp_content = comp_content.replace("`${BASE_URL}/api", "`${API_BASE_URL}/api")
    
    with open(comp, "w") as f:
        f.write(comp_content)

print("Replacement complete.")
