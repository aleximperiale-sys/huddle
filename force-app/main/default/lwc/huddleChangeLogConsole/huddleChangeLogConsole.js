import { LightningElement, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getChanges from "@salesforce/apex/Huddle_ChangeLogConsoleController.getChanges";
import getFilterOptions from "@salesforce/apex/Huddle_ChangeLogConsoleController.getFilterOptions";

/**
 * The audit trail, read as a briefing agenda rather than a grid.
 *
 * A manager opens this tab to answer one question - who did Huddle put work on, and
 * did somebody approve it - so the timeline is the default view and assignment is a
 * first-class chip on every entry. The table view is the same rows in columns for
 * anyone who wants to sort and scan; it is a real lightning-datatable so sorting,
 * keyboard navigation and column resizing come from the platform rather than from
 * hand-rolled markup.
 *
 * Nothing here mutates: the change log is the audit trail, so the console has no
 * destructive actions to confirm.
 */

// Each change type gets an icon, so the type is legible without reading the label
// and without spending a colour on it.
const TYPE_ICONS = {
  "Strategy Logged": "utility:note",
  "Task Created": "utility:task",
  "Decision Raised": "utility:question",
  "Decision Resolved": "utility:check",
  "Digest Generated": "utility:summarydetail"
};

const PAGE_SIZES = [25, 50, 100];
const SERVER_PAGE = 200;

const SORTS = {
  newest: { field: "createdDate", direction: "desc", label: "Newest first" },
  oldest: { field: "createdDate", direction: "asc", label: "Oldest first" },
  type: { field: "changeType", direction: "asc", label: "Change type A–Z" },
  assignee: {
    field: "assignedToName",
    direction: "asc",
    label: "Assigned to A–Z"
  },
  opportunity: {
    field: "opportunityName",
    direction: "asc",
    label: "Opportunity A–Z"
  }
};

const COLUMNS = [
  { label: "Change #", fieldName: "name", sortable: true, initialWidth: 110 },
  { label: "Type", fieldName: "changeType", sortable: true, initialWidth: 150 },
  { label: "Record", fieldName: "recordName", sortable: true, wrapText: true },
  {
    label: "Assigned to",
    fieldName: "assignedToName",
    sortable: true,
    initialWidth: 160
  },
  {
    label: "Opportunity",
    fieldName: "opportunityName",
    sortable: true,
    initialWidth: 190
  },
  {
    label: "Confirmed",
    fieldName: "confirmedLabel",
    sortable: true,
    initialWidth: 175
  },
  {
    label: "Entered by",
    fieldName: "repName",
    sortable: true,
    initialWidth: 150
  },
  {
    label: "When",
    fieldName: "createdDate",
    type: "date",
    sortable: true,
    initialWidth: 170,
    typeAttributes: {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  },
  {
    type: "action",
    typeAttributes: { rowActions: { fieldName: "rowActions" } }
  }
];

export default class HuddleChangeLogConsole extends NavigationMixin(
  LightningElement
) {
  rows = [];
  errorMessage;
  errorDetail;

  hasLoaded = false;
  isRefreshing = false;
  isLoadingMore = false;

  view = "timeline";
  filtersCollapsed = false;

  repFilter = "";
  opportunityFilter = "";
  typeFilter = "";
  startDate = null;
  endDate = null;
  searchTerm = "";
  maxRows = SERVER_PAGE;

  sortKey = "newest";
  // A datatable header sort on a column the sort menu does not offer, held per
  // instance rather than written back into the shared SORTS table.
  customSort;
  page = 1;
  pageSize = 25;

  repOptions = [{ label: "All reps", value: "" }];
  opportunityOptions = [{ label: "All opportunities", value: "" }];
  typeOptions = [{ label: "All change types", value: "" }];

  columns = COLUMNS;

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
      // The filter lists failing is not fatal - the log itself still loads, and the
      // comboboxes simply fall back to their "All" entries.
      console.error("[huddleChangeLogConsole] getFilterOptions failed:", error);
    }
  }

  // ------------------------------------------------------------------ loading

  async loadData({ refresh = false, more = false } = {}) {
    if (refresh) {
      this.isRefreshing = true;
    }
    if (more) {
      this.isLoadingMore = true;
    }
    try {
      const result = await getChanges({
        repId: this.repFilter || null,
        opportunityId: this.opportunityFilter || null,
        changeType: this.typeFilter || null,
        startDate: this.startDate || null,
        endDate: this.endDate || null,
        maxRows: this.maxRows
      });
      this.rows = result || [];
      this.errorMessage = undefined;
      this.errorDetail = undefined;
      if (refresh) {
        this.toast(
          "Change log refreshed",
          `${this.rows.length} audited action${this.rows.length === 1 ? "" : "s"} loaded.`,
          "success"
        );
      }
    } catch (e) {
      this.captureError(e);
      if (!more) {
        this.rows = [];
      }
    } finally {
      this.hasLoaded = true;
      this.isRefreshing = false;
      this.isLoadingMore = false;
    }
  }

  handleRefresh() {
    this.loadData({ refresh: true });
  }

  handleRetry() {
    this.loadData({ refresh: false });
  }

  handleLoadMore() {
    this.maxRows += SERVER_PAGE;
    this.loadData({ more: true });
  }

  get isInitialLoad() {
    return !this.hasLoaded;
  }

  get refreshLabel() {
    return this.isRefreshing ? "Refreshing data…" : "Refresh";
  }

  get loadMoreLabel() {
    return this.isLoadingMore ? "Loading records…" : "Load 200 more";
  }

  /**
   * The server capped the result, so there is probably more behind it. Stays true
   * while the fetch is in flight - the control the user just pressed has to remain on
   * screen to report itself, not vanish because maxRows already moved.
   */
  get canLoadMore() {
    return (
      this.isLoadingMore || (this.hasLoaded && this.rows.length >= this.maxRows)
    );
  }

  get hasError() {
    return Boolean(this.errorMessage);
  }

  get isFatalError() {
    return this.hasError && this.rows.length === 0;
  }

  get isStaleWarning() {
    return this.hasError && this.rows.length > 0;
  }

  // ------------------------------------------------------------------- shaping

  /** Filtered, sorted rows - the slice every count and both views agree on. */
  get filteredRows() {
    const term = this.searchTerm.trim().toLowerCase();
    let out = this.rows;

    if (term) {
      out = out.filter((r) =>
        [
          r.name,
          r.changeType,
          r.relatedRecordName,
          r.detail,
          r.assignedToName,
          r.repName,
          r.opportunityName
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term))
      );
    }

    const spec = this.sortSpec;
    const dir = spec.direction === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      const av = a[spec.field];
      const bv = b[spec.field];
      if (av === bv) {
        return 0;
      }
      if (av === null || av === undefined) {
        return 1;
      }
      if (bv === null || bv === undefined) {
        return -1;
      }
      return av > bv ? dir : -dir;
    });
  }

  get pageCount() {
    return Math.max(Math.ceil(this.filteredRows.length / this.pageSize), 1);
  }

  get currentPage() {
    return Math.min(this.page, this.pageCount);
  }

  get pagedRows() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredRows.slice(start, start + this.pageSize);
  }

  /** Timeline entries: one per audited action. */
  get entries() {
    return this.pagedRows.map((r) => ({
      id: r.id,
      icon: TYPE_ICONS[r.changeType] || "utility:record",
      changeType: r.changeType,
      name: r.name,
      recordName: r.relatedRecordName || "(unnamed record)",
      detail: r.detail,
      opportunityName: r.opportunityName,
      assignedToName: r.assignedToName,
      hasAssignee: Boolean(r.assignedToName),
      repName: r.repName || "an unnamed user",
      when: this.formatWhen(r.createdDate),
      confirmedLabel: r.repConfirmed
        ? "Confirmed by rep"
        : "No confirmation needed",
      confirmedTone: r.repConfirmed ? "success" : "neutral",
      confirmedIcon: r.repConfirmed ? "utility:check" : "utility:dash",
      strategyLogId: r.sourceStrategyLogId,
      hasStrategyLog: Boolean(r.sourceStrategyLogId),
      relatedRecordId: r.relatedRecordId,
      hasRelatedRecord: Boolean(r.relatedRecordId),
      opportunityId: r.opportunityId,
      hasOpportunity: Boolean(r.opportunityId),
      menuItems: this.buildMenu(r)
    }));
  }

  /** Flat rows for lightning-datatable, plus the row's own action list. */
  get tableRows() {
    return this.pagedRows.map((r) => ({
      id: r.id,
      name: r.name,
      changeType: r.changeType,
      recordName: r.relatedRecordName,
      assignedToName: r.assignedToName,
      opportunityName: r.opportunityName,
      confirmedLabel: r.repConfirmed
        ? "Confirmed by rep"
        : "No confirmation needed",
      repName: r.repName,
      createdDate: r.createdDate,
      rowActions: this.buildMenu(r).map((m) => ({
        label: m.label,
        name: m.value
      }))
    }));
  }

  /**
   * Only the links a row actually has. An always-present menu item that navigates
   * nowhere is worse than a shorter menu.
   */
  buildMenu(r) {
    const items = [];
    if (r.relatedRecordId) {
      items.push({
        label: "Open the record",
        value: `record:${r.relatedRecordId}`
      });
    }
    if (r.sourceStrategyLogId) {
      items.push({
        label: "Open the source meeting recap",
        value: `record:${r.sourceStrategyLogId}`
      });
    }
    if (r.opportunityId) {
      items.push({
        label: "Open the opportunity",
        value: `record:${r.opportunityId}`
      });
    }
    items.push({ label: "Open this audit row", value: `record:${r.id}` });
    return items;
  }

  get hasRows() {
    return this.filteredRows.length > 0;
  }

  get isFilteredEmpty() {
    return this.hasLoaded && !this.hasRows && this.rows.length > 0;
  }

  get isGenuinelyEmpty() {
    return this.hasLoaded && this.rows.length === 0 && !this.hasError;
  }

  // --------------------------------------------------------- summary strip

  get stats() {
    const rows = this.filteredRows;
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

  get rowCountLabel() {
    const shown = this.filteredRows.length;
    const loaded = this.rows.length;
    if (shown === loaded) {
      return `${loaded} change${loaded === 1 ? "" : "s"}`;
    }
    return `${shown} of ${loaded} changes`;
  }

  get pageLabel() {
    const total = this.filteredRows.length;
    if (total === 0) {
      return "No results";
    }
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.pageSize - 1, total);
    return `${start}–${end} of ${total}`;
  }

  // ------------------------------------------------------------------ controls

  get sortOptions() {
    return Object.keys(SORTS).map((key) => ({
      label: SORTS[key].label,
      value: key
    }));
  }

  get pageSizeOptions() {
    return PAGE_SIZES.map((n) => ({
      label: `${n} per page`,
      value: String(n)
    }));
  }

  get pageSizeValue() {
    return String(this.pageSize);
  }

  get sortSpec() {
    if (this.sortKey === "custom" && this.customSort) {
      return this.customSort;
    }
    return SORTS[this.sortKey] || SORTS.newest;
  }

  get sortedBy() {
    return this.sortSpec.field;
  }

  get sortedDirection() {
    return this.sortSpec.direction;
  }

  get isTimeline() {
    return this.view === "timeline";
  }

  /**
   * A radio group, not two toggle buttons: picking one of two mutually exclusive
   * views is exactly what radio semantics describe, and the base component gives us
   * arrow-key navigation and the selected state announced for free.
   */
  get viewOptions() {
    return [
      { label: "Timeline", value: "timeline" },
      { label: "Table", value: "table" }
    ];
  }

  get filtersActive() {
    return Boolean(
      this.repFilter ||
      this.opportunityFilter ||
      this.typeFilter ||
      this.startDate ||
      this.endDate ||
      this.searchTerm
    );
  }

  get activeFilterLabel() {
    return this.filtersActive ? "Filters applied" : "No filters";
  }

  get activeFilterTone() {
    return this.filtersActive ? "accent" : "neutral";
  }

  get isFirstPage() {
    return this.currentPage <= 1;
  }

  get isLastPage() {
    return this.currentPage >= this.pageCount;
  }

  get showPagination() {
    return this.hasRows && this.filteredRows.length > this.pageSize;
  }

  handleViewChange(event) {
    this.view = event.detail.value;
  }

  handleFiltersToggle(event) {
    this.filtersCollapsed = event.detail.collapsed;
  }

  get showFilters() {
    return !this.filtersCollapsed;
  }

  handleRep(e) {
    this.repFilter = e.detail.value;
    this.page = 1;
    this.loadData();
  }

  handleOpportunity(e) {
    this.opportunityFilter = e.detail.value;
    this.page = 1;
    this.loadData();
  }

  handleType(e) {
    this.typeFilter = e.detail.value;
    this.page = 1;
    this.loadData();
  }

  handleStart(e) {
    this.startDate = e.target.value;
    this.page = 1;
    this.loadData();
  }

  handleEnd(e) {
    this.endDate = e.target.value;
    this.page = 1;
    this.loadData();
  }

  /** Search runs client-side over what is already loaded - no round trip per keystroke. */
  handleSearch(e) {
    this.searchTerm = e.target.value || "";
    this.page = 1;
  }

  handleSort(e) {
    this.sortKey = e.detail.value;
    this.page = 1;
  }

  /** Datatable's own header sort, routed into the same state the timeline reads. */
  handleColumnSort(event) {
    const { fieldName, sortDirection } = event.detail;
    const match = Object.keys(SORTS).find(
      (key) =>
        SORTS[key].field === fieldName && SORTS[key].direction === sortDirection
    );
    if (match) {
      this.customSort = undefined;
      this.sortKey = match;
    } else {
      this.customSort = { field: fieldName, direction: sortDirection };
      this.sortKey = "custom";
    }
    this.page = 1;
  }

  handlePageSize(e) {
    this.pageSize = parseInt(e.detail.value, 10) || 25;
    this.page = 1;
  }

  handlePrev() {
    this.page = Math.max(this.currentPage - 1, 1);
  }

  handleNext() {
    this.page = Math.min(this.currentPage + 1, this.pageCount);
  }

  handleReset() {
    this.repFilter = "";
    this.opportunityFilter = "";
    this.typeFilter = "";
    this.startDate = null;
    this.endDate = null;
    this.searchTerm = "";
    this.sortKey = "newest";
    this.page = 1;
    this.maxRows = SERVER_PAGE;
    this.loadData();
    this.toast(
      "Filters cleared",
      "Showing every audited action Huddle has recorded.",
      "info"
    );
  }

  // ---------------------------------------------------------------- navigation

  handleMenuSelect(event) {
    this.navigateToValue(event.detail.value);
  }

  handleRowAction(event) {
    this.navigateToValue(event.detail.action.name);
  }

  navigateToValue(value) {
    if (typeof value !== "string" || !value.startsWith("record:")) {
      return;
    }
    this.navigateTo(value.slice("record:".length));
  }

  openStrategyLog(event) {
    this.linkClick(event);
  }

  openRelatedRecord(event) {
    this.linkClick(event);
  }

  openOpportunity(event) {
    this.linkClick(event);
  }

  linkClick(event) {
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
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

  navigateToChangeLogList() {
    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: "Huddle_Change_Log__c",
        actionName: "list"
      },
      state: { filterName: "All" }
    });
  }

  // -------------------------------------------------------------- diagnostics

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

  captureError(error) {
    console.error("[huddleChangeLogConsole] getChanges failed:", error);
    this.errorMessage =
      "Huddle could not load the change log. This is usually a permissions gap on the change log object, or a filter combination the org rejected.";
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

  toast(title, message, variant) {
    this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
  }
}
