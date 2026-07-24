import { LightningElement, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getSummary from "@salesforce/apex/Huddle_HomeDashboardController.getSummary";

// Ring geometry. One shared spec so every meter on the page reads as the same mark.
const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

// Trend plot. The viewBox scales uniformly (preserveAspectRatio defaults to
// "meet"), so strokes, text and dots keep their proportions at any card width.
// The bottom padding is the x-axis band: the container has to include it, or the
// tick labels get cut off and the card grows a nested scrollbar.
// A wide aspect (~5.3:1) keeps the rendered height sane once the card scales it:
// ~170px tall at 900px wide, ~113px at 600px.
const T = { w: 900, h: 170, left: 10, right: 56, top: 16, bottom: 28 };

export default class HuddleHomeDashboard extends NavigationMixin(
  LightningElement
) {
  summary;
  error;
  showTable = false;
  hovered;

  @wire(getSummary)
  wiredSummary({ data, error }) {
    if (data) {
      this.summary = data;
      this.error = undefined;
    } else if (error) {
      this.error = this.reduceError(error);
    }
  }

  // ---- KPI tiles ----

  get actionRing() {
    const done = this.summary?.actionItemsCompleted || 0;
    const total = this.summary?.actionItemsCreated || 0;
    return this.buildRing(
      done,
      total,
      `${done} of ${total} action items completed`
    );
  }

  get decisionRing() {
    const resolved = this.summary?.decisionsResolved || 0;
    const open = this.summary?.openDecisions || 0;
    const total = resolved + open;
    return this.buildRing(
      resolved,
      total,
      `${resolved} of ${total} decisions resolved`
    );
  }

  /** A meter: a value against its limit. The track is a lighter step of the fill's own ramp. */
  buildRing(value, total, alt) {
    const pct = total > 0 ? value / total : 0;
    return {
      r: RING_R,
      circumference: RING_C,
      // Two-number dasharray: filled arc, then the remainder as the gap.
      dash: `${(pct * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`,
      label: `${Math.round(pct * 100)}%`,
      value,
      total,
      alt
    };
  }

  get sessionsThisWeek() {
    return this.summary?.sessionsThisWeek || 0;
  }

  get sessionsAllTime() {
    return this.summary?.sessionsAllTime || 0;
  }

  get openDecisions() {
    return this.summary?.openDecisions || 0;
  }

  get ownerUnclear() {
    return this.summary?.actionItemsOwnerUnclear || 0;
  }

  get hasOwnerUnclear() {
    return this.ownerUnclear > 0;
  }

  // Severity is carried by an icon and the word beside it, never by hue alone.
  get unclearIcon() {
    return this.hasOwnerUnclear ? "utility:warning" : "utility:success";
  }

  get unclearIconVariant() {
    return this.hasOwnerUnclear ? "warning" : "success";
  }

  get unclearClass() {
    return this.hasOwnerUnclear ? "tile__sub status--warning" : "tile__sub";
  }

  get unclearWord() {
    return this.hasOwnerUnclear ? "Needs reassignment" : "All assigned";
  }

  // ---- data bars ----

  get byType() {
    return this.toBars(this.summary?.byType);
  }

  get topContributors() {
    return this.toBars(this.summary?.topContributors);
  }

  /**
   * Bars share one accent hue. Shading each bar by its own value would double-encode
   * length as color and burn the only free channel on information the bar already
   * shows, so magnitude lives in the length alone.
   */
  toBars(tallies) {
    const rows = tallies || [];
    const max = rows.reduce((m, t) => Math.max(m, t.count), 0) || 1;
    return rows.map((t) => ({
      key: t.label,
      label: t.label,
      count: t.count,
      style: `width:${Math.max((t.count / max) * 100, 1)}%`
    }));
  }

  get hasByType() {
    return this.byType.length > 0;
  }

  get hasContributors() {
    return this.topContributors.length > 0;
  }

  // ---- trend ----

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
      // Only the endpoint is directly labeled; the axis and tooltip carry the rest.
      end: last
    };
  }

  get hasTrend() {
    return this.trend !== null;
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

  // ---- aging decisions ----

  get agingDecisions() {
    return (this.summary?.agingDecisions || []).map((d) => ({
      ...d,
      // Past two weeks it stops being "aging" and starts being a problem.
      icon: d.daysOpen > 14 ? "utility:error" : "utility:warning",
      iconVariant: d.daysOpen > 14 ? "error" : "warning",
      severityClass:
        d.daysOpen > 14
          ? "aging-item__age status--critical"
          : "aging-item__age status--warning",
      ageLabel: `${d.daysOpen}d open`
    }));
  }

  get hasAging() {
    return this.agingDecisions.length > 0;
  }

  // ---- table view ----

  toggleTable() {
    this.showTable = !this.showTable;
  }

  get tableLabel() {
    return this.showTable ? "Hide table view" : "Show table view";
  }

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
