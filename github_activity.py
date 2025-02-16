import os
import json
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client, Client
import requests
import time
import argparse

# Load environment variables
load_dotenv()

# GitHub API Token
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
if not GITHUB_TOKEN:
    raise ValueError("GitHub token is missing. Set GITHUB_TOKEN in environment variables.")

# Supabase configuration
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Changed to use service role key
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

def parse_date(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)

def format_date(date_str: str) -> str:
    """Safely format a date string to ISO format."""
    try:
        if not date_str:
            return datetime.now(timezone.utc).isoformat()
        # Remove 'Z' and add timezone info if needed
        clean_date = date_str.replace('Z', '+00:00')
        # Parse and format the date
        parsed_date = datetime.fromisoformat(clean_date)
        return parsed_date.isoformat()
    except (ValueError, TypeError):
        # Return current time if date is invalid
        return datetime.now(timezone.utc).isoformat()

def load_repositories():
    config_file = "config.properties"
    if not os.path.exists(config_file):
        raise FileNotFoundError("config.properties not found!")

    with open(config_file, "r") as file:
        return [line.strip().split("=")[0] for line in file]

def fetch_paginated_data(url, since_date=None, until_date=None):
    items = []
    page = 1
    
    while True:
        params = {"page": page, "per_page": 100}
        if since_date:
            params["since"] = since_date.isoformat()
        if until_date:
            params["until"] = until_date.isoformat()
            
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
            
        # Filter items by date range
        if until_date:
            new_items = [
                item for item in new_items 
                if datetime.fromisoformat(format_date(item.get('created_at', ''))) <= until_date
            ]
            
        items.extend(new_items)
        
        if len(new_items) < 100:
            break
            
        page += 1
        
    return items

def get_or_create_repository(repo_name):
    """Get existing repository or create a new one."""
    # Try to get existing repository
    result = supabase.table("repositories").select("*").eq("name", repo_name).execute()
    
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]
    
    # Create new repository if it doesn't exist
    result = supabase.table("repositories").insert({"name": repo_name}).execute()
    return result.data[0]["id"]

def clear_existing_data(repo_id, since_date=None, until_date=None):
    """Clear existing activity data for the given repository and date range."""
    tables = ["commits", "pull_requests", "issues", "reviews"]
    
    for table in tables:
        query = supabase.table(table).delete().eq("repository_id", repo_id)
        
        if since_date:
            date_field = "committed_at" if table == "commits" else "created_at"
            query = query.gte(date_field, since_date.isoformat())
        
        if until_date:
            date_field = "committed_at" if table == "commits" else "created_at"
            query = query.lte(date_field, until_date.isoformat())
            
        query.execute()

def store_repository_data(repo_name, since_date=None, until_date=None):
    print(f"Processing {repo_name}...")
    base_url = f"https://api.github.com/repos/{repo_name}"
    
    try:
        # Get or create repository
        repo_id = get_or_create_repository(repo_name)
        print(f"Successfully found/created repository: {repo_name}")
        
        # Clear existing data for the date range
        print("Clearing existing data...")
        clear_existing_data(repo_id, since_date, until_date)
        
        # Fetch and store commits
        print("Fetching commits...")
        commits = fetch_paginated_data(f"{base_url}/commits", since_date, until_date)
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
            print(f"Stored {len(commit_data)} commits")

        # Fetch and store PRs
        print("Fetching pull requests...")
        prs = fetch_paginated_data(f"{base_url}/pulls", since_date, until_date)
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
            print(f"Stored {len(pr_data)} pull requests")

        # Fetch and store issues
        print("Fetching issues...")
        issues = fetch_paginated_data(f"{base_url}/issues", since_date, until_date)
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
            print(f"Stored {len(issue_data)} issues")

        # Fetch and store reviews
        print("Fetching reviews...")
        reviews = []
        for pr in prs[:10]:
            pr_reviews = fetch_paginated_data(f"{base_url}/pulls/{pr['number']}/reviews", since_date, until_date)
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
            print(f"Stored {len(reviews)} reviews")

        print(f"✅ Successfully processed {repo_name}")
        
    except Exception as e:
        print(f"❌ Error processing {repo_name}: {str(e)}")

def main():
    parser = argparse.ArgumentParser(description='Fetch GitHub activity within a date range')
    parser.add_argument('--since', help='Start date (YYYY-MM-DD)', type=str)
    parser.add_argument('--until', help='End date (YYYY-MM-DD)', type=str)
    
    args = parser.parse_args()
    
    since_date = parse_date(args.since) if args.since else None
    until_date = parse_date(args.until) if args.until else None
    
    try:
        repos = load_repositories()
        for repo in repos:
            try:
                store_repository_data(repo, since_date, until_date)
            except Exception as e:
                print(f"❌ Error processing {repo}: {str(e)}")
                continue  # Continue with next repository even if one fails
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    main()