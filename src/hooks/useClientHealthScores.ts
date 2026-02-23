import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClientHealthScore {
  clientName: string;
  score: "green" | "yellow" | "red";
  details: {
    implementationRate: number | null; // 0-100%
    daysSinceLastAudit: number | null;
    openPipelineItems: number;
  };
}

export function useClientHealthScores() {
  return useQuery({
    queryKey: ["client-health-scores"],
    queryFn: async () => {
      const [
        { data: audits },
        { data: implementations },
        { data: pipelineProjects },
      ] = await Promise.all([
        supabase.from("cro_audits").select("id, client_name, created_at, status, recommendations").eq("status", "completed"),
        supabase.from("client_implementations").select("audit_id, status"),
        supabase.from("pipeline_projects").select("client, stages"),
      ]);

      const healthMap: Record<string, ClientHealthScore> = {};

      // Build per-client audit data
      const clientAudits: Record<string, { latestDate: string; totalRecs: number; auditIds: string[] }> = {};
      for (const audit of audits || []) {
        const name = audit.client_name?.toLowerCase().trim();
        if (!name) continue;
        const recs = Array.isArray(audit.recommendations) ? audit.recommendations.length : 0;
        if (!clientAudits[name]) {
          clientAudits[name] = { latestDate: audit.created_at, totalRecs: recs, auditIds: [audit.id] };
        } else {
          if (audit.created_at > clientAudits[name].latestDate) {
            clientAudits[name].latestDate = audit.created_at;
          }
          clientAudits[name].totalRecs += recs;
          clientAudits[name].auditIds.push(audit.id);
        }
      }

      // Build per-audit implementation counts
      const auditImplCounts: Record<string, { total: number; done: number }> = {};
      for (const impl of implementations || []) {
        if (!auditImplCounts[impl.audit_id]) {
          auditImplCounts[impl.audit_id] = { total: 0, done: 0 };
        }
        auditImplCounts[impl.audit_id].total++;
        if (impl.status === "done" || impl.status === "completed") {
          auditImplCounts[impl.audit_id].done++;
        }
      }

      // Build per-client pipeline counts
      const clientPipeline: Record<string, number> = {};
      for (const proj of pipelineProjects || []) {
        const name = proj.client?.toLowerCase().trim();
        if (!name) continue;
        const stages = Array.isArray(proj.stages) ? proj.stages : [];
        const openCount = stages.filter((s: any) => s.status !== "done" && s.status !== "completed").length;
        clientPipeline[name] = (clientPipeline[name] || 0) + openCount;
      }

      // Compute health for each client that has audit data
      const allClientNames = new Set([
        ...Object.keys(clientAudits),
        ...Object.keys(clientPipeline),
      ]);

      for (const name of allClientNames) {
        const auditData = clientAudits[name];
        let implementationRate: number | null = null;
        let daysSinceLastAudit: number | null = null;

        if (auditData) {
          // Implementation rate across all audits
          let totalDone = 0;
          let totalImpl = 0;
          for (const auditId of auditData.auditIds) {
            const counts = auditImplCounts[auditId];
            if (counts) {
              totalDone += counts.done;
              totalImpl += counts.total;
            }
          }
          implementationRate = totalImpl > 0 ? Math.round((totalDone / totalImpl) * 100) : (auditData.totalRecs > 0 ? 0 : null);

          daysSinceLastAudit = Math.floor(
            (Date.now() - new Date(auditData.latestDate).getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        const openPipelineItems = clientPipeline[name] || 0;

        // Score calculation
        let points = 0;
        let factors = 0;

        if (implementationRate !== null) {
          factors++;
          if (implementationRate >= 60) points += 2;
          else if (implementationRate >= 30) points += 1;
        }

        if (daysSinceLastAudit !== null) {
          factors++;
          if (daysSinceLastAudit <= 60) points += 2;
          else if (daysSinceLastAudit <= 120) points += 1;
        }

        factors++;
        if (openPipelineItems <= 2) points += 2;
        else if (openPipelineItems <= 5) points += 1;

        const maxPoints = factors * 2;
        const ratio = maxPoints > 0 ? points / maxPoints : 0.5;

        const score: "green" | "yellow" | "red" = ratio >= 0.65 ? "green" : ratio >= 0.35 ? "yellow" : "red";

        healthMap[name] = {
          clientName: name,
          score,
          details: { implementationRate, daysSinceLastAudit, openPipelineItems },
        };
      }

      return healthMap;
    },
  });
}
