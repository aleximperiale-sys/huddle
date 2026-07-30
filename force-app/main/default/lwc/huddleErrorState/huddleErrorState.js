import { LightningElement, api } from "lwc";

/**
 * The human-language half of an error. Callers pass a sentence a salesperson can
 * act on and, separately, the raw Apex/JS text for whoever has to debug it. The raw
 * text is kept on the page behind a disclosure rather than dropped, because a
 * friendly message that loses the diagnostic just moves the problem to the console.
 */
export default class HuddleErrorState extends LightningElement {
  /** Human-language sentence. */
  @api message = "Huddle could not load this section.";

  /** Raw error text, shown only when the user opens the details. */
  @api detail;

  /** Omit to hide the retry button (for errors retrying cannot fix). */
  @api retryLabel;

  /** Set while the retry is in flight, so the button reports itself. */
  @api retrying = false;

  /** 'inline' renders a full-width SLDS alert instead of a centred block. */
  @api variant;

  showDetail = false;

  get isInline() {
    return this.variant === "inline";
  }

  get hasRetry() {
    return Boolean(this.retryLabel);
  }

  get hasDetail() {
    return Boolean(this.detail);
  }

  get retryButtonLabel() {
    return this.retrying ? "Retrying…" : this.retryLabel;
  }

  get detailToggleLabel() {
    return this.showDetail ? "Hide technical details" : "Technical details";
  }

  handleRetry() {
    this.dispatchEvent(new CustomEvent("retry"));
  }

  toggleDetail() {
    this.showDetail = !this.showDetail;
  }
}
