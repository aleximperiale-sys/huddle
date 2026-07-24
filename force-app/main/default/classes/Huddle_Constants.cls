/**
 * Central constants for Huddle. Keeping change-type and object names in one place
 * means the audit layer and every invocable speak exactly the same vocabulary.
 */
public with sharing class Huddle_Constants {
  // Change_Type__c picklist values (must match Huddle_Change_Log__c metadata).
  public static final String CHANGE_STRATEGY_LOGGED = 'Strategy Logged';
  public static final String CHANGE_TASK_CREATED = 'Task Created';
  public static final String CHANGE_DECISION_RAISED = 'Decision Raised';
  public static final String CHANGE_DECISION_RESOLVED = 'Decision Resolved';
  public static final String CHANGE_DIGEST_GENERATED = 'Digest Generated';

  // Object API names, used on change-log rows.
  public static final String OBJ_STRATEGY_LOG = 'Huddle_Strategy_Log__c';
  public static final String OBJ_OPEN_DECISION = 'Huddle_Open_Decision__c';
  public static final String OBJ_TASK = 'Task';
  public static final String OBJ_OPPORTUNITY = 'Opportunity';

  // Open_Decision__c.Status__c values.
  public static final String DECISION_OPEN = 'Open';
  public static final String DECISION_RESOLVED = 'Resolved';

  // Default due window (days) for an action item the meeting gave no timing cue for.
  public static final Integer DEFAULT_ACTION_DUE_DAYS = 5;

  // A decision open longer than this is what the dashboard surfaces as aging.
  public static final Integer DECISION_AGING_DAYS = 7;

  // Appended to a Task Huddle could not confidently assign, so the ambiguity travels
  // with the record instead of being silently resolved in Huddle's favour.
  public static final String OWNER_UNCLEAR_NOTE =
    'OWNER UNCLEAR: the meeting recap named this action item but not a person Huddle could ' +
    'resolve to a user. Reassign this task to whoever actually owns it.';
}
