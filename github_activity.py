import os
import json
from datetime import datetime, timezone, timedelta
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
        return parsed_date.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError) as e:
        print(f"❌ Date formatting error: {e}. Using current time.")
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
        latest_date = datetime.fromisoformat(result.data[0][date_field])
        if latest_date < datetime.now(timezone.utc) - timedelta(days=365):
            print(f"⚠️  Latest date from {table_name} is too old. Using a more recent date.")
            return datetime.now(timezone.utc) - timedelta(days=7)
        return latest_date
    return datetime.min.replace(tzinfo=timezone.utc)

def fetch_paginated_data(url, since_date=None):
    items = []
    page = 1
    
    while True:
        params = {"page": page, "per_page": 100}
        if since_date and since_date > datetime.min.replace(tzinfo=timezone.utc):
            params["since"] = since_date.isoformat()
            
        print(f"Fetching {url} page {page}...")
        print(f"Params: {params}")
            
        response = requests.get(url, headers=HEADERS, params=params)
        
        if response.status_code == 403:
            reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
            wait_time = max(reset_time - time.time(), 0)
            if wait_time > 0:
                print(f"Rate limit reached. Waiting {wait_time:.0f} seconds...")
                time.sleep(wait_time + 1)
                continue
            
        if response.status_code == 422:
            print(f"❌ Error 422: Validation failed for {url}. Skipping this endpoint.")
            break
            
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

def check_for_duplicates(table_name, repo_id, data, match_fields):
    """Check for duplicates using multiple fields for matching."""
    if not data:
        return []
    
    new_items = []
    for item in data:
        # Build query conditions
        query = supabase.table(table_name).select("*").eq("repository_id", repo_id)
        
        # Add all matching conditions
        for field in match_fields:
            if field in item and item[field]:
                query = query.eq(field, item[field])
        
        # Execute the query
        result = query.execute()
        
        # If no matches found, add to new items
        if not result.data:
            new_items.append(item)
    
    return new_items

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
        
        # Prepare commit data
        commit_data = []
        for c in commits:
            try:
                commit_item = {
                    "repository_id": repo_id,
                    "message": c["commit"]["message"],
                    "author": c["commit"]["author"]["name"],
                    "committed_at": format_date(c["commit"]["author"]["date"])
                }
                commit_data.append(commit_item)
            except Exception as e:
                print(f"❌ Error processing commit: {str(e)}")
                continue
        
        # Check for duplicates using message and author and committed_at
        new_commits = check_for_duplicates("commits", repo_id, commit_data, 
                                         ["message", "author", "committed_at"])
        
        if new_commits:
            supabase.table("commits").insert(new_commits).execute()
            print(f"Stored {len(new_commits)} new commits")
        else:
            print("No new commits to store")

        # Fetch and store new PRs
        print("Fetching new pull requests...")
        prs = fetch_paginated_data(f"{base_url}/pulls", latest_pr_date)
        
        # Prepare PR data
        pr_data = []
        for p in prs:
            try:
                pr_item = {
                    "repository_id": repo_id,
                    "title": p["title"],
                    "author": p["user"]["login"],
                    "created_at": format_date(p["created_at"])
                }
                pr_data.append(pr_item)
            except Exception as e:
                print(f"❌ Error processing PR: {str(e)}")
                continue
        
        # Check for duplicates using title, author and created_at
        new_prs = check_for_duplicates("pull_requests", repo_id, pr_data, 
                                     ["title", "author", "created_at"])
        
        if new_prs:
            supabase.table("pull_requests").insert(new_prs).execute()
            print(f"Stored {len(new_prs)} new pull requests")
        else:
            print("No new pull requests to store")

        # Fetch and store new issues
        print("Fetching new issues...")
        try:
            issues = fetch_paginated_data(f"{base_url}/issues", latest_issue_date)
            
            # Prepare issue data (excluding PRs)
            issue_data = []
            for i in issues:
                if "pull_request" not in i:
                    try:
                        issue_item = {
                            "repository_id": repo_id,
                            "title": i["title"],
                            "author": i["user"]["login"],
                            "created_at": format_date(i["created_at"])
                        }
                        issue_data.append(issue_item)
                    except Exception as e:
                        print(f"❌ Error processing issue: {str(e)}")
                        continue
            
            # Check for duplicates using title, author and created_at
            new_issues = check_for_duplicates("issues", repo_id, issue_data, 
                                           ["title", "author", "created_at"])
            
            if new_issues:
                supabase.table("issues").insert(new_issues).execute()
                print(f"Stored {len(new_issues)} new issues")
            else:
                print("No new issues to store")
        except Exception as e:
            print(f"❌ Error fetching issues: {str(e)}")

        # Fetch and store new reviews
        print("Fetching new reviews...")
        all_reviews = []
        for pr in prs:
            pr_reviews = fetch_paginated_data(f"{base_url}/pulls/{pr['number']}/reviews")
            for r in pr_reviews:
                try:
                    review_item = {
                        "repository_id": repo_id,
                        "comment": r["body"] if r["body"] else "No comment provided",
                        "author": r["user"]["login"],
                        "created_at": format_date(r["submitted_at"])
                    }
                    all_reviews.append(review_item)
                except Exception as e:
                    print(f"❌ Error processing review: {str(e)}")
                    continue
        
        # Check for duplicates using comment, author and created_at
        new_reviews = check_for_duplicates("reviews", repo_id, all_reviews, 
                                        ["comment", "author", "created_at"])
        
        if new_reviews:
            supabase.table("reviews").insert(new_reviews).execute()
            print(f"Stored {len(new_reviews)} new reviews")
        else:
            print("No new reviews to store")

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