import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getOpportunitySummary from "@salesforce/apex/Huddle_ChangeLogConsoleController.getOpportunitySummary";
import getChangesForOpportunity from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChangesForOpportunity";

const MAX_VISIBLE = 10;

export default class HuddleOpportunityStrategyBadge extends NavigationMixin(
  LightningElement
) {
  @api recordId;

  summary;
  changes = [];
  expanded = false;
  error;

  @wire(getOpportunitySummary, { opportunityId: "$recordId" })
  wiredSummary({ data, error }) {
    if (data) {
      this.summary = data;
      this.error = undefined;
    } else if (error) {
      this.error = this.reduceError(error);
    }
  }

  @wire(getChangesForOpportunity, { opportunityId: "$recordId" })
  wiredChanges({ data, error }) {
    if (data) {
      this.changes = data;
    } else if (error) {
      this.error = this.reduceError(error);
    }
  }

  get hasActivity() {
    return (
      this.summary &&
      (this.summary.strategySessions > 0 || this.summary.actionItems > 0)
    );
  }

  get badgeLabel() {
    if (!this.summary) {
      return "";
    }
    const sessions = this.summary.strategySessions;
    const items = this.summary.actionItems;
    return `Huddle has logged ${sessions} strategy session${sessions === 1 ? "" : "s"} and ${items} action item${
      items === 1 ? "" : "s"
    }`;
  }

  // Said out loud on the record page, because this component sits next to
  // customer-facing activity and the distinction has to be unmissable.
  get internalNote() {
    return "Internal deal strategy — never surfaced to the customer.";
  }

  get hasOpenDecisions() {
    return this.summary && this.summary.openDecisions > 0;
  }

  get openDecisionLabel() {
    const n = this.summary.openDecisions;
    return `${n} decision${n === 1 ? "" : "s"} still unresolved on this deal.`;
  }

  get toggleLabel() {
    return this.expanded ? "Hide history" : "View history";
  }

  get rows() {
    return this.changes.slice(0, MAX_VISIBLE).map((c) => ({
      id: c.id,
      title: `${c.changeType}: ${c.relatedRecordName || "(unnamed)"}`,
      meta: this.buildMeta(c),
      strategyLogId: c.sourceStrategyLogId
    }));
  }

  get hasMore() {
    return this.changes.length > MAX_VISIBLE;
  }

  get moreLabel() {
    return `+${this.changes.length - MAX_VISIBLE} more in the Huddle app.`;
  }

  buildMeta(change) {
    const when = change.createdDate
      ? new Date(change.createdDate).toLocaleDateString()
      : "";
    const who = change.assignedToName
      ? ` · assigned to ${change.assignedToName}`
      : "";
    const by = change.repName ? ` · entered by ${change.repName}` : "";
    return `${when}${who}${by}`;
  }

  toggle() {
    this.expanded = !this.expanded;
  }

  openRecord(event) {
    const recordId = event.currentTarget.dataset.id;
    if (!recordId) {
      return;
    }
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: { recordId, actionName: "view" }
    });
  }

  reduceError(error) {
    return error?.body?.message || error?.message || "Unknown error";
  }
}
