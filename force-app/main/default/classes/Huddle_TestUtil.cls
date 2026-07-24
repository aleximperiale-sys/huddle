/**
 * Shared fixtures for the Huddle test classes: an Account/Opportunity to hang
 * strategy logs off, and a couple of realistic meeting recaps that exercise the
 * distinctions the extraction engine is supposed to draw (decision vs. action item
 * vs. open question, named owner vs. role vs. nobody).
 */
@IsTest
public class Huddle_TestUtil {
  /** A recap with everything in it: strategy, reasoning, owned actions, an open question. */
  public static final String FULL_RECAP =
    'Attendees: Priya Raman, Dan Ortiz\n' +
    'We agreed to hold the discount until legal review completes, because finance flagged margin risk on this shape of deal. ' +
    'The plan is to lead with the migration story rather than price. ' +
    'Priya will put together the security questionnaire response by Friday. ' +
    'Dan Ortiz needs to reach out to their VP of Ops next week. ' +
    'I will draft the mutual action plan tomorrow. ' +
    'We still need to decide whether to bring the CISO in before the next call.';

  /** A recap that decides things but names nobody: must produce zero action items. */
  public static final String NO_OWNER_RECAP =
    'We decided to push the close date out a quarter because their budget cycle resets in April. ' +
    'The approach is to keep the champion warm and re-engage in Q2.';

  /** A recap naming an owner Huddle cannot resolve to a user. */
  public static final String UNRESOLVABLE_OWNER_RECAP = 'We agreed to escalate this deal. Zzyzxqvist will send the pricing exception request by Friday.';

  /** A recap naming only a role, never a person. */
  public static final String ROLE_ONLY_RECAP = 'The plan is to run a technical deep dive. The sales engineer will build the demo environment next week.';

  public static final String THIN_RECAP = 'Good huddle.';

  public static Opportunity createOpportunity() {
    Account a = new Account(Name = 'Huddle Test Account');
    insert a;
    Opportunity o = new Opportunity(
      Name = 'Huddle Test Opportunity',
      AccountId = a.Id,
      StageName = 'Qualification',
      CloseDate = Date.today().addDays(60),
      Amount = 75000
    );
    insert o;
    return o;
  }

  /** A strategy log with a cached extraction, as Log Strategy would leave it. */
  public static Huddle_Strategy_Log__c createStrategyLog(
    Id oppId,
    String recap
  ) {
    return createStrategyLog(oppId, recap, Date.today());
  }

  /** A strategy log for a meeting held on a given date, for exercising aging. */
  public static Huddle_Strategy_Log__c createStrategyLog(
    Id oppId,
    String recap,
    Date meetingDate
  ) {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(recap);
    Huddle_Strategy_Log__c log = new Huddle_Strategy_Log__c(
      Opportunity__c = oppId,
      Meeting_Recap__c = recap,
      Strategy_Summary__c = parse.strategySummary,
      Decision_Reasoning__c = parse.reasoning,
      Meeting_Date__c = meetingDate,
      Logged_By__c = UserInfo.getUserId(),
      Internal_Only__c = true,
      Source_Channel__c = 'Chat',
      Low_Confidence__c = parse.lowConfidence,
      Extraction_JSON__c = parse.toJsonString()
    );
    insert log;
    return log;
  }

  /**
   * A second active user, so cross-person assignment can actually be exercised.
   * The insert runs under System.runAs so mixing it with the Account/Opportunity
   * setup DML in one transaction does not trip MIXED_DML_OPERATION.
   */
  public static User createTeammate(String firstName, String lastName) {
    Profile p = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1];
    String unique =
      String.valueOf(Datetime.now().getTime()) +
      Math.round(Math.random() * 10000);
    User u = new User(
      FirstName = firstName,
      LastName = lastName,
      Alias = firstName.left(4).toLowerCase(),
      Email = 'huddle.test@example.com',
      Username = 'huddle.' + unique + '@example.com.invalid',
      ProfileId = p.Id,
      TimeZoneSidKey = 'America/New_York',
      LocaleSidKey = 'en_US',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    System.runAs(new User(Id = UserInfo.getUserId())) {
      insert u;
    }
    return u;
  }
}
