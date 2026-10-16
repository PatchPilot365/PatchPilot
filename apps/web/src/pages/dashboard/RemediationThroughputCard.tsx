import { useNavigate } from "react-router-dom";
import { ChartCard } from "../../components/charts/ChartCard";
import { StackedBarChart } from "../../components/charts/StackedBarChart";
import { JOB_STATUS_TOKENS } from "../../lib/palette";
import type { DashboardRemediation } from "../../lib/api";
import { toJobStatus } from "./links";
import { remediationSubtitle } from "./remediationSubtitle";

const SERIES = [
  { key: "succeeded", label: JOB_STATUS_TOKENS.succeeded.label, fill: JOB_STATUS_TOKENS.succeeded.fill },
  { key: "failed", label: JOB_STATUS_TOKENS.failed.label, fill: JOB_STATUS_TOKENS.failed.fill },
  // Failed runs PatchPilot couldn't act on — shown, but outside the success rate.
  { key: "notActionable", label: "Not actionable", fill: JOB_STATUS_TOKENS.queued.fill },
];

const RATE_COLOR = "#0ea5e9";

export function RemediationThroughputCard({
  remediation,
  isLoading,
}: {
  remediation: DashboardRemediation;
  isLoading: boolean;
}) {
  const nav = useNavigate();
  const total = remediation.succeeded + remediation.failed + remediation.notActionable;

  const data = remediation.days.map((d) => ({
    ...d,
    rate: d.succeeded + d.failed > 0 ? Math.round((d.succeeded / (d.succeeded + d.failed)) * 100) : null,
  }));

  return (
    <ChartCard
      title="Remediation throughput"
      subtitle={remediationSubtitle(remediation)}
      height={240}
      isLoading={isLoading}
      isEmpty={total === 0}
      emptyNote="No remediation runs yet."
    >
      <StackedBarChart
        data={data}
        xKey="day"
        series={SERIES}
        line={{ key: "rate", label: "Success rate", color: RATE_COLOR, formatValue: (v) => `${v}%` }}
        onSelect={(_, seriesKey) => nav(toJobStatus(seriesKey === "succeeded" ? "succeeded" : "failed"))}
      />
    </ChartCard>
  );
}
