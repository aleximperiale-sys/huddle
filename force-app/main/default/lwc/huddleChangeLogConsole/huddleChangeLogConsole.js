import { LightningElement, wire, track } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getChanges from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChanges";
import getFilterOptions from "@salesforce/apex/Huddle_ChangeLogConsoleController.getFilterOptions";

// Each change type gets an icon, so the type is legible without reading the label
// and without spending a color on it.
const TYPE_ICONS = {
  "Strategy Logged": "utility:note",
  "Task Created": "utility:task",
  "Decision Raised": "utility:question",
  "Decision Resolved": "utility:check",
  "Digest Generated": "utility:summarydetail"
};

export default class HuddleChangeLogConsole extends NavigationMixin(
  LightningElement
) {
  @track rows = [];
  @track error;
  isLoading = false;
  showTable = false;

  repFilter = "";
  opportunityFilter = "";
  typeFilter = "";
  startDate = null;
  endDate = null;
  maxRows = 200;

  repOptions = [{ label: "All reps", value: "" }];
  opportunityOptions = [{ label: "All opportunities", value: "" }];
  typeOptions = [{ label: "All change types", value: "" }];

  connectedCallback() {
    this.loadData();
  }

  @wire(getFilterOptions)
  wiredOptions({ data, error }) {
    if (data) {
      this.repOptions = [{ label: "All reps", value: "" }].concat(
        (data.reps || []).map((r) => ({ label: r.label, value: r.value }))
      );
      this.opportunityOptions = [
        { label: "All opportunities", value: "" }
      ].concat(
        (data.opportunities || []).map((o) => ({
          label: o.label,
          value: o.value
        }))
      );
      this.typeOptions = [{ label: "All change types", value: "" }].concat(
        (data.changeTypes || []).map((t) => ({ label: t, value: t }))
      );
    } else if (error) {
      this.error = this.reduceError(error);
    }
  }

  async loadData() {
    this.isLoading = true;
    this.error = undefined;
    try {
      this.rows = await getChanges({
        repId: this.repFilter || null,
        opportunityId: this.opportunityFilter || null,
        changeType: this.typeFilter || null,
        startDate: this.startDate || null,
        endDate: this.endDate || null,
        maxRows: this.maxRows
      });
    } catch (e) {
      this.error = this.reduceError(e);
      this.rows = [];
    } finally {
      this.isLoading = false;
    }
  }

  /** Timeline entries: one per audited action, newest first. */
  get entries() {
    return this.rows.map((r) => ({
      id: r.id,
      icon: TYPE_ICONS[r.changeType] || "utility:record",
      changeType: r.changeType,
      name: r.name,
      recordName: r.relatedRecordName,
      detail: r.detail,
      opportunityName: r.opportunityName,
      assignedToName: r.assignedToName,
      hasAssignee: Boolean(r.assignedToName),
      repName: r.repName,
      when: this.formatWhen(r.createdDate),
      confirmed: r.repConfirmed,
      confirmedLabel: r.repConfirmed
        ? "Confirmed by rep"
        : "No confirmation needed",
      confirmedIcon: r.repConfirmed ? "utility:check" : "utility:dash",
      confirmedClass: r.repConfirmed ? "chip chip--confirmed" : "chip",
      strategyLogId: r.sourceStrategyLogId,
      strategyLogName: r.sourceStrategyLogName,
      hasStrategyLog: Boolean(r.sourceStrategyLogId),
      relatedRecordId: r.relatedRecordId,
      hasRelatedRecord: Boolean(r.relatedRecordId),
      opportunityId: r.opportunityId,
      hasOpportunity: Boolean(r.opportunityId)
    }));
  }

  // ---- summary strip, computed off whatever slice is currently filtered ----

  get stats() {
    const rows = this.rows || [];
    const count = (type) => rows.filter((r) => r.changeType === type).length;
    return {
      total: rows.length,
      strategies: count("Strategy Logged"),
      tasks: count("Task Created"),
      decisions: count("Decision Raised"),
      assignees: new Set(
        rows.filter((r) => r.assignedToName).map((r) => r.assignedToName)
      ).size
    };
  }

  formatWhen(value) {
    if (!value) {
      return "";
    }
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  handleRep(e) {
    this.repFilter = e.detail.value;
    this.loadData();
  }

  handleOpportunity(e) {
    this.opportunityFilter = e.detail.value;
    this.loadData();
  }

  handleType(e) {
    this.typeFilter = e.detail.value;
    this.loadData();
  }

  handleStart(e) {
    this.startDate = e.target.value;
    this.loadData();
  }

  handleEnd(e) {
    this.endDate = e.target.value;
    this.loadData();
  }

  handleReset() {
    this.repFilter = "";
    this.opportunityFilter = "";
    this.typeFilter = "";
    this.startDate = null;
    this.endDate = null;
    this.loadData();
  }

  toggleTable() {
    this.showTable = !this.showTable;
  }

  get tableLabel() {
    return this.showTable ? "Timeline view" : "Table view";
  }

  openStrategyLog(event) {
    this.navigateTo(event.currentTarget.dataset.id);
  }

  openRelatedRecord(event) {
    this.navigateTo(event.currentTarget.dataset.id);
  }

  openOpportunity(event) {
    this.navigateTo(event.currentTarget.dataset.id);
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

  get hasRows() {
    return this.rows && this.rows.length > 0;
  }

  get rowCountLabel() {
    return `${this.rows.length} change${this.rows.length === 1 ? "" : "s"}`;
  }

  reduceError(error) {
    if (Array.isArray(error?.body)) {
      return error.body.map((e) => e.message).join(", ");
    }
    return error?.body?.message || error?.message || "Unknown error";
  }
}
