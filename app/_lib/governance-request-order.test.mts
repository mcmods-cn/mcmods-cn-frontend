import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isCurrentReportDetailResponse } from "./governance-request-order.ts";

const reportPanel = readFileSync(new URL("../_components/admin-report-panel.tsx", import.meta.url), "utf8");
const siteAffairsPanels = readFileSync(new URL("../_components/admin-site-affairs-panels.tsx", import.meta.url), "utf8");

test("report detail responses require the latest generation and desired report identity", () => {
  const current = {
    aborted: false,
    currentGeneration: 3,
    desiredReportId: "report-b",
    requestGeneration: 3,
    requestedReportId: "report-b",
    responseReportId: "report-b",
  };
  assert.equal(isCurrentReportDetailResponse(current), true);
  assert.equal(isCurrentReportDetailResponse({ ...current, aborted: true }), false);
  assert.equal(isCurrentReportDetailResponse({ ...current, requestGeneration: 2 }), false);
  assert.equal(isCurrentReportDetailResponse({ ...current, desiredReportId: "report-c" }), false);
  assert.equal(isCurrentReportDetailResponse({ ...current, responseReportId: "report-a" }), false);
});

test("report list, detail, and About loads all have stale-response protection", () => {
  assert.match(reportPanel, /apiRequest<GovernancePage<ReportRow>>[\s\S]*\{ signal \}/);
  assert.match(reportPanel, /detailLoadController\.current\?\.abort\(\)/);
  assert.match(reportPanel, /isCurrentReportDetailResponse/);
  assert.match(reportPanel, /selectedReportId\.current/);
  assert.match(siteAffairsPanels, /isCurrentAboutDraftResponse/);
  assert.match(siteAffairsPanels, /responseLocale:\s*value\.locale/);
});

test("clearing a selection invalidates in-flight detail and action continuations", () => {
  assert.match(reportPanel, /function clearReportSelection\(\)[\s\S]*selectedReportId\.current = "";[\s\S]*detailLoadController\.current\?\.abort\(\)/);
  assert.match(reportPanel, /selectedReportId\.current !== reportId/);
});
