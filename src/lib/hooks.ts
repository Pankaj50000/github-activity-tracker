import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type Tables = Database['public']['Tables'];

type Activity = {
  type: 'commit' | 'pr' | 'issue' | 'review';
  title: string;
  author: string;
  date: string;
  repository: string;
};

interface UseGitHubActivityResult {
  activities: Activity[];
  loading: boolean;
  error: string | null;
}

export function useGitHubActivity(
  selectedRepo: string,
  dateRange: string,
  startDate?: string,
  endDate?: string,
  shouldFetchData: boolean = true
): UseGitHubActivityResult {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shouldFetchData) {
      if (loading) setLoading(false);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // For custom range, only proceed if both dates are provided
        if (dateRange === 'custom' && (!startDate || !endDate)) {
          setLoading(false);
          return;
        }

        let dateFilter: Date | null = null;
        let endDateFilter: Date | null = null;

        if (dateRange === 'custom' && startDate && endDate) {
          dateFilter = new Date(startDate);
          endDateFilter = new Date(endDate);
          
          // Set time to beginning and end of day respectively
          dateFilter.setHours(0, 0, 0, 0);
          endDateFilter.setHours(23, 59, 59, 999);
        } else if (dateRange !== 'all') {
          const now = new Date();
          now.setHours(23, 59, 59, 999);
          endDateFilter = new Date(now);
          
          dateFilter = new Date(now);
          switch (dateRange) {
            case '7d':
              dateFilter.setDate(dateFilter.getDate() - 7);
              break;
            case '30d':
              dateFilter.setDate(dateFilter.getDate() - 30);
              break;
            case '90d':
              dateFilter.setDate(dateFilter.getDate() - 90);
              break;
          }
          dateFilter.setHours(0, 0, 0, 0);
        }

        // Fetch repositories
        const { data: repos, error: reposError } = await supabase
          .from('repositories')
          .select('*')
          .abortSignal(signal)
          .returns<Tables['repositories']['Row'][]>();

        if (reposError) throw reposError;
        if (!repos || repos.length === 0) {
          setActivities([]);
          setLoading(false);
          return;
        }

        // Filter repositories
        const filteredRepos =
          selectedRepo === 'all' ? repos : repos.filter((r) => r.name === selectedRepo);

        const repoIds = filteredRepos.map((r) => r.id);
        const repoNames = filteredRepos.reduce(
          (acc, r) => ({ ...acc, [r.id]: r.name }),
          {} as Record<string, string>
        );

        // Fetch all activities using method chaining
        const [commitsRes, prsRes, issuesRes, reviewsRes] = await Promise.all([
          // For commits
          (() => {
            // Using method chaining instead of reassignment
            const query = supabase
              .from('commits')
              .select('*')
              .in('repository_id', repoIds);
            
            const withDateFilter = dateFilter 
              ? query.gte('committed_at', dateFilter.toISOString()) 
              : query;
              
            const withEndDateFilter = endDateFilter 
              ? withDateFilter.lte('committed_at', endDateFilter.toISOString()) 
              : withDateFilter;
            
            return withEndDateFilter
              .order('committed_at', { ascending: false })
              .abortSignal(signal)
              .returns<Tables['commits']['Row'][]>();
          })(),

          // For PRs
          (() => {
            const query = supabase
              .from('pull_requests')
              .select('*')
              .in('repository_id', repoIds);
            
            const withDateFilter = dateFilter 
              ? query.gte('created_at', dateFilter.toISOString()) 
              : query;
              
            const withEndDateFilter = endDateFilter 
              ? withDateFilter.lte('created_at', endDateFilter.toISOString()) 
              : withDateFilter;
            
            return withEndDateFilter
              .order('created_at', { ascending: false })
              .abortSignal(signal)
              .returns<Tables['pull_requests']['Row'][]>();
          })(),

          // For issues
          (() => {
            const query = supabase
              .from('issues')
              .select('*')
              .in('repository_id', repoIds);
            
            const withDateFilter = dateFilter 
              ? query.gte('created_at', dateFilter.toISOString()) 
              : query;
              
            const withEndDateFilter = endDateFilter 
              ? withDateFilter.lte('created_at', endDateFilter.toISOString()) 
              : withDateFilter;
            
            return withEndDateFilter
              .order('created_at', { ascending: false })
              .abortSignal(signal)
              .returns<Tables['issues']['Row'][]>();
          })(),

          // For reviews
          (() => {
            const query = supabase
              .from('reviews')
              .select('*')
              .in('repository_id', repoIds);
            
            const withDateFilter = dateFilter 
              ? query.gte('created_at', dateFilter.toISOString()) 
              : query;
              
            const withEndDateFilter = endDateFilter 
              ? withDateFilter.lte('created_at', endDateFilter.toISOString()) 
              : withDateFilter;
            
            return withEndDateFilter
              .order('created_at', { ascending: false })
              .abortSignal(signal)
              .returns<Tables['reviews']['Row'][]>();
          })(),
        ]);

        if (signal.aborted) return;

        // Combine all activities
        const allActivities: Activity[] = [
          ...(commitsRes.data?.map((c) => ({
            type: 'commit' as const,
            title: c.message,
            author: c.author,
            date: c.committed_at,
            repository: repoNames[c.repository_id],
          })) ?? []),
          ...(prsRes.data?.map((p) => ({
            type: 'pr' as const,
            title: p.title,
            author: p.author,
            date: p.created_at,
            repository: repoNames[p.repository_id],
          })) ?? []),
          ...(issuesRes.data?.map((i) => ({
            type: 'issue' as const,
            title: i.title,
            author: i.author,
            date: i.created_at,
            repository: repoNames[i.repository_id],
          })) ?? []),
          ...(reviewsRes.data?.map((r) => ({
            type: 'review' as const,
            title: r.comment,
            author: r.author,
            date: r.created_at,
            repository: repoNames[r.repository_id],
          })) ?? []),
        ];

        // Sort activities by date (latest first)
        setActivities(
          allActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        );
      } catch (err: any) {
        if (signal.aborted) return;
        console.error('Error fetching GitHub activity:', err);
        setError(err.message || 'Failed to fetch activity data');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    fetchData();
    return () => controller.abort();
  }, [selectedRepo, dateRange, startDate, endDate, shouldFetchData]);

  return { activities, loading, error };
}