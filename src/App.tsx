import { useState, useEffect, useCallback } from 'react';
import { GitCommit, GitPullRequest, AlertCircle, UserPlus } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { StatsCard } from './components/StatsCard';
import ActivityChart from './components/ActivityChart';
import { ActivityTable } from './components/ActivityTable';
import { UserActivityStats } from './components/UserActivityStats';
import { useGitHubActivity } from './lib/hooks';
import { supabase } from './lib/supabase';
import type { Database } from './lib/database.types';

function App() {
  const [selectedRepo, setSelectedRepo] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateRange, setDateRange] = useState<string>('all');
  const [shouldFetchData, setShouldFetchData] = useState<boolean>(false);
  const [newRepoInput, setNewRepoInput] = useState('');
  const [addRepoError, setAddRepoError] = useState('');
  const [repositories, setRepositories] = useState<string[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [searchUsername, setSearchUsername] = useState<string>('');
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [addUserError, setAddUserError] = useState<string>('');

  const { activities, loading, error } = useGitHubActivity(
    selectedRepo,
    dateRange,
    startDate,
    endDate,
    shouldFetchData,
    currentUsername,
    selectedRepos,
    selectedUsers
  );

  useEffect(() => {
    async function fetchRepositories() {
      try {
        const { data, error } = await supabase
          .from('repositories')
          .select('name')
          .returns<Database['public']['Tables']['repositories']['Row'][]>();

        if (error) {
          console.error("Error fetching repositories:", error);
        } else {
          // Filter out any null or empty string values from the fetched data
          const validRepoNames = (data ? data.map(repo => repo.name) : []).filter(name => name);
          setRepositories(validRepoNames);
        }
      } catch (err) {
        console.error("Unexpected error fetching repositories:", err);
      }
    }

    async function fetchUsers() {
      try {
        const { data, error } = await supabase
          .from('commits')
          .select('author')
          .limit(500)
          .returns<Database['public']['Tables']['commits']['Row'][]>();

        if (error) {
          console.error("Error fetching users:", error);
        } else {
          // Extract unique authors from the commits data
          const uniqueUsers = [...new Set(data.map(commit => commit.author))];
          setUsers(uniqueUsers);
        }
      } catch (err) {
        console.error("Unexpected error fetching users:", err);
      }
    }

    fetchRepositories();
    fetchUsers();
  }, []);

  const handleDateRangeChange = (value: string) => {
    setDateRange(value);
    if (value !== 'custom') {
      setStartDate('');
      setEndDate('');
      setShouldFetchData(true);
    } else {
      setStartDate('');
      setEndDate('');
      setShouldFetchData(false);
    }
  };

  const handleApplyCustomDates = () => {
    if (startDate && endDate) {
      setShouldFetchData(true);
    }
  };

  const handleAddRepo = async () => {
    setAddRepoError('');
    try {
      const res = await fetch('http://localhost:3000/api/addRepo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoName: newRepoInput }),
      });

      if (!res.ok) {
        let errorData;
        if (res.status === 404) {
          errorData = { error: `Repository ${newRepoInput} not found on GitHub` };
        } else {
          try {
            errorData = await res.json();
          } catch (e) {
            errorData = { error: `Failed to parse error response: ${res.statusText}` };
          }
        }

        if (errorData) {
          throw new Error(errorData.error || 'Failed to add repository');
        }
      }

      let responseData;
      try {
        responseData = await res.json();
      } catch (e) {
        responseData = { message: 'Repository added successfully', output: await res.text() };
      }

      setShouldFetchData(true);
      setNewRepoInput('');
    } catch (error: any) {
      setAddRepoError(error.message);
    }
  };

  const handleSearchUser = useCallback(() => {
    setCurrentUsername(searchUsername);
    setShouldFetchData(true);
  }, [searchUsername, setCurrentUsername, setShouldFetchData]);

  const handleExpand = useCallback(() => {
    setShouldFetchData(true);
  }, [setShouldFetchData]);

  const handleAddUser = () => {
    if (searchUsername && !users.includes(searchUsername)) {
      setUsers(prevUsers => [...prevUsers, searchUsername]);
      setSearchUsername('');
      setAddUserError('');
    } else if (users.includes(searchUsername)) {
      setAddUserError('User already exists.');
    } else {
      setAddUserError('Please enter a username.');
    }
  };

  const handleDeleteUser = (userToDelete: string) => {
    setUsers(users.filter(user => user !== userToDelete));
    setSelectedUsers(selectedUsers.filter(user => user !== userToDelete));
    setShouldFetchData(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar
        repositories={repositories}
        users={users}
        selectedRepos={selectedRepos}
        selectedUsers={selectedUsers}
        onSelectRepos={setSelectedRepos}
        onSelectUsers={setSelectedUsers}
        onSelectRepo={(repo) => {
          setSelectedRepo(repo);
          setShouldFetchData(true);
        }}
        onDeleteUser={handleDeleteUser}
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
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setShouldFetchData(false);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setShouldFetchData(false);
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleApplyCustomDates}
                      disabled={!startDate || !endDate}
                      className={`px-4 py-2 rounded-lg ${!startDate || !endDate ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                    >
                      Apply
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        
        <div className="p-4 flex items-center gap-2">
          <input
            type="text"
            placeholder="GitHub Username"
            value={searchUsername}
            onChange={(e) => setSearchUsername(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2"
          />
          <button
            onClick={handleAddUser}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add
          </button>
          {addUserError && <p className="text-red-500 text-sm mt-1">{addUserError}</p>}
        </div>

        <div className="p-4">
          <input
            type="text"
            placeholder="Add new repository (owner/repo)"
            value={newRepoInput}
            onChange={(e) => setNewRepoInput(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 mr-2"
          />
          <button onClick={handleAddRepo} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
            Run
          </button>
          {addRepoError && <p className="text-red-500 text-sm mt-1">{addRepoError}</p>}
        </div>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatsCard title="Total Commits" value={activities.filter(a => a.type === 'commit').length} icon={GitCommit} trend={12} />
            <StatsCard title="Pull Requests" value={activities.filter(a => a.type === 'pr').length} icon={GitPullRequest} trend={-5} />
            <StatsCard title="Active Issues" value={activities.filter(a => a.type === 'issue').length} icon={AlertCircle} trend={8} />
          </div>

          <div className="mb-8">
            <ActivityChart activities={activities} />
          </div>

          <div className="grid grid-cols-1 gap-8">
            <UserActivityStats activities={activities} />
            <ActivityTable activities={activities} />
          </div>
          <button
            onClick={handleExpand}
            className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
          >
            Expand
          </button>
        </main>
      </div>
    </div>
  );
}

export default App;
