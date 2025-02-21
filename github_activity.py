import os
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import requests
import time
import sys

# Load environment variables
load_dotenv()

# GitHub API Token
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
if not GITHUB_TOKEN:
    raise ValueError("GitHub token is missing. Set GITHUB_TOKEN in environment variables.")

# Supabase configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase credentials are missing. Check .env file for VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

print(f"Using Supabase URL: {SUPABASE_URL}")
print("Supabase key is configured")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# GitHub API Headers
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

def format_date(date_str: str) -> str:
    """Safely format a date string to ISO format."""
    try:
        if not date_str:
            return datetime.now(timezone.utc).isoformat()
        clean_date = date_str.replace('Z', '+00:00')
        parsed_date = datetime.fromisoformat(clean_date)
        return parsed_date.isoformat()
    except (ValueError, TypeError):
        return datetime.now(timezone.utc).isoformat()

def load_repositories():
    config_file = "config.properties"
    if not os.path.exists(config_file):
        raise FileNotFoundError("config.properties not found!")

    with open(config_file, "r") as file:
        return [line.strip().split("=")[0] for line in file]

def get_latest_date(table_name: str, repo_id: int, date_field: str) -> datetime:
    """Get the latest date from a specific table for a repository."""
    result = supabase.table(table_name)\
        .select(date_field)\
        .eq("repository_id", repo_id)\
        .order(date_field, desc=True)\
        .limit(1)\
        .execute()
    
    if result.data and len(result.data) > 0:
        return datetime.fromisoformat(result.data[0][date_field])
    return datetime.min.replace(tzinfo=timezone.utc)

def fetch_paginated_data(url, since_date=None):
    items = []
    page = 1
    
    while True:
        params = {"page": page, "per_page": 100}
        if since_date:
            params["since"] = since_date.isoformat()
            
        response = requests.get(url, headers=HEADERS, params=params)
        
        if response.status_code == 403:
            reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
            wait_time = max(reset_time - time.time(), 0)
            if wait_time > 0:
                print(f"Rate limit reached. Waiting {wait_time:.0f} seconds...")
                time.sleep(wait_time + 1)
                continue
            
        if response.status_code != 200:
            print(f"Error fetching {url}: {response.status_code}")
            break
            
        new_items = response.json()
        if not new_items:
            break
            
        items.extend(new_items)
        
        if len(new_items) < 100:
            break
            
        page += 1
        
    return items

def get_or_create_repository(repo_name):
    """Get existing repository or create a new one."""
    result = supabase.table("repositories").select("*").eq("name", repo_name).execute()
    
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]
    
    result = supabase.table("repositories").insert({"name": repo_name}).execute()
    return result.data[0]["id"]

def store_repository_data(repo_name):
    print(f"Processing {repo_name}...")
    base_url = f"https://api.github.com/repos/{repo_name}"
    
    try:
        repo_id = get_or_create_repository(repo_name)
        print(f"Successfully found/created repository: {repo_name}")
        
        # Get latest dates from each table
        latest_commit_date = get_latest_date("commits", repo_id, "committed_at")
        latest_pr_date = get_latest_date("pull_requests", repo_id, "created_at")
        latest_issue_date = get_latest_date("issues", repo_id, "created_at")
        latest_review_date = get_latest_date("reviews", repo_id, "created_at")
        
        # Fetch and store new commits
        print("Fetching new commits...")
        commits = fetch_paginated_data(f"{base_url}/commits", latest_commit_date)
        commit_data = [
            {
                "repository_id": repo_id,
                "message": c["commit"]["message"],
                "author": c["commit"]["author"]["name"],
                "committed_at": format_date(c["commit"]["author"]["date"])
            }
            for c in commits
        ]
        if commit_data:
            supabase.table("commits").insert(commit_data).execute()
            print(f"Stored {len(commit_data)} new commits")

        # Fetch and store new PRs
        print("Fetching new pull requests...")
        prs = fetch_paginated_data(f"{base_url}/pulls", latest_pr_date)
        pr_data = [
            {
                "repository_id": repo_id,
                "title": p["title"],
                "author": p["user"]["login"],
                "created_at": format_date(p["created_at"])
            }
            for p in prs
        ]
        if pr_data:
            supabase.table("pull_requests").insert(pr_data).execute()
            print(f"Stored {len(pr_data)} new pull requests")

        # Fetch and store new issues
        print("Fetching new issues...")
        issues = fetch_paginated_data(f"{base_url}/issues", latest_issue_date)
        issue_data = [
            {
                "repository_id": repo_id,
                "title": i["title"],
                "author": i["user"]["login"],
                "created_at": format_date(i["created_at"])
            }
            for i in issues if "pull_request" not in i
        ]
        if issue_data:
            supabase.table("issues").insert(issue_data).execute()
            print(f"Stored {len(issue_data)} new issues")

        # Fetch and store new reviews
        print("Fetching new reviews...")
        reviews = []
        for pr in prs[:10]:  # Limiting to latest 10 PRs for efficiency
            pr_reviews = fetch_paginated_data(f"{base_url}/pulls/{pr['number']}/reviews", latest_review_date)
            reviews.extend([
                {
                    "repository_id": repo_id,
                    "comment": r["body"] if r["body"] else "No comment provided",
                    "author": r["user"]["login"],
                    "created_at": format_date(r["submitted_at"])
                }
                for r in pr_reviews
            ])
        if reviews:
            supabase.table("reviews").insert(reviews).execute()
            print(f"Stored {len(reviews)} new reviews")

        print(f"✅ Successfully processed {repo_name}")
        
    except Exception as e:
        print(f"❌ Error processing {repo_name}: {str(e)}")

def main():
    try:
        # Set the standard output encoding to UTF-8
        sys.stdout.reconfigure(encoding='utf-8')
        repos = load_repositories()
        for repo in repos:
            try:
                store_repository_data(repo)
            except Exception as e:
                print(f"❌ Error processing {repo}: {str(e)}")
                continue
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    main()
