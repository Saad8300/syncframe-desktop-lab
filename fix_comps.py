import re

components = [
    "frontend/src/components/AudioMergerPage.tsx",
    "frontend/src/components/ScriptTimestampPage.tsx",
    "frontend/src/components/BatchVideoGeneratorPage.tsx"
]

for comp in components:
    with open(comp, "r") as f:
        content = f.read()
    
    # Replace import { BASE_URL } with import { API_BASE_URL, apiUrl }
    content = content.replace("import { BASE_URL }", "import { API_BASE_URL, apiUrl }")
    content = content.replace("import { BASE_URL,", "import { API_BASE_URL, apiUrl,")
    
    # Replace fetch(`${BASE_URL}/...`) with fetch(apiUrl('/...'))
    content = re.sub(r"`\$\{BASE_URL\}(/[^`]+)`", r"apiUrl('\1')", content)
    
    # For anything like `${BASE_URL}${data.url}`, change it to `${API_BASE_URL}${data.url}`
    content = content.replace("`${BASE_URL}", "`${API_BASE_URL}")
    
    with open(comp, "w") as f:
        f.write(content)

print("Components updated.")
