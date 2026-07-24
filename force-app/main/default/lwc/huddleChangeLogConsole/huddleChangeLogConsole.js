import { LightningElement, wire, track } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getChanges from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChanges";
import getFilterOptions from "@salesforce/apex/Huddle_ChangeLogConsoleController.getFilterOptions";

// "Assigned to" sits early and wide on purpose: the reason a manager opens this tab
// is to check that work landed on the right people.
const COLUMNS = [
  { label: "Change #", fieldName: "name", type: "text", fixedWidth: 110 },
  { label: "Type", fieldName: "changeType", type: "text", fixedWidth: 140 },
  { label: "Opportunity", fieldName: "opportunityName", type: "text" },
  {
    label: "Record",
    fieldName: "relatedRecordName",
    type: "text",
    wrapText: true
  },
  { label: "Assigned to", fieldName: "assignedToName", type: "text" },
  { label: "Detail", fieldName: "detail", type: "text", wrapText: true },
  { label: "Entered by", fieldName: "repName", type: "text" },
  {
    label: "Confirmed",
    fieldName: "repConfirmed",
    type: "boolean",
    fixedWidth: 95
  },
  {
    label: "When",
    fieldName: "createdDate",
    type: "date",
    typeAttributes: {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  },
  {
    type: "action",
    typeAttributes: {
      rowActions: [
        { label: "Open source meeting recap", name: "open_strategy_log" },
        { label: "Open the record", name: "open_record" },
        { label: "Open the opportunity", name: "open_opportunity" }
      ]
    }
  }
];

export default class HuddleChangeLogConsole extends NavigationMixin(
  LightningElement
) {
  columns = COLUMNS;
  @track rows = [];
  @track error;
  isLoading = false;

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

  handleRowAction(event) {
    const action = event.detail.action.name;
    const row = event.detail.row;
    if (action === "open_strategy_log" && row.sourceStrategyLogId) {
      this.navigateTo(row.sourceStrategyLogId);
    } else if (action === "open_record" && row.relatedRecordId) {
      this.navigateTo(row.relatedRecordId);
    } else if (action === "open_opportunity" && row.opportunityId) {
      this.navigateTo(row.opportunityId);
    }
  }

  navigateTo(recordId) {
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
