import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Database } from './database.types';
import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';

type Tables = Database['public']['Tables'];
type Activity = {
  type: 'commit' | 'pr' | 'issue' | 'review';
  title: string;
  author: string;
  date: string;
  repository: string;
};

export function useGitHubActivity(
  selectedRepo: string, 
  dateRange: string,
  startDate?: string,
  endDate?: string
) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Calculate date filter
        let dateFilter: Date | null = null;
        let endDateFilter: Date | null = null;
        
        if (dateRange === 'custom' && startDate && endDate) {
          dateFilter = new Date(startDate);
          endDateFilter = new Date(endDate);
        } else {
          const now = new Date();
          switch (dateRange) {
            case '7d':
              dateFilter = new Date(now.setDate(now.getDate() - 7));
              break;
            case '30d':
              dateFilter = new Date(now.setDate(now.getDate() - 30));
              break;
            case '90d':
              dateFilter = new Date(now.setDate(now.getDate() - 90));
              break;
          }
        }

        // Fetch repositories
        const { data: repos, error: reposError } = await supabase
          .from('repositories')
          .select('*')
          .returns<Tables['repositories']['Row'][]>();

        if (reposError) {
          console.error('Error fetching repositories:', reposError);
          throw reposError;
        }

        if (!repos || repos.length === 0) {
          console.log('No repositories found');
          setActivities([]);
          setLoading(false);
          return;
        }

        // Filter repositories if a specific one is selected
        const filteredRepos = selectedRepo === 'all' 
          ? repos 
          : repos.filter(r => r.name === selectedRepo);

        const repoIds = filteredRepos.map(r => r.id);
        const repoNames = filteredRepos.reduce((acc, r) => ({ ...acc, [r.id]: r.name }), {} as Record<string, string>);

        console.log('Fetching data for repositories:', filteredRepos.map(r => r.name));

        // Fetch all activity types in parallel
        const [commitsRes, prsRes, issuesRes, reviewsRes] = await Promise.all([
          // Commits
          supabase
            .from('commits')
            .select('*')
            .in('repository_id', repoIds)
            .gte('committed_at', dateFilter?.toISOString() ?? '1970-01-01')
            .lte('committed_at', endDateFilter?.toISOString() ?? new Date().toISOString())
            .order('committed_at', { ascending: false })
            .returns<Tables['commits']['Row'][]>(),

          // Pull Requests
          supabase
            .from('pull_requests')
            .select('*')
            .in('repository_id', repoIds)
            .gte('created_at', dateFilter?.toISOString() ?? '1970-01-01')
            .lte('created_at', endDateFilter?.toISOString() ?? new Date().toISOString())
            .order('created_at', { ascending: false })
            .returns<Tables['pull_requests']['Row'][]>(),

          // Issues
          supabase
            .from('issues')
            .select('*')
            .in('repository_id', repoIds)
            .gte('created_at', dateFilter?.toISOString() ?? '1970-01-01')
            .lte('created_at', endDateFilter?.toISOString() ?? new Date().toISOString())
            .order('created_at', { ascending: false })
            .returns<Tables['issues']['Row'][]>(),

          // Reviews
          supabase
            .from('reviews')
            .select('*')
            .in('repository_id', repoIds)
            .gte('created_at', dateFilter?.toISOString() ?? '1970-01-01')
            .lte('created_at', endDateFilter?.toISOString() ?? new Date().toISOString())
            .order('created_at', { ascending: false })
            .returns<Tables['reviews']['Row'][]>()
        ]);

        console.log('Data fetched:', {
          commits: commitsRes.data?.length ?? 0,
          prs: prsRes.data?.length ?? 0,
          issues: issuesRes.data?.length ?? 0,
          reviews: reviewsRes.data?.length ?? 0
        });

        // Transform and combine all activities
        const allActivities: Activity[] = [
          ...(commitsRes.data?.map(c => ({
            type: 'commit' as const,
            title: c.message,
            author: c.author,
            date: c.committed_at,
            repository: repoNames[c.repository_id]
          })) ?? []),
          ...(prsRes.data?.map(p => ({
            type: 'pr' as const,
            title: p.title,
            author: p.author,
            date: p.created_at,
            repository: repoNames[p.repository_id]
          })) ?? []),
          ...(issuesRes.data?.map(i => ({
            type: 'issue' as const,
            title: i.title,
            author: i.author,
            date: i.created_at,
            repository: repoNames[i.repository_id]
          })) ?? []),
          ...(reviewsRes.data?.map(r => ({
            type: 'review' as const,
            title: r.comment,
            author: r.author,
            date: r.created_at,
            repository: repoNames[r.repository_id]
          })) ?? [])
        ];

        // Sort all activities by date in descending order
        const sortedActivities = allActivities.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        console.log('Total activities:', sortedActivities.length);
        setActivities(sortedActivities);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to fetch activity data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedRepo, dateRange, startDate, endDate]);

  return { activities, loading, error };
}