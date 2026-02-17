import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const useDashboardMetrics = () =>
  useQuery({ queryKey: ["dashboard-metrics"], queryFn: api.getMetrics, refetchInterval: 30000 });

export const useActivity = () =>
  useQuery({ queryKey: ["dashboard-activity"], queryFn: api.getActivity, refetchInterval: 15000 });

export const useSystemStatus = () =>
  useQuery({ queryKey: ["dashboard-status"], queryFn: api.getSystemStatus, refetchInterval: 10000 });
