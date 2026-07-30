import { LightningElement, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import { refreshApex } from "@salesforce/apex";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getSummary from "@salesforce/apex/Huddle_HomeDashboardController.getSummary";

/**
 * The pre-meeting briefing sheet.
 *
 * The page is ordered by what a manager walks into a pipeline review needing to
 * answer, and the first of those is "what has this team left undecided, and for how
 * long". So the aging open-decision agenda is the hero region - biggest type,
 * loudest urgency marks, top of the sheet - and the measures sit underneath it as
 * supporting cards rather than the other way round.
 *
 * Everything below the agenda is context: where the work stands, what the week
 * looked like, and a table twin of every plotted value for anyone who cannot read
 * the chart.
 */

// Trend plot geometry. The viewBox scales uniformly, so strokes, text and dots keep
// their proportions at any width. The bottom band is the x axis: the container has to
// include it or the tick labels get clipped and the region grows a nested scrollbar.
const T = { w: 900, h: 170, left: 10, right: 56, top: 16, bottom: 28 };

// Past two weeks a decision stops being "aging" and starts being a problem.
const CRITICAL_DAYS = 14;

const URGENCY_ALL = "all";
const URGENCY_CRITICAL = "critical";
const URGENCY_WARNING = "warning";
const URGENCY_DEADLINE = "deadline";

const SORT_OLDEST = "oldest";
const SORT_DEADLINE = "deadline";
const SORT_OPPORTUNITY = "opportunity";

export default class HuddleHomeDashboard extends NavigationMixin(
  LightningElement
) {
  summary;
  errorMessage;
  errorDetail;

  hasLoaded = false;
  isRefreshing = false;

  // Agenda controls
  searchTerm = "";
  urgencyFilter = URGENCY_ALL;
  sortBy = SORT_OLDEST;
  expandedId;

  // Section disclosure
  activityCollapsed = false;
  tableCollapsed = true;

  hovered;
  lastRefreshedLabel;

  wiredResult;

  @wire(getSummary)
  wiredSummary(result) {
    this.wiredResult = result;
    const { data, error } = result;
    if (data) {
      this.summary = data;
      this.errorMessage = undefined;
      this.errorDetail = undefined;
      this.hasLoaded = true;
      this.stampRefreshTime();
    } else if (error) {
      this.captureError(error);
      this.hasLoaded = true;
    }
  }

  // ---------------------------------------------------------------- sheet head

  get todayLabel() {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric"
    });
  }

  get refreshLabel() {
    return this.isRefreshing ? "Refreshing data…" : "Refresh";
  }

  get asOfLabel() {
    if (!this.lastRefreshedLabel) {
      return "Loading…";
    }
    return `As of ${this.lastRefreshedLabel}`;
  }

  stampRefreshTime() {
    this.lastRefreshedLabel = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  async handleRefresh() {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    try {
      await refreshApex(this.wiredResult);
      if (!this.errorMessage) {
        this.toast(
          "Briefing refreshed",
          "Every figure on this sheet is current.",
          "success"
        );
      }
    } catch (e) {
      this.captureError(e);
      this.toast(
        "Refresh failed",
        "Huddle could not reload the briefing. The figures shown are the last good ones.",
        "error"
      );
    } finally {
      this.isRefreshing = false;
    }
  }

  handleRetry() {
    this.handleRefresh();
  }

  // ------------------------------------------------------------- state flags

  get isInitialLoad() {
    return !this.hasLoaded;
  }

  get hasError() {
    return Boolean(this.errorMessage);
  }

  /** A hard failure with nothing cached to fall back on. */
  get isFatalError() {
    return this.hasError && !this.summary;
  }

  /** A failure on top of data we already have - warn, but keep the figures. */
  get isStaleWarning() {
    return this.hasError && Boolean(this.summary);
  }

  // ---------------------------------------------------------- the hero agenda

  get allAgendaItems() {
    const raw = this.summary?.agingDecisions || [];
    const worst = raw.reduce((m, d) => Math.max(m, d.daysOpen || 0), 0) || 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return raw.map((d) => {
      const days = d.daysOpen || 0;
      const critical = days > CRITICAL_DAYS;
      const neededBy = d.neededBy ? new Date(`${d.neededBy}T00:00:00`) : null;
      const overdue = neededBy !== null && neededBy < today;
      const expanded = this.expandedId === d.id;
      const dateLabel = neededBy
        ? neededBy.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric"
          })
        : null;

      return {
        id: d.id,
        name: d.name,
        question: d.question || "(no question captured)",
        opportunityName: d.opportunityName,
        days,
        ageValue: String(days),
        ageUnit: days === 1 ? "day open" : "days open",
        // Urgency is bar length + a pill + a word, never hue on its own.
        ageBarStyle: `width:${Math.max(Math.round((days / worst) * 100), 6)}%`,
        ageBarClass: critical
          ? "agenda__agebar-fill agenda__agebar-fill_critical"
          : "agenda__agebar-fill",
        ageClass: critical ? "agenda__age agenda__age_critical" : "agenda__age",
        rowClass: critical ? "agenda__row agenda__row_critical" : "agenda__row",
        tone: critical ? "critical" : "warning",
        pillLabel: critical ? "Overdue for a decision" : "Aging",
        hasNeededBy: neededBy !== null,
        deadlineTone: overdue ? "critical" : "neutral",
        deadlineLabel: dateLabel
          ? `Needed by ${dateLabel}${overdue ? " - date has passed" : ""}`
          : null,
        expanded,
        detailId: `agenda-detail-${d.id}`,
        toggleIcon: expanded ? "utility:chevrondown" : "utility:chevronright",
        toggleLabel: expanded
          ? `Hide details for ${d.name}`
          : `Show details for ${d.name}`,
        isExpandedAttr: expanded ? "true" : "false"
      };
    });
  }

  get agendaItems() {
    const term = this.searchTerm.trim().toLowerCase();
    let rows = this.allAgendaItems;

    if (term) {
      rows = rows.filter(
        (r) =>
          r.question.toLowerCase().includes(term) ||
          (r.opportunityName || "").toLowerCase().includes(term) ||
          (r.name || "").toLowerCase().includes(term)
      );
    }

    if (this.urgencyFilter === URGENCY_CRITICAL) {
      rows = rows.filter((r) => r.days > CRITICAL_DAYS);
    } else if (this.urgencyFilter === URGENCY_WARNING) {
      rows = rows.filter((r) => r.days <= CRITICAL_DAYS);
    } else if (this.urgencyFilter === URGENCY_DEADLINE) {
      rows = rows.filter((r) => r.hasNeededBy);
    }

    const sorted = [...rows];
    if (this.sortBy === SORT_DEADLINE) {
      // Items the meeting actually attached a date to come first; the rest keep their
      // aging order behind them rather than being sorted by a date nobody set.
      sorted.sort((a, b) => {
        if (a.hasNeededBy !== b.hasNeededBy) {
          return a.hasNeededBy ? -1 : 1;
        }
        if (!a.hasNeededBy) {
          return b.days - a.days;
        }
        return a.deadlineLabel > b.deadlineLabel ? 1 : -1;
      });
    } else if (this.sortBy === SORT_OPPORTUNITY) {
      sorted.sort((a, b) =>
        (a.opportunityName || "").localeCompare(b.opportunityName || "")
      );
    } else {
      sorted.sort((a, b) => b.days - a.days);
    }
    return sorted;
  }

  get hasAgendaItems() {
    return this.agendaItems.length > 0;
  }

  get agendaIsFilteredEmpty() {
    return !this.hasAgendaItems && this.allAgendaItems.length > 0;
  }

  get agendaCountLabel() {
    const shown = this.agendaItems.length;
    const total = this.allAgendaItems.length;
    if (shown === total) {
      return total === 1 ? "1 decision" : `${total} decisions`;
    }
    return `${shown} of ${total} decisions`;
  }

  get agendaDescription() {
    const total = this.allAgendaItems.length;
    if (total === 0) {
      return "Questions a strategy meeting left unresolved, oldest first.";
    }
    const worst = this.allAgendaItems.reduce((m, r) => Math.max(m, r.days), 0);
    return `Questions a strategy meeting left unresolved, oldest first. The longest has been open ${worst} days.`;
  }

  get urgencyOptions() {
    return [
      { label: "Every aging decision", value: URGENCY_ALL },
      { label: "Open more than 14 days", value: URGENCY_CRITICAL },
      { label: "Open 8 to 14 days", value: URGENCY_WARNING },
      { label: "Has a deadline", value: URGENCY_DEADLINE }
    ];
  }

  get sortOptions() {
    return [
      { label: "Longest open first", value: SORT_OLDEST },
      { label: "Soonest needed first", value: SORT_DEADLINE },
      { label: "Opportunity A–Z", value: SORT_OPPORTUNITY }
    ];
  }

  get agendaFiltersActive() {
    return (
      this.searchTerm !== "" ||
      this.urgencyFilter !== URGENCY_ALL ||
      this.sortBy !== SORT_OLDEST
    );
  }

  handleSearch(event) {
    this.searchTerm = event.target.value || "";
  }

  handleUrgency(event) {
    this.urgencyFilter = event.detail.value;
  }

  handleSort(event) {
    this.sortBy = event.detail.value;
  }

  handleClearAgendaFilters() {
    this.searchTerm = "";
    this.urgencyFilter = URGENCY_ALL;
    this.sortBy = SORT_OLDEST;
  }

  toggleAgendaRow(event) {
    const id = event.currentTarget.dataset.id;
    this.expandedId = this.expandedId === id ? undefined : id;
  }

  // ------------------------------------------------------------------- KPIs

  get sessionsThisWeek() {
    return this.summary?.sessionsThisWeek || 0;
  }

  get sessionsAllTime() {
    return this.summary?.sessionsAllTime || 0;
  }

  get sessionsSupport() {
    const n = this.sessionsAllTime;
    return n === 1 ? "1 logged all time" : `${n} logged all time`;
  }

  get openDecisions() {
    return this.summary?.openDecisions || 0;
  }

  get decisionsResolved() {
    return this.summary?.decisionsResolved || 0;
  }

  get decisionsTotal() {
    return this.openDecisions + this.decisionsResolved;
  }

  get decisionsResolvedPct() {
    return this.decisionsTotal > 0
      ? Math.round((this.decisionsResolved / this.decisionsTotal) * 100)
      : 0;
  }

  get decisionsProgressLabel() {
    return `${this.decisionsResolvedPct}% of every decision raised is resolved`;
  }

  get agingCount() {
    return this.summary?.agingDecisionCount || 0;
  }

  get decisionsTone() {
    if (this.agingCount > 0) {
      return "critical";
    }
    return this.openDecisions > 0 ? "warning" : "success";
  }

  get decisionsStatusLabel() {
    if (this.agingCount > 0) {
      return this.agingCount === 1
        ? "1 aging past a week"
        : `${this.agingCount} aging past a week`;
    }
    return "None aging";
  }

  get decisionsStatusTone() {
    return this.agingCount > 0 ? "critical" : "success";
  }

  get decisionsSupport() {
    return `${this.decisionsResolved} of ${this.decisionsTotal} resolved so far`;
  }

  get actionItemsCreated() {
    return this.summary?.actionItemsCreated || 0;
  }

  get actionItemsCompleted() {
    return this.summary?.actionItemsCompleted || 0;
  }

  get actionCompletionPct() {
    return this.actionItemsCreated > 0
      ? Math.round((this.actionItemsCompleted / this.actionItemsCreated) * 100)
      : 0;
  }

  get actionSupport() {
    return `of ${this.actionItemsCreated} Huddle created`;
  }

  get actionProgressLabel() {
    return `${this.actionCompletionPct}% of Huddle's action items closed`;
  }

  get actionEmptyMessage() {
    return this.actionItemsCreated === 0 ? "No action items yet" : undefined;
  }

  get ownerUnclear() {
    return this.summary?.actionItemsOwnerUnclear || 0;
  }

  get hasOwnerUnclear() {
    return this.ownerUnclear > 0;
  }

  get unclearTone() {
    return this.hasOwnerUnclear ? "critical" : "success";
  }

  get unclearIcon() {
    return this.hasOwnerUnclear ? "utility:warning" : "utility:success";
  }

  get unclearStatusLabel() {
    return this.hasOwnerUnclear ? "Needs reassignment" : "All assigned";
  }

  get unclearStatusTone() {
    return this.hasOwnerUnclear ? "critical" : "success";
  }

  get unclearSupport() {
    return this.hasOwnerUnclear
      ? "Parked with the note-taker until somebody claims them"
      : "Every action item Huddle created has an owner";
  }

  get unclearAction() {
    return this.hasOwnerUnclear ? "Open the task list" : undefined;
  }

  // Actions across the last seven days, plus an honest read on the direction: the
  // most recent three days against the three before them. Comparable windows only.
  get actionsLast7() {
    return (this.summary?.trend || []).reduce((sum, t) => sum + t.count, 0);
  }

  get activityTrend() {
    const series = this.summary?.trend || [];
    if (series.length < 6) {
      return { label: null, direction: "flat", meaning: "neutral" };
    }
    const recent = series.slice(-3).reduce((s, t) => s + t.count, 0);
    const prior = series.slice(-6, -3).reduce((s, t) => s + t.count, 0);
    const delta = recent - prior;
    if (delta === 0) {
      return {
        label: "Level with the 3 days before",
        direction: "flat",
        meaning: "neutral"
      };
    }
    return {
      label: `${delta > 0 ? "+" : ""}${delta} vs the 3 days before`,
      direction: delta > 0 ? "up" : "down",
      // More strategy work getting logged is the good direction for this tool.
      meaning: delta > 0 ? "positive" : "negative"
    };
  }

  get activityTrendLabel() {
    return this.activityTrend.label;
  }

  get activityTrendDirection() {
    return this.activityTrend.direction;
  }

  get activityTrendMeaning() {
    return this.activityTrend.meaning;
  }

  // ------------------------------------------------------------ activity region

  get activitySectionCount() {
    const n = this.actionsLast7;
    return n === 1 ? "1 action logged" : `${n} actions logged`;
  }

  handleActivityToggle(event) {
    this.activityCollapsed = event.detail.collapsed;
  }

  handleTableToggle(event) {
    this.tableCollapsed = event.detail.collapsed;
  }

  get showActivity() {
    return !this.activityCollapsed;
  }

  get showTable() {
    return !this.tableCollapsed;
  }

  get byType() {
    return this.toBars(this.summary?.byType);
  }

  get topContributors() {
    return this.toBars(this.summary?.topContributors);
  }

  /**
   * Bars share the one accent hue. Shading each bar by its own value would encode
   * magnitude twice and burn the only free channel on what the length already says.
   */
  toBars(tallies) {
    const rows = tallies || [];
    const max = rows.reduce((m, t) => Math.max(m, t.count), 0) || 1;
    return rows.map((t) => ({
      key: t.label,
      label: t.label,
      count: t.count,
      style: `width:${Math.max((t.count / max) * 100, 1)}%`,
      alt: `${t.label}: ${t.count}`
    }));
  }

  get hasByType() {
    return this.byType.length > 0;
  }

  get hasContributors() {
    return this.topContributors.length > 0;
  }

  // ---------------------------------------------------------------- trend plot

  get trend() {
    const raw = this.summary?.trend || [];
    if (raw.length === 0) {
      return null;
    }
    const max = raw.reduce((m, t) => Math.max(m, t.count), 0) || 1;
    const plotW = T.w - T.left - T.right;
    const plotH = T.h - T.top - T.bottom;
    const step = raw.length > 1 ? plotW / (raw.length - 1) : 0;
    const baseline = T.top + plotH;

    const points = raw.map((t, i) => {
      const x = T.left + i * step;
      const y = baseline - (t.count / max) * plotH;
      return {
        key: `${t.label}-${i}`,
        x,
        y,
        label: t.label,
        count: t.count,
        // Hit target spans the full band, so hovering never needs pixel precision.
        hitX: x - step / 2,
        hitW: step || plotW,
        tooltipStyle: `left:${((x / T.w) * 100).toFixed(2)}%; top:${((y / T.h) * 100).toFixed(2)}%`
      };
    });

    const line = points
      .map(
        (p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`
      )
      .join(" ");
    const last = points[points.length - 1];
    const first = points[0];

    return {
      viewBox: `0 0 ${T.w} ${T.h}`,
      points,
      line,
      area: `${line} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`,
      baseline,
      top: T.top,
      left: T.left,
      right: T.w - T.right,
      max,
      maxLabel: String(max),
      tickY: baseline + 16,
      firstLabel: first.label,
      lastLabel: last.label,
      // Only the endpoint is directly labelled; the axis and tooltip carry the rest.
      end: last
    };
  }

  get hasTrend() {
    return this.trend !== null && this.actionsLast7 > 0;
  }

  handleTrendEnter(event) {
    const key = event.currentTarget.dataset.key;
    this.hovered = this.trend.points.find((p) => p.key === key);
  }

  handleTrendLeave() {
    this.hovered = undefined;
  }

  get hoveredTooltip() {
    if (!this.hovered) {
      return null;
    }
    return {
      style: this.hovered.tooltipStyle,
      text: `${this.hovered.label}: ${this.hovered.count}`
    };
  }

  // ------------------------------------------------------- table twin of charts

  get tableRows() {
    const rows = [];
    this.byType.forEach((t) =>
      rows.push({
        key: `type-${t.label}`,
        group: "Change type",
        label: t.label,
        count: t.count
      })
    );
    this.topContributors.forEach((t) =>
      rows.push({
        key: `rep-${t.label}`,
        group: "Contributor",
        label: t.label,
        count: t.count
      })
    );
    (this.summary?.trend || []).forEach((t, i) =>
      rows.push({
        key: `day-${i}`,
        group: "Daily activity",
        label: t.label,
        count: t.count
      })
    );
    return rows;
  }

  get hasTableRows() {
    return this.tableRows.length > 0;
  }

  // ------------------------------------------------------------------ actions

  openRecord(event) {
    // The question is a real anchor so it is focusable and reads as a link, but the
    // navigation is the framework's job, not the browser's.
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const recordId = event.currentTarget.dataset.id;
    if (!recordId) {
      return;
    }
    this[NavigationMixin.Navigate]({
      type: "standard__recordPage",
      attributes: { recordId, actionName: "view" }
    });
  }

  navigateToOpenDecisions() {
    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: {
        objectApiName: "Huddle_Open_Decision__c",
        actionName: "list"
      },
      state: { filterName: "All" }
    });
  }

  navigateToUnclearTasks() {
    this[NavigationMixin.Navigate]({
      type: "standard__objectPage",
      attributes: { objectApiName: "Task", actionName: "list" },
      state: { filterName: "All" }
    });
  }

  // -------------------------------------------------------------- diagnostics

  /**
   * Raw Apex/JS text is useless to a sales manager and essential to whoever has to
   * fix it, so both survive: a sentence on screen, the original in the console and
   * behind the error state's disclosure.
   */
  captureError(error) {
    const raw = this.rawError(error);
    console.error("[huddleHomeDashboard] getSummary failed:", error);
    this.errorMessage =
      "Huddle could not load the briefing. This is usually a permissions gap on the strategy log or change log objects, or a temporary connection problem.";
    this.errorDetail = raw;
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
