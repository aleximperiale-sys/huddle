import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getOpportunitySummary from "@salesforce/apex/Huddle_ChangeLogConsoleController.getOpportunitySummary";
import getChangesForOpportunity from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChangesForOpportunity";

/**
 * A briefing card on the Opportunity record page.
 *
 * It sits inches away from customer-facing activity history, so "internal only" is
 * stated in words and in a pill rather than implied by styling. The loudest figure is
 * what is still unresolved on this deal, because that is the thing a rep opening the
 * record needs to see before they walk into the next call.
 */
const MAX_VISIBLE = 8;

export default class HuddleOpportunityStrategyBadge extends NavigationMixin(
  LightningElement
) {
  @api recordId;

  summary;
  changes = [];
  expanded = false;
  isRefreshing = false;

  summaryLoaded = false;
  changesLoaded = false;

  errorMessage;
  errorDetail;

  summaryResult;
  changesResult;

  @wire(getOpportunitySummary, { opportunityId: "$recordId" })
  wiredSummary(result) {
    this.summaryResult = result;
    const { data, error } = result;
    if (data) {
      this.summary = data;
      this.clearError();
      this.summaryLoaded = true;
    } else if (error) {
      this.captureError(error, "getOpportunitySummary");
      this.summaryLoaded = true;
    }
  }

  @wire(getChangesForOpportunity, { opportunityId: "$recordId" })
  wiredChanges(result) {
    this.changesResult = result;
    const { data, error } = result;
    if (data) {
      this.changes = data;
      this.changesLoaded = true;
    } else if (error) {
      this.captureError(error, "getChangesForOpportunity");
      this.changesLoaded = true;
    }
  }

  // ------------------------------------------------------------- state flags

  get isLoading() {
    return !this.summaryLoaded || !this.changesLoaded;
  }

  get hasError() {
    return Boolean(this.errorMessage);
  }

  get isFatalError() {
    return this.hasError && !this.summary;
  }

  get isStaleWarning() {
    return this.hasError && Boolean(this.summary);
  }

  get hasActivity() {
    return (
      Boolean(this.summary) &&
      (this.summary.strategySessions > 0 || this.summary.actionItems > 0)
    );
  }

  get showEmpty() {
    return !this.isLoading && !this.isFatalError && !this.hasActivity;
  }

  // ------------------------------------------------------------------ figures

  get sessions() {
    return this.summary?.strategySessions || 0;
  }

  get sessionsLabel() {
    return this.sessions === 1 ? "strategy session" : "strategy sessions";
  }

  get actionItems() {
    return this.summary?.actionItems || 0;
  }

  get actionItemsLabel() {
    return this.actionItems === 1 ? "action item" : "action items";
  }

  get openDecisions() {
    return this.summary?.openDecisions || 0;
  }

  get decisionsRaised() {
    return this.changes.filter((c) => c.changeType === "Decision Raised")
      .length;
  }

  /**
   * A share needs a denominator to mean anything. Open decisions are counted against
   * every decision this deal has raised, so the meter plots a real ratio instead of
   * dressing a bare count up as one.
   */
  get decisionsTotal() {
    return Math.max(this.decisionsRaised, this.openDecisions);
  }

  get decisionsResolvedPct() {
    const total = this.decisionsTotal;
    if (total === 0) {
      return 100;
    }
    return Math.round(((total - this.openDecisions) / total) * 100);
  }

  get decisionsMeterLabel() {
    const total = this.decisionsTotal;
    if (total === 0) {
      return "No decisions raised on this deal";
    }
    return `${total - this.openDecisions} of ${total} decisions resolved`;
  }

  get hasOpenDecisions() {
    return this.openDecisions > 0;
  }

  get headlineTone() {
    return this.hasOpenDecisions ? "critical" : "success";
  }

  get headlineClass() {
    return this.hasOpenDecisions
      ? "headline headline_open"
      : "headline headline_clear";
  }

  get headlineStatusLabel() {
    return this.hasOpenDecisions ? "Needs a decision" : "Nothing unresolved";
  }

  get headlineIcon() {
    return this.hasOpenDecisions ? "utility:warning" : "utility:success";
  }

  get openDecisionLabel() {
    const n = this.openDecisions;
    if (n === 0) {
      return "Every question this deal raised has been resolved.";
    }
    return `${n} decision${n === 1 ? "" : "s"} still unresolved on this deal`;
  }

  get lastSessionLabel() {
    if (!this.summary?.lastSessionDate) {
      return null;
    }
    return new Date(this.summary.lastSessionDate).toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric"
      }
    );
  }

  get hasLastSession() {
    return Boolean(this.summary?.lastStrategyLogId);
  }

  get lastStrategyLogId() {
    return this.summary?.lastStrategyLogId;
  }

  // ------------------------------------------------------------------ history

  get toggleLabel() {
    return this.expanded
      ? "Hide the audit trail"
      : `Show the audit trail (${this.changes.length})`;
  }

  get isExpandedAttr() {
    return this.expanded ? "true" : "false";
  }

  get rows() {
    return this.changes.slice(0, MAX_VISIBLE).map((c) => ({
      id: c.id,
      changeType: c.changeType,
      recordName: c.relatedRecordName || "(unnamed record)",
      meta: this.buildMeta(c),
      assignedToName: c.assignedToName,
      hasAssignee: Boolean(c.assignedToName),
      strategyLogId: c.sourceStrategyLogId,
      hasStrategyLog: Boolean(c.sourceStrategyLogId)
    }));
  }

  get hasRows() {
    return this.rows.length > 0;
  }

  get hasMore() {
    return this.changes.length > MAX_VISIBLE;
  }

  get moreLabel() {
    const n = this.changes.length - MAX_VISIBLE;
    return `+${n} more in the Huddle app.`;
  }

  buildMeta(change) {
    const when = change.createdDate
      ? new Date(change.createdDate).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        })
      : "";
    const who = change.assignedToName
      ? ` · assigned to ${change.assignedToName}`
      : "";
    return `${when}${who}`;
  }

  toggle() {
    this.expanded = !this.expanded;
  }

  // ------------------------------------------------------------------ actions

  get refreshLabel() {
    return this.isRefreshing ? "Refreshing…" : "Refresh";
  }

  async handleRefresh() {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    try {
      await Promise.all([
        refreshApex(this.summaryResult),
        refreshApex(this.changesResult)
      ]);
      if (!this.errorMessage) {
        this.dispatchEvent(
          new ShowToastEvent({
            title: "Huddle history refreshed",
            message: "The counts on this deal are current.",
            variant: "success"
          })
        );
      }
    } catch (e) {
      this.captureError(e, "refreshApex");
    } finally {
      this.isRefreshing = false;
    }
  }

  handleRetry() {
    this.handleRefresh();
  }

  openLastRecap() {
    this.navigateTo(this.lastStrategyLogId);
  }

  openRecord(event) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    this.navigateTo(event.currentTarget.dataset.id);
  }

  openHuddleApp() {
    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: "Huddle_Change_Log__c",
        actionName: "list"
      },
      state: { filterName: "All" }
    });
  }

  navigateTo(recordId) {
    if (!recordId) {
      return;
    }
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: { recordId, actionName: "view" }
    });
  }

  // -------------------------------------------------------------- diagnostics

  clearError() {
    this.errorMessage = undefined;
    this.errorDetail = undefined;
  }

  captureError(error, source) {
    console.error(`[huddleOpportunityStrategyBadge] ${source} failed:`, error);
    this.errorMessage =
      "Huddle could not load this deal's strategy history. You may not have access to the Huddle objects, or the connection dropped.";
    this.errorDetail = this.rawError(error);
  }

  rawError(error) {
    if (Array.isArray(error?.body)) {
      return error.body.map((e) => e.message).join(", ");
    }
    return (
      error?.body?.message ||
      error?.message ||
      (typeof error === "string" ? error : JSON.stringify(error))
    );
  }
}
