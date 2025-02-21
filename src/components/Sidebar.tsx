import React from 'react';
import { GitBranch, ChevronDown } from 'lucide-react';

interface SidebarProps {
  repositories: string[];
  selectedRepo: string;
  onSelectRepo: (repo: string) => void;
}


export function Sidebar({ repositories, selectedRepo, onSelectRepo }: SidebarProps) {
  console.log('Selected Repo:', selectedRepo);

  return (
    <div className="w-64 bg-white h-screen fixed left-0 top-0 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-800 flex items-center">
          <GitBranch className="w-5 h-5 mr-2" />
          Repositories
        </h2>
      </div>
      <div className="overflow-y-auto flex-1">
        <div className="p-2">
          <button
            onClick={() => onSelectRepo('all')}
            className={`w-full text-left px-4 py-2 rounded-lg mb-1 ${
              selectedRepo === 'all'
                ? 'bg-blue-50 text-blue-600'
                : 'hover:bg-gray-50'
            }`}
          >
            All Repositories
          </button>
          {repositories.map((repo) => (
            <button
              key={repo}
              onClick={() => onSelectRepo(repo)}
              className={`w-full text-left px-4 py-2 rounded-lg mb-1 flex items-center justify-between ${
                selectedRepo === repo
                
                  ? 'bg-blue-50 text-blue-600'
                  : 'hover:bg-gray-50'
              }`}
            >
              <span className="truncate">{repo}</span>
              <ChevronDown className="w-4 h-4 opacity-50" />
            </button>
          ))}


        </div>
      </div>
    </div>
    
  );
}