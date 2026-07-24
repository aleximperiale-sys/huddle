import { LightningElement, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getSummary from "@salesforce/apex/Huddle_HomeDashboardController.getSummary";

export default class HuddleHomeDashboard extends NavigationMixin(
  LightningElement
) {
  summary;
  error;

  @wire(getSummary)
  wiredSummary({ data, error }) {
    if (data) {
      this.summary = data;
      this.error = undefined;
    } else if (error) {
      this.error = this.reduceError(error);
    }
  }

  get sessionsThisWeek() {
    return this.summary ? this.summary.sessionsThisWeek : 0;
  }

  get openDecisions() {
    return this.summary ? this.summary.openDecisions : 0;
  }

  get actionItemsOwnerUnclear() {
    return this.summary ? this.summary.actionItemsOwnerUnclear : 0;
  }

  get actionItemProgress() {
    if (!this.summary) {
      return "0 / 0";
    }
    return `${this.summary.actionItemsCompleted} / ${this.summary.actionItemsCreated}`;
  }

  // Unclear owners mean real work may be sitting on the wrong person's queue, so
  // the tile turns red rather than reading as just another neutral count.
  get unclearClass() {
    const base = "slds-text-heading_large";
    return this.actionItemsOwnerUnclear > 0
      ? `${base} slds-text-color_error`
      : base;
  }

  get agingDecisions() {
    return this.summary?.agingDecisions || [];
  }

  get topContributors() {
    return this.summary?.topContributors || [];
  }

  get trend() {
    const raw = this.summary?.trend || [];
    const max = raw.reduce((m, t) => Math.max(m, t.count), 0) || 1;
    return raw.map((t, i) => ({
      key: `${t.label}-${i}`,
      label: t.label,
      count: t.count,
      style: `width:${Math.round((t.count / max) * 100)}%`
    }));
  }

  get hasAging() {
    return this.agingDecisions.length > 0;
  }

  get hasContributors() {
    return this.topContributors.length > 0;
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
