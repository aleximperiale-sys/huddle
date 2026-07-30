import { LightningElement, api } from "lwc";

/**
 * One KPI: a label, a prominent value, optional supporting text, an optional
 * completion meter, an optional trend, and its own loading / empty / error states.
 *
 * KPIs are the only place in Huddle that gets a real card. Everything on the agenda
 * side of the sheet is separated by rules instead, so a boxed tile here reads as
 * "this is a measure", not as generic decoration.
 */
const TONES = ["neutral", "accent", "success", "warning", "critical"];

const TREND_ICONS = {
  up: "utility:arrowup",
  down: "utility:arrowdown",
  flat: "utility:dash"
};

export default class HuddleKpiCard extends LightningElement {
  /** Short lower-case description of what is being counted. */
  @api label;

  /** The figure itself. */
  @api value;

  /** One line of context under the label (e.g. "of 24 created"). */
  @api supportingText;

  /** Utility or standard icon for the measure. */
  @api iconName;

  /** neutral | accent | success | warning | critical - tints the icon and meter. */
  @api tone = "neutral";

  /** 0–100. When set, renders a labelled completion meter. */
  @api progress;

  /** Screen-reader and visible text for the meter (e.g. "62% complete"). */
  @api progressLabel;

  /** e.g. "+3 vs last week". */
  @api trendLabel;

  /** up | down | flat */
  @api trendDirection;

  /** positive | negative | neutral - whether the direction is good news. */
  @api trendMeaning = "neutral";

  /** Optional status pill in the card's top-right corner. */
  @api statusLabel;

  /** Tone for that pill. */
  @api statusTone = "neutral";

  /** Swaps the body for a skeleton of the same height. */
  @api loading = false;

  /** Human-language failure for this one card. */
  @api errorMessage;

  /** Shown instead of the value when there is genuinely nothing to count. */
  @api emptyMessage;

  /** Renders a footer action that dispatches `action`. */
  @api actionLabel;

  get safeTone() {
    return TONES.includes(this.tone) ? this.tone : "neutral";
  }

  get cardClass() {
    return `kpi kpi_tone-${this.safeTone}`;
  }

  get hasError() {
    return Boolean(this.errorMessage) && !this.loading;
  }

  get isEmpty() {
    return !this.loading && !this.hasError && Boolean(this.emptyMessage);
  }

  get hasProgress() {
    return this.progressValue !== null;
  }

  get progressValue() {
    const parsed = Number(this.progress);
    if (
      this.progress === undefined ||
      this.progress === null ||
      Number.isNaN(parsed)
    ) {
      return null;
    }
    return Math.min(Math.max(Math.round(parsed), 0), 100);
  }

  get resolvedProgressLabel() {
    return this.progressLabel || `${this.progressValue}% complete`;
  }

  get hasTrend() {
    return Boolean(this.trendLabel);
  }

  get trendIcon() {
    return TREND_ICONS[this.trendDirection] || TREND_ICONS.flat;
  }

  get trendClass() {
    return `kpi__trend kpi__trend_${this.trendMeaning}`;
  }

  get hasStatus() {
    return Boolean(this.statusLabel);
  }

  get hasAction() {
    return Boolean(this.actionLabel);
  }

  get iconVariant() {
    // lightning-icon only ships error/warning/success variants; anything else is
    // tinted by the card's own tone class instead.
    if (this.safeTone === "critical") {
      return "error";
    }
    if (this.safeTone === "warning" || this.safeTone === "success") {
      return this.safeTone;
    }
    return "";
  }

  handleAction() {
    this.dispatchEvent(new CustomEvent("action"));
  }
}
