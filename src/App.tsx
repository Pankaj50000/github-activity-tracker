import { useState, useEffect } from 'react';
import { GitCommit, GitPullRequest, AlertCircle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { StatsCard } from './components/StatsCard';
import { ActivityChart } from './components/ActivityChart';
import { ActivityTable } from './components/ActivityTable';
import { UserActivityStats } from './components/UserActivityStats';
import type { RepositoryData } from './types';

function App() {
  const [data, setData] = useState<RepositoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all'); // Default to "all"
  const [filteredData, setFilteredData] = useState<RepositoryData[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log('Fetching repository data...');

        const reposResponse = await fetch('/data/repos.json');
        if (!reposResponse.ok) {
          throw new Error('Failed to fetch repository list');
        }
        const repoNames = await reposResponse.json() as string[];
        console.log('Found repositories:', repoNames.length);

        const repoDataPromises = repoNames.map(async (repoName) => {
          const filename = `mosip_${repoName.split('/')[1].toLowerCase()}.json`;
          try {
            console.log('Fetching:', filename);
            const response = await fetch(`/data/${filename}`);
            if (!response.ok) {
              console.error(`Failed to fetch ${filename}: ${response.status} ${response.statusText}`);
              return null;
            }
            const data = await response.json();
            console.log(`Successfully loaded ${filename}`);
            return {
              ...data,
              repository: repoName
            } as RepositoryData;
          } catch (err) {
            console.error(`Error loading ${filename}:`, err);
            return null;
          }
        });

        const results = await Promise.all(repoDataPromises);
        const validResults = results.filter((result): result is RepositoryData => result !== null);
        console.log('Successfully loaded repositories:', validResults.length);
        
        setData(validResults);
        setError(null);
      } catch (err) {
        setError('Failed to fetch repository data');
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedRepo === 'all') {
      setFilteredData(data);
    } else {
      setFilteredData(data.filter(repo => repo.repository === selectedRepo));
    }
  }, [selectedRepo, data]);

  const repositories = data.map(repo => repo.repository);

  // ✅ Fix: Get date limit only if a specific filter is selected
  const getDateLimit = () => {
    if (dateRange === 'all') return null; // No filtering applied
    const now = new Date();
    switch (dateRange) {
      case '7d':
        return new Date(now.setDate(now.getDate() - 7));
      case '30d':
        return new Date(now.setDate(now.getDate() - 30));
      case '90d':
        return new Date(now.setDate(now.getDate() - 90));
      default:
        return null;
    }
  };

  const dateLimit = getDateLimit();

  // ✅ Fix: Apply date filter only if a date range is selected
  const activities = filteredData.flatMap(repo => [
    ...(repo.commits?.map(commit => ({
      type: 'commit' as const,
      title: commit.message,
      author: commit.author,
      date: commit.date,
      repository: repo.repository,
    })) || []),
    ...(repo.pull_requests?.map(pr => ({
      type: 'pr' as const,
      title: pr.title,
      author: pr.author,
      date: pr.date,
      repository: repo.repository,
    })) || []),
    ...(repo.issues?.map(issue => ({
      type: 'issue' as const,
      title: issue.title,
      author: issue.author,
      date: issue.date,
      repository: repo.repository,
    })) || []),
    ...(repo.reviews?.map(review => ({
      type: 'review' as const,
      title: review.comment,
      author: review.author,
      date: review.date,
      repository: repo.repository,
    })) || []),
  ]).filter(activity => (dateLimit ? new Date(activity.date) >= dateLimit : true));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl text-gray-600">Loading repository data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar
        repositories={repositories}
        selectedRepo={selectedRepo}
        onSelectRepo={setSelectedRepo}
      />
      
      <div className="pl-64">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">
                {selectedRepo === 'all' ? 'All Repositories' : selectedRepo}
              </h1>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Time</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard
              title="Total Commits"
              value={activities.filter(a => a.type === 'commit').length}
              icon={GitCommit}
              trend={12}
            />
            <StatsCard
              title="Pull Requests"
              value={activities.filter(a => a.type === 'pr').length}
              icon={GitPullRequest}
              trend={-5}
            />
            <StatsCard
              title="Active Issues"
              value={activities.filter(a => a.type === 'issue').length}
              icon={AlertCircle}
              trend={8}
            />
          </div>

          <div className="mb-8">
            <ActivityChart activities={activities} />
          </div>

          <div className="grid grid-cols-1 gap-8">
            <UserActivityStats activities={activities} />
            <ActivityTable activities={activities} />
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
