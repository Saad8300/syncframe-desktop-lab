import re

API_TS_FILE = "frontend/src/utils/api.ts"

with open(API_TS_FILE, "r") as f:
    content = f.read()

# Replace `${BASE_URL}/api/...` with `apiUrl('/api/...')`
content = re.sub(r"`\$\{BASE_URL\}(/[^`]+)`", r"apiUrl('\1')", content)

# Also fix the health check one which was defined as: const url = `${BASE_URL}/api/health`
content = re.sub(r"const url = `\$\{BASE_URL\}(/[^`]+)`", r"const url = apiUrl('\1')", content)

with open(API_TS_FILE, "w") as f:
    f.write(content)
print("api.ts updated.")
