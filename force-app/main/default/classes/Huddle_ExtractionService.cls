/**
 * The extraction/classification engine. Turns a free-form strategy-meeting recap
 * into one structured Huddle_MeetingParse. This is the ONLY place the raw text is
 * interpreted, so the strategy log, the action items and the open decisions all
 * agree with each other.
 *
 * Two design goals are enforced here rather than left to the agent's judgement:
 *
 *  - Never invent action items or ownership. A sentence only becomes an action
 *    item when it carries both an actionable verb AND a *specific* owner: a named
 *    person, a named role, or explicit first person singular. "We agreed to hold
 *    the discount" is a decision with no individual owner, so it stays in the
 *    strategy summary and never becomes somebody's task.
 *  - Preserve reasoning, not just outcomes. Reasoning-bearing sentences are pulled
 *    out separately, because "we're holding the discount" without "because finance
 *    flagged margin risk" is the half a new AE cannot use.
 */
public with sharing class Huddle_ExtractionService {
  // A sentence that states what the team decided to do.
  private static final Set<String> DECISION_CUES = new Set<String>{
    'we decided',
    'decided to',
    'the plan is',
    'plan is to',
    'we agreed',
    'agreed to',
    'we\'re going to',
    'we are going to',
    'we\'ll',
    'we will',
    'strategy is',
    'our approach',
    'the approach',
    'going with',
    'we\'re holding',
    'holding off',
    'we want to',
    'consensus was',
    'call is to',
    'lead with'
  };

  // A sentence that explains why. This is what survives a handoff.
  private static final Set<String> REASONING_CUES = new Set<String>{
    'because',
    'since',
    'given that',
    'the reason',
    'due to',
    'so that',
    'which is why',
    'rationale',
    'in order to',
    'the thinking is',
    'flagged',
    'the risk is',
    'otherwise'
  };

  // A sentence that admits something is unsettled.
  private static final Set<String> OPEN_CUES = new Set<String>{
    'still need to decide',
    'still needs to be decided',
    'need to decide',
    'open question',
    'tbd',
    'to be determined',
    'haven\'t decided',
    'have not decided',
    'not sure yet',
    'still unclear',
    'unclear whether',
    'need to figure out',
    'figure out whether',
    'need to work out',
    'unresolved',
    'up in the air',
    'question is whether',
    'need to determine',
    'still deciding',
    'no decision on'
  };

  // A sentence that describes work someone would do.
  private static final Set<String> ACTION_VERB_CUES = new Set<String>{
    'will ',
    'is going to',
    'needs to',
    'going to send',
    'owns',
    'take the',
    'takes the',
    'follow up',
    'loop in',
    'set up',
    'put together',
    'reach out',
    'prep ',
    'draft',
    'schedule',
    'send',
    'build',
    'pull together',
    'write up',
    'get us',
    'confirm',
    'chase'
  };

  // Roles a recap names instead of a person. Left as a hint; resolution to an
  // actual user is Huddle_OwnerResolver's job, and it is allowed to fail.
  private static final Map<String, String> ROLE_TOKENS = new Map<String, String>{
    'sales engineer' => 'Sales Engineer',
    'solutions engineer' => 'Sales Engineer',
    'the se' => 'Sales Engineer',
    'our se' => 'Sales Engineer',
    'deal desk' => 'Deal Desk',
    'legal' => 'Legal',
    'finance' => 'Finance',
    'security team' => 'Security',
    'rev ops' => 'Rev Ops',
    'revops' => 'Rev Ops',
    'customer success' => 'Customer Success',
    'the manager' => 'Manager',
    'my manager' => 'Manager',
    'product team' => 'Product',
    'marketing' => 'Marketing'
  };

  // Capitalised words that start sentences but are not people.
  private static final Set<String> STOP_NAMES = new Set<String>{
    'We',
    'The',
    'They',
    'He',
    'She',
    'It',
    'This',
    'That',
    'Our',
    'Their',
    'Next',
    'Also',
    'And',
    'But',
    'So',
    'Then',
    'If',
    'When',
    'Action',
    'Legal',
    'Finance',
    'Marketing',
    'Everyone',
    'Nobody',
    'Someone',
    'Both',
    'Deal',
    'Team',
    'Sales'
  };

  /**
   * Parse a raw recap into structured data. Everything returned traces to a
   * literal cue in the text; when the recap is too thin, lowConfidence is set and
   * the caller is expected to ask rather than guess.
   */
  public static Huddle_MeetingParse parse(String rawRecap) {
    Huddle_MeetingParse result = new Huddle_MeetingParse();
    if (String.isBlank(rawRecap) || rawRecap.trim().length() < 12) {
      result.lowConfidence = true;
      result.notes = 'The recap was empty or too short to extract anything reliably.';
      return result;
    }

    List<String> sentences = splitSentences(rawRecap);
    result.attendees = extractAttendees(rawRecap, sentences);

    List<String> decisionSentences = new List<String>();
    List<String> reasoningSentences = new List<String>();
    List<String> residual = new List<String>();

    for (String sentence : sentences) {
      String lower = sentence.toLowerCase();

      // Open questions are claimed first: "we still need to decide whether to
      // discount" is an unresolved question, not an action item and not a decision.
      if (hasCue(lower, OPEN_CUES)) {
        result.openQuestions.add(buildOpenQuestion(sentence, lower));
        continue;
      }

      // Then action items, which need a real owner as well as a real verb.
      if (hasCue(lower, ACTION_VERB_CUES) || isExplicitActionItem(lower)) {
        String owner = extractOwnerHint(sentence);
        if (String.isNotBlank(owner) || isExplicitActionItem(lower)) {
          result.actionItems.add(
            new Huddle_MeetingParse.ActionItem(
              cleanAction(sentence),
              owner,
              Huddle_Util.inferDueInDays(lower),
              sentence.trim()
            )
          );
          // An action sentence can also carry reasoning worth keeping.
          if (hasCue(lower, REASONING_CUES)) {
            reasoningSentences.add(sentence.trim());
          }
          continue;
        }
      }

      if (hasCue(lower, REASONING_CUES)) {
        reasoningSentences.add(sentence.trim());
      }
      if (hasCue(lower, DECISION_CUES)) {
        decisionSentences.add(sentence.trim());
      } else if (!hasCue(lower, REASONING_CUES)) {
        residual.add(sentence.trim());
      }
    }

    // The summary is the decisions when the recap stated any; otherwise it is
    // whatever narrative is left, which is honest about how much was said.
    result.strategySummary = !decisionSentences.isEmpty()
      ? String.join(decisionSentences, ' ')
      : String.join(residual, ' ');
    result.reasoning = String.join(reasoningSentences, ' ');

    if (
      String.isBlank(result.strategySummary) && String.isBlank(result.reasoning)
    ) {
      result.strategySummary = rawRecap.trim();
    }

    if (
      result.actionItems.isEmpty() &&
      result.openQuestions.isEmpty() &&
      String.isBlank(result.reasoning) &&
      rawRecap.trim().length() < 60
    ) {
      result.lowConfidence = true;
      result.notes = 'The recap was too vague to confidently extract a strategy, action items, or open decisions.';
    }
    return result;
  }

  /**
   * Return the single parse for a meeting, reusing the cached extraction on the
   * strategy log when available so downstream topics do not re-parse the text.
   * This is how "one set of notes, two outputs" is enforced in code rather than
   * left to the agent remembering to pass the same recap twice.
   */
  public static Huddle_MeetingParse resolve(
    Id strategyLogId,
    String meetingRecap
  ) {
    if (strategyLogId != null) {
      List<Huddle_Strategy_Log__c> logs = [
        SELECT Extraction_JSON__c, Meeting_Recap__c
        FROM Huddle_Strategy_Log__c
        WHERE Id = :strategyLogId
        WITH USER_MODE
        LIMIT 1
      ];
      if (!logs.isEmpty()) {
        Huddle_Strategy_Log__c log = logs[0];
        if (String.isNotBlank(log.Extraction_JSON__c)) {
          return Huddle_MeetingParse.fromJson(log.Extraction_JSON__c);
        }
        return parse(log.Meeting_Recap__c);
      }
    }
    return parse(meetingRecap);
  }

  // ---- extraction helpers ----

  /**
   * Pull the owner the recap actually named. Returns blank when the sentence does
   * not name one; callers must not fall back to a guess. Named people beat named
   * roles ("Priya will send it to legal" is Priya's action, not Legal's).
   */
  @TestVisible
  private static String extractOwnerHint(String sentence) {
    String s = sentence.trim()
      .replaceFirst('(?i)^\\s*action item\\s*[:\\-]\\s*', '');
    String lower = s.toLowerCase();

    // "Priya will draft..." / "Dan Ortiz needs to..." / "Sam owns..."
    Matcher m = Pattern.compile(
        '\\b([A-Z][a-z]{1,15}(?: [A-Z][a-z]{1,15})?)\\s+(?:will|is going to|needs to|should|owns|takes|is taking|agreed to|has to)\\b'
      )
      .matcher(s);
    while (m.find()) {
      String candidate = m.group(1);
      if (!isStopName(candidate)) {
        return candidate;
      }
    }

    // "have Priya put together..." / "ask Dan to confirm..." / "loop in Jess"
    Matcher m2 = Pattern.compile(
        '(?i)\\b(?:have|ask|get|loop in|hand to)\\s+([A-Z][a-z]{1,15}(?: [A-Z][a-z]{1,15})?)\\b'
      )
      .matcher(s);
    while (m2.find()) {
      String candidate = m2.group(1);
      if (!isStopName(candidate)) {
        return candidate;
      }
    }

    // Explicit first person singular: the person entering the notes owns it.
    if (
      lower.contains('i\'ll ') ||
      lower.contains('i will ') ||
      lower.contains('i am going to') ||
      lower.contains('i\'m going to')
    ) {
      return 'me';
    }

    // A named role, when no person was named.
    for (String token : ROLE_TOKENS.keySet()) {
      if (lower.contains(token)) {
        return ROLE_TOKENS.get(token);
      }
    }
    return '';
  }

  @TestVisible
  private static Huddle_MeetingParse.OpenQuestion buildOpenQuestion(
    String sentence,
    String lower
  ) {
    String q = sentence.trim();
    // Strip the lead-in so the record reads as the question itself.
    String cleaned = q.replaceFirst(
      '(?i)^.*?(?:still need to decide|need to decide|open question(?:\\s+is)?|need to figure out|need to work out|need to determine|question is whether)\\s*[:,]?\\s*',
      ''
    );
    if (String.isBlank(cleaned) || cleaned.length() < 8) {
      cleaned = q;
    }
    return new Huddle_MeetingParse.OpenQuestion(
      capitalize(cleaned),
      q,
      Huddle_Util.inferDueInDays(lower)
    );
  }

  /**
   * Who was in the room. Prefers an explicit "attendees:" line; otherwise falls
   * back to the distinct names the recap attached actions to, which is the only
   * other thing the text actually asserts about who was there.
   */
  @TestVisible
  private static List<String> extractAttendees(
    String raw,
    List<String> sentences
  ) {
    List<String> out = new List<String>();
    Set<String> seen = new Set<String>();
    Matcher m = Pattern.compile(
        '(?im)^\\s*(?:attendees|present|in the room|with)\\s*[:\\-]\\s*(.+)$'
      )
      .matcher(raw);
    if (m.find()) {
      for (String part : m.group(1).split('(?i),|\\band\\b|/|&')) {
        String name = part.trim();
        if (
          name.length() > 1 &&
          name.length() < 60 &&
          !seen.contains(name.toLowerCase())
        ) {
          seen.add(name.toLowerCase());
          out.add(name);
        }
      }
      return out;
    }
    for (String sentence : sentences) {
      String owner = extractOwnerHint(sentence);
      if (
        String.isNotBlank(owner) &&
        owner != 'me' &&
        !ROLE_TOKENS.values().contains(owner) &&
        !seen.contains(owner.toLowerCase())
      ) {
        seen.add(owner.toLowerCase());
        out.add(owner);
      }
    }
    return out;
  }

  private static Boolean isExplicitActionItem(String lower) {
    return lower.startsWith('action item') || lower.contains('action item:');
  }

  private static Boolean isStopName(String candidate) {
    return STOP_NAMES.contains(candidate) ||
      STOP_NAMES.contains(candidate.split(' ')[0]);
  }

  private static Boolean hasCue(String lower, Set<String> cues) {
    for (String cue : cues) {
      if (lower.contains(cue)) {
        return true;
      }
    }
    return false;
  }

  @TestVisible
  private static List<String> splitSentences(String raw) {
    List<String> out = new List<String>();
    for (String part : raw.split('[\\.\\!\\?\\n;]')) {
      if (part != null && part.trim().length() > 0) {
        out.add(part.trim());
      }
    }
    return out;
  }

  private static String cleanAction(String sentence) {
    String s = sentence.trim();
    s = s.replaceFirst('^[\\-\\*\\u2022\\s]+', '');
    s = s.replaceFirst('(?i)^\\s*action item\\s*[:\\-]\\s*', '');
    if (s.length() > 200) {
      s = s.substring(0, 197) + '...';
    }
    return capitalize(s);
  }

  private static String capitalize(String s) {
    if (String.isBlank(s)) {
      return s;
    }
    return s.substring(0, 1).toUpperCase() + s.substring(1);
  }
}
