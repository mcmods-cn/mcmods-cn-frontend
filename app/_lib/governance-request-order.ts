export function isCurrentReportDetailResponse(input: {
  aborted: boolean;
  currentGeneration: number;
  desiredReportId: string;
  requestGeneration: number;
  requestedReportId: string;
  responseReportId: string;
}) {
  return !input.aborted
    && input.requestGeneration === input.currentGeneration
    && input.requestedReportId === input.desiredReportId
    && input.responseReportId === input.requestedReportId;
}
