import requests

GITHUB_TOKEN = "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"  # Replace with your token
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

try:
    response = requests.get("https://api.github.com/repos/mosip/mosip", headers=HEADERS, timeout=10)
    response.raise_for_status()
    print("✅ GitHub API Response:", response.json())
except requests.exceptions.RequestException as e:
    print(f"❌ API Request Failed: {e}")
