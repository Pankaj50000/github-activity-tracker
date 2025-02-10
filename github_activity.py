import os
import json
import requests
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# GitHub API Token
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
if not GITHUB_TOKEN:
    raise ValueError("GitHub token is missing. Set GITHUB_TOKEN in environment variables.")

# GitHub API Headers
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

# Define directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")

# Ensure public/data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def load_repositories():
    config_file = os.path.join(BASE_DIR, "config.properties")
    repos = {}
    repo_list = []

    if not os.path.exists(config_file):
        raise FileNotFoundError("config.properties not found!")

    with open(config_file, "r") as file:
        for line in file:
            repo_name, file_name = line.strip().split("=")
            # Ensure .json extension
            if not file_name.endswith('.json'):
                file_name += '.json'
            repos[repo_name] = os.path.join(DATA_DIR, file_name)
            repo_list.append(repo_name)

    return repos, repo_list

def fetch_paginated_data(url, max_items=100):
    items = []
    page = 1
    
    while True:
        response = requests.get(
            f"{url}?page={page}&per_page=100",
            headers=HEADERS
        )
        
        # Handle rate limiting
        if response.status_code == 403:
            reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
            wait_time = max(reset_time - time.time(), 0)
            if wait_time > 0:
                print(f"Rate limit reached. Waiting {wait_time:.0f} seconds...")
                time.sleep(wait_time + 1)
                continue
            
        # Handle other errors
        if response.status_code != 200:
            print(f"Error fetching {url}: {response.status_code}")
            break
            
        new_items = response.json()
        if not new_items:
            break
            
        items.extend(new_items)
        
        # Stop if we have enough items or there are no more pages
        if len(items) >= max_items or len(new_items) < 100:
            break
            
        page += 1
        
    return items[:max_items]

def fetch_github_activity(repo_name):
    print(f"Fetching data for {repo_name}...")
    base_url = f"https://api.github.com/repos/{repo_name}"
    
    # Fetch commits (last 100)
    commits = fetch_paginated_data(f"{base_url}/commits", 100)
    commit_data = [
        {
            "author": c["commit"]["author"]["name"],
            "message": c["commit"]["message"],
            "date": c["commit"]["author"]["date"]
        }
        for c in commits
    ]

    # Fetch PRs (last 100)
    prs = fetch_paginated_data(f"{base_url}/pulls", 100)
    pr_data = [
        {
            "title": p["title"],
            "author": p["user"]["login"],
            "date": p["created_at"]
        }
        for p in prs
    ]

    # Fetch issues (last 100)
    issues = fetch_paginated_data(f"{base_url}/issues", 100)
    issue_data = [
        {
            "title": i["title"],
            "author": i["user"]["login"],
            "date": i["created_at"]
        }
        for i in issues if "pull_request" not in i  # Exclude PRs from issues
    ]

    # Fetch reviews (last 100)
    reviews = []
    for pr in prs[:10]:  # Limit to last 10 PRs to avoid too many API calls
        pr_reviews = fetch_paginated_data(f"{base_url}/pulls/{pr['number']}/reviews", 10)
        reviews.extend([
            {
                "author": r["user"]["login"],
                "comment": r["body"] if r["body"] else "No comment provided",
                "date": r["submitted_at"]
            }
            for r in pr_reviews
        ])

    return {
        "repository": repo_name,
        "commits": commit_data,
        "pull_requests": pr_data,
        "issues": issue_data,
        "reviews": reviews
    }

def save_json_data():
    repos, repo_names = load_repositories()

    # Save repository list
    repos_json_path = os.path.join(DATA_DIR, "repos.json")
    with open(repos_json_path, "w") as json_file:
        json.dump(repo_names, json_file, indent=4)
    print("✅ Repository list saved to repos.json")

    # Fetch and save repository activity
    for repo, file_path in repos.items():
        try:
            data = fetch_github_activity(repo)
            with open(file_path, "w") as json_file:
                json.dump(data, json_file, indent=4)
            print(f"✅ Data saved: {file_path}")
        except Exception as e:
            print(f"❌ Error processing {repo}: {str(e)}")

if __name__ == "__main__":
    save_json_data()