import { useState } from 'react';
import { GitCommit, GitPullRequest, AlertCircle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { StatsCard } from './components/StatsCard';
import { ActivityChart } from './components/ActivityChart';
import { ActivityTable } from './components/ActivityTable';
import { UserActivityStats } from './components/UserActivityStats';
import { useGitHubActivity } from './lib/hooks';

function App() {
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('custom');
  
  const { activities, loading, error } = useGitHubActivity(selectedRepo, dateRange, startDate, endDate);

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

  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    if (value !== 'custom') {
      setStartDate('');
      setEndDate('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar
        repositories={[...new Set(activities.map(a => a.repository))]}
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
              <div className="flex items-center gap-4">
                <select
                  value={dateRange}
                  onChange={(e) => handleDateRangeChange(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="custom">Custom Range</option>
                </select>
                
                {dateRange === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>
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