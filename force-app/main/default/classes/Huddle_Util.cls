/**
 * Small shared helpers for the invocables: Id coercion and timing-cue parsing that
 * degrade gracefully instead of throwing on the loose strings an agent passes.
 */
public with sharing class Huddle_Util {
  /** Parse a string Id, returning null (not throwing) on blank/invalid input. */
  public static Id toIdOrNull(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    try {
      return Id.valueOf(value.trim());
    } catch (Exception e) {
      return null;
    }
  }

  /** Parse a User Id, falling back to the running user when blank/invalid. */
  public static Id toIdOrRunningUser(String value) {
    Id parsed = toIdOrNull(value);
    return parsed != null ? parsed : UserInfo.getUserId();
  }

  /** Parse a loose date string ("2026-08-01", "8/1/2026") into a Date, or null. */
  public static Date toDateOrNull(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    String v = value.trim();
    try {
      return Date.valueOf(v);
    } catch (Exception e) {
      // fall through to alternate formats
    }
    try {
      return Date.parse(v);
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Turn a timing phrase into a day offset. Returns null when the text gives no
   * cue at all, which callers treat as "the meeting didn't say" rather than
   * inventing a deadline.
   */
  public static Integer inferDueInDays(String lowerText) {
    if (String.isBlank(lowerText)) {
      return null;
    }
    String s = lowerText.toLowerCase();
    if (
      s.contains('today') ||
      s.contains('right away') ||
      s.contains('this afternoon')
    ) {
      return 0;
    }
    if (s.contains('tomorrow')) {
      return 1;
    }
    if (
      s.contains('this week') ||
      s.contains('by friday') ||
      s.contains('by eow') ||
      s.contains('end of week')
    ) {
      return 3;
    }
    if (
      s.contains('before the next call') || s.contains('ahead of the next call')
    ) {
      return 4;
    }
    if (s.contains('next week')) {
      return 7;
    }
    if (
      s.contains('end of month') ||
      s.contains('end of the month') ||
      s.contains('by eom')
    ) {
      return 14;
    }
    if (s.contains('next month')) {
      return 30;
    }
    Matcher m = Pattern.compile('in (\\d{1,2}) (day|business day|week)')
      .matcher(s);
    if (m.find()) {
      Integer n = Integer.valueOf(m.group(1));
      return m.group(2) == 'week' ? n * 7 : n;
    }
    return null;
  }

  /** Trim to a field's max length without throwing on nulls. */
  public static String clip(String val, Integer max) {
    if (val == null) {
      return null;
    }
    return val.length() > max ? val.substring(0, max) : val;
  }
}
