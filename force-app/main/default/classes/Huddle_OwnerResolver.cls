/**
 * Turns the owner hint the recap gave ("Priya", "Dan Ortiz", "the SE", "I'll") into
 * an actual User, or admits it cannot.
 *
 * This class is deliberately willing to fail. Huddle assigns work to people other
 * than the one entering the notes, so a wrong guess lands real work on the wrong
 * person's queue. A name that matches nobody, matches several people, or is only a
 * role gets returned unresolved with a reason, and the caller creates the Task
 * flagged "owner unclear" rather than picking a plausible user.
 */
public with sharing class Huddle_OwnerResolver {
  public class Resolution {
    @AuraEnabled
    public String hint; // What the recap said.
    @AuraEnabled
    public Id userId; // Resolved user, null when unresolved.
    @AuraEnabled
    public String userName; // Display name of the resolved user.
    @AuraEnabled
    public Boolean resolved = false;
    @AuraEnabled
    public String reason; // Why it could not be resolved, for the confirmation step.
  }

  /**
   * Resolve every hint in one pass. Bulk-safe: one User query for the whole batch
   * regardless of how many action items the meeting produced.
   *
   * @param hints      owner hints straight from the extraction
   * @param fallbackId the user entering the notes, used only for a literal "me"
   */
  public static Map<String, Resolution> resolveAll(
    List<String> hints,
    Id fallbackId
  ) {
    Map<String, Resolution> out = new Map<String, Resolution>();
    Set<String> searchable = new Set<String>();

    for (String hint : hints) {
      String key = normalizeKey(hint);
      if (out.containsKey(key)) {
        continue;
      }
      Resolution r = new Resolution();
      r.hint = hint;
      out.put(key, r);

      if (String.isBlank(hint)) {
        r.reason = 'The recap named the action but not who owns it.';
        continue;
      }
      if (hint.equalsIgnoreCase('me')) {
        r.userId = fallbackId;
        r.resolved = true;
        r.userName = nameFor(fallbackId);
        continue;
      }
      if (isRoleOnly(hint)) {
        r.reason =
          'The recap named a role ("' +
          hint +
          '") rather than a person, so Huddle cannot tell which user is meant.';
        continue;
      }
      searchable.add(hint);
    }

    if (searchable.isEmpty()) {
      return out;
    }

    // Gather candidates for every searchable hint in a single query. LIKE
    // patterns are built from the hint but bound, never concatenated into SOQL.
    List<String> patterns = new List<String>();
    for (String hint : searchable) {
      patterns.add(hint + '%');
    }
    List<User> candidates = [
      SELECT Id, Name, FirstName, LastName
      FROM User
      WHERE
        IsActive = TRUE
        AND (Name LIKE :patterns
        OR FirstName LIKE :patterns)
      LIMIT 200
    ];

    for (String hint : searchable) {
      Resolution r = out.get(normalizeKey(hint));
      List<User> matches = matchesFor(hint, candidates);
      if (matches.size() == 1) {
        r.userId = matches[0].Id;
        r.userName = matches[0].Name;
        r.resolved = true;
      } else if (matches.isEmpty()) {
        r.reason = 'No active user matches "' + hint + '".';
      } else {
        r.reason =
          '"' +
          hint +
          '" matches ' +
          matches.size() +
          ' active users (' +
          previewNames(matches) +
          '), so Huddle cannot tell which one the meeting meant.';
      }
    }
    return out;
  }

  /** Look up a single hint. Convenience wrapper over resolveAll. */
  public static Resolution resolve(String hint, Id fallbackId) {
    return resolveAll(new List<String>{ hint }, fallbackId)
      .get(normalizeKey(hint));
  }

  public static String normalizeKey(String hint) {
    return String.isBlank(hint) ? '' : hint.trim().toLowerCase();
  }

  private static List<User> matchesFor(String hint, List<User> candidates) {
    String h = hint.trim().toLowerCase();
    List<User> exact = new List<User>();
    List<User> partial = new List<User>();
    for (User u : candidates) {
      String full = u.Name == null ? '' : u.Name.toLowerCase();
      String first = u.FirstName == null ? '' : u.FirstName.toLowerCase();
      if (full == h) {
        exact.add(u);
      } else if (first == h || full.startsWith(h + ' ')) {
        partial.add(u);
      }
    }
    // A full-name match is unambiguous even when several people share a first name.
    return !exact.isEmpty() ? exact : partial;
  }

  private static Boolean isRoleOnly(String hint) {
    Set<String> roles = new Set<String>{
      'sales engineer',
      'deal desk',
      'legal',
      'finance',
      'security',
      'rev ops',
      'customer success',
      'manager',
      'product',
      'marketing'
    };
    return roles.contains(hint.trim().toLowerCase());
  }

  private static String nameFor(Id userId) {
    if (userId == null) {
      return null;
    }
    List<User> users = [SELECT Name FROM User WHERE Id = :userId LIMIT 1];
    return users.isEmpty() ? null : users[0].Name;
  }

  private static String previewNames(List<User> users) {
    List<String> names = new List<String>();
    for (Integer i = 0; i < Math.min(3, users.size()); i++) {
      names.add(users[i].Name);
    }
    return String.join(names, ', ');
  }
}
