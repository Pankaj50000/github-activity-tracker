/*
  # GitHub Activity Tables

  1. New Tables
    - `repositories`
      - `id` (uuid, primary key)
      - `name` (text, unique)
      - `created_at` (timestamptz)
    
    - `commits`
      - `id` (uuid, primary key)
      - `repository_id` (uuid, foreign key)
      - `message` (text)
      - `author` (text)
      - `committed_at` (timestamptz)
      - `created_at` (timestamptz)
    
    - `pull_requests`
      - `id` (uuid, primary key)
      - `repository_id` (uuid, foreign key)
      - `title` (text)
      - `author` (text)
      - `created_at` (timestamptz)
    
    - `issues`
      - `id` (uuid, primary key)
      - `repository_id` (uuid, foreign key)
      - `title` (text)
      - `author` (text)
      - `created_at` (timestamptz)
    
    - `reviews`
      - `id` (uuid, primary key)
      - `repository_id` (uuid, foreign key)
      - `comment` (text)
      - `author` (text)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read data
*/

-- Create repositories table
CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create commits table
CREATE TABLE IF NOT EXISTS commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
  message text NOT NULL,
  author text NOT NULL,
  committed_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create pull_requests table
CREATE TABLE IF NOT EXISTS pull_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create issues table
CREATE TABLE IF NOT EXISTS issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid REFERENCES repositories(id) ON DELETE CASCADE,
  comment text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow read access to repositories"
  ON repositories FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow read access to commits"
  ON commits FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow read access to pull_requests"
  ON pull_requests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow read access to issues"
  ON issues FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow read access to reviews"
  ON reviews FOR SELECT TO authenticated
  USING (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS commits_date_idx ON commits(committed_at);
CREATE INDEX IF NOT EXISTS pull_requests_date_idx ON pull_requests(created_at);
CREATE INDEX IF NOT EXISTS issues_date_idx ON issues(created_at);
CREATE INDEX IF NOT EXISTS reviews_date_idx ON reviews(created_at);