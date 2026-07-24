import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getOpportunitySummary from "@salesforce/apex/Huddle_ChangeLogConsoleController.getOpportunitySummary";
import getChangesForOpportunity from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChangesForOpportunity";

const MAX_VISIBLE = 8;
const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;

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

  get sessions() {
    return this.summary?.strategySessions || 0;
  }

  get actionItems() {
    return this.summary?.actionItems || 0;
  }

  get openDecisions() {
    return this.summary?.openDecisions || 0;
  }

  /**
   * A meter needs a limit to be meaningful. Open decisions are a share of every
   * decision this deal has raised, so the ring plots what is still unresolved
   * against the total rather than dressing a bare count up as a ratio.
   */
  get decisionRing() {
    const open = this.openDecisions;
    const raised = this.changes.filter(
      (c) => c.changeType === "Decision Raised"
    ).length;
    const total = Math.max(raised, open);
    const pct = total > 0 ? open / total : 0;
    return {
      r: RING_R,
      dash: `${(pct * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`,
      label: String(open),
      alt: `${open} of ${total} decisions on this deal are still unresolved`
    };
  }

  get hasOpenDecisions() {
    return this.openDecisions > 0;
  }

  get openDecisionLabel() {
    const n = this.openDecisions;
    return `${n} decision${n === 1 ? "" : "s"} still unresolved on this deal`;
  }

  get toggleLabel() {
    return this.expanded ? "Hide history" : "View history";
  }

  get rows() {
    return this.changes.slice(0, MAX_VISIBLE).map((c) => ({
      id: c.id,
      title: `${c.changeType}: ${c.relatedRecordName || "(unnamed)"}`,
      meta: this.buildMeta(c),
      strategyLogId: c.sourceStrategyLogId,
      hasStrategyLog: Boolean(c.sourceStrategyLogId)
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
    return `${when}${who}`;
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
