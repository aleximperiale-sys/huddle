import { LightningElement, api } from "lwc";

/**
 * Placeholder geometry for content that has not arrived yet.
 *
 * Every variant is sized to the box its real content will occupy, so the page does
 * not reflow when the data lands. That is the whole reason this is a component and
 * not an ad-hoc grey div in three different templates: the heights have to stay in
 * lockstep with the layouts they stand in for.
 */
const VARIANTS = {
  kpi: { rows: 1, minHeight: "7.5rem" },
  agenda: { rows: 3, minHeight: "auto" },
  rows: { rows: 5, minHeight: "auto" },
  bars: { rows: 4, minHeight: "auto" },
  chart: { rows: 1, minHeight: "11rem" },
  lines: { rows: 3, minHeight: "auto" },
  stat: { rows: 1, minHeight: "3rem" }
};

// Staggered widths read as text rather than as a solid block.
const LINE_WIDTHS = ["92%", "78%", "85%", "64%", "88%", "72%"];

export default class HuddleSkeletonLoader extends LightningElement {
  /** kpi | agenda | rows | bars | chart | lines | stat */
  @api variant = "lines";

  /** Override the number of placeholder rows for the row-based variants. */
  @api count;

  /** Announced to assistive tech while the placeholder is on screen. */
  @api label = "Loading";

  get spec() {
    return VARIANTS[this.variant] || VARIANTS.lines;
  }

  get rowCount() {
    const parsed = parseInt(this.count, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : this.spec.rows;
  }

  get items() {
    const out = [];
    for (let i = 0; i < this.rowCount; i++) {
      out.push({
        key: `sk-${i}`,
        primaryStyle: `width:${LINE_WIDTHS[i % LINE_WIDTHS.length]}`,
        secondaryStyle: `width:${LINE_WIDTHS[(i + 3) % LINE_WIDTHS.length]}`,
        // Bars decay so the placeholder does not read as real magnitude.
        barStyle: `width:${Math.max(70 - i * 13, 18)}%`
      });
    }
    return out;
  }

  get hostStyle() {
    return `min-height:${this.spec.minHeight}`;
  }

  get isKpi() {
    return this.variant === "kpi";
  }

  get isAgenda() {
    return this.variant === "agenda";
  }

  get isRows() {
    return this.variant === "rows";
  }

  get isBars() {
    return this.variant === "bars";
  }

  get isChart() {
    return this.variant === "chart";
  }

  get isStat() {
    return this.variant === "stat";
  }
}
