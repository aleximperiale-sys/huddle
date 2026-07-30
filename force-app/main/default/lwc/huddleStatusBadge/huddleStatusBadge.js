import { LightningElement, api } from "lwc";

/**
 * A status pill. Tone drives the colour, but the label is always rendered and an
 * icon always ships with it, so no state in Huddle is ever communicated by hue
 * alone. Callers that only have a tone get a sensible default icon; callers with a
 * better one pass it.
 */
const TONES = {
  neutral: { icon: "utility:dash", className: "pill pill_neutral" },
  info: { icon: "utility:info", className: "pill pill_info" },
  accent: { icon: "utility:record", className: "pill pill_accent" },
  success: { icon: "utility:check", className: "pill pill_success" },
  warning: { icon: "utility:warning", className: "pill pill_warning" },
  critical: { icon: "utility:error", className: "pill pill_critical" }
};

export default class HuddleStatusBadge extends LightningElement {
  /** neutral | info | accent | success | warning | critical */
  @api tone = "neutral";

  /** Visible text. Required - a pill with no label is a colour swatch. */
  @api label;

  /** Optional icon override. */
  @api iconName;

  /** Extra text read out by assistive tech but not shown (e.g. "aging"). */
  @api assistiveText;

  get spec() {
    return TONES[this.tone] || TONES.neutral;
  }

  get computedClass() {
    return this.spec.className;
  }

  get computedIcon() {
    return this.iconName || this.spec.icon;
  }

  get iconAlternativeText() {
    return this.assistiveText || this.label;
  }
}
