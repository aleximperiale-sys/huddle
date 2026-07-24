/**
 * Tests for the four invocables and the owner resolver.
 *
 * The two guardrails these exist to defend are: nothing is written until the
 * attendee has confirmed the assignments (apply=false must leave the org
 * untouched), and every write produces a change-log row.
 */
@IsTest
private class Huddle_Invocables_Test {
  @IsTest
  static void logStrategyCreatesInternalOnlyRecordAndAuditRow() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();

    Huddle_LogStrategyInvocable.Request req = new Huddle_LogStrategyInvocable.Request();
    req.meetingRecap = Huddle_TestUtil.FULL_RECAP;
    req.opportunityId = opp.Id;

    Test.startTest();
    List<Huddle_LogStrategyInvocable.Response> res = Huddle_LogStrategyInvocable.run(
      new List<Huddle_LogStrategyInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.isTrue(res[0].success);
    Assert.areEqual(3, res[0].actionItemCount);
    Assert.areEqual(1, res[0].openQuestionCount);

    Huddle_Strategy_Log__c log = [
      SELECT
        Internal_Only__c,
        Strategy_Summary__c,
        Decision_Reasoning__c,
        Extraction_JSON__c,
        Attendees__c
      FROM Huddle_Strategy_Log__c
      WHERE Id = :res[0].strategyLogId
    ];
    Assert.isTrue(
      log.Internal_Only__c,
      'Strategy logs are internal-only at the data-model level'
    );
    Assert.isTrue(
      log.Decision_Reasoning__c.contains('margin risk'),
      'The reasoning must be stored, not just the outcome'
    );
    Assert.isTrue(
      String.isNotBlank(log.Extraction_JSON__c),
      'The single extraction is cached for downstream topics'
    );
    Assert.isTrue(log.Attendees__c.contains('Priya Raman'));

    List<Huddle_Change_Log__c> audit = [
      SELECT Change_Type__c, Related_Record_Id__c, Opportunity__c
      FROM Huddle_Change_Log__c
    ];
    Assert.areEqual(
      1,
      audit.size(),
      'Logging strategy must produce exactly one audit row'
    );
    Assert.areEqual(
      Huddle_Constants.CHANGE_STRATEGY_LOGGED,
      audit[0].Change_Type__c
    );
    Assert.areEqual(opp.Id, audit[0].Opportunity__c);
  }

  @IsTest
  static void logStrategyFlagsAThinRecap() {
    Huddle_LogStrategyInvocable.Request req = new Huddle_LogStrategyInvocable.Request();
    req.meetingRecap = Huddle_TestUtil.THIN_RECAP;

    List<Huddle_LogStrategyInvocable.Response> res = Huddle_LogStrategyInvocable.run(
      new List<Huddle_LogStrategyInvocable.Request>{ req }
    );

    Assert.isTrue(res[0].lowConfidence);
    Assert.isTrue(
      res[0].summary.contains('thin'),
      'The agent should be told to ask for more detail'
    );
    Assert.isTrue(
      [SELECT Low_Confidence__c FROM Huddle_Strategy_Log__c LIMIT 1]
      .Low_Confidence__c
    );
  }

  @IsTest
  static void previewingActionItemsWritesNothing() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.opportunityId = opp.Id;
    req.apply = false;

    Test.startTest();
    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.isFalse(res[0].applied);
    Assert.areEqual(
      3,
      res[0].taskCount,
      'The preview should list every proposed assignment'
    );
    Assert.isTrue(
      res[0].assignments.contains('Priya'),
      'The preview names who is getting what'
    );
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Task WHERE Huddle_Generated__c = TRUE],
      'apply=false must not create a single Task'
    );
    Assert.areEqual(
      0,
      [
        SELECT COUNT()
        FROM Huddle_Change_Log__c
        WHERE Change_Type__c = :Huddle_Constants.CHANGE_TASK_CREATED
      ],
      'A preview is not a change, so it writes no audit row'
    );
  }

  @IsTest
  static void applyingActionItemsCreatesTasksAndAuditsEveryOne() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.opportunityId = opp.Id;
    req.apply = true;

    Test.startTest();
    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.isTrue(res[0].applied);
    Assert.areEqual(3, res[0].taskCount);

    List<Task> tasks = [
      SELECT
        Subject,
        WhatId,
        ActivityDate,
        Huddle_Owner_Unclear__c,
        Huddle_Source_Strategy_Log__c,
        Description
      FROM Task
      WHERE Huddle_Generated__c = TRUE
    ];
    Assert.areEqual(3, tasks.size());
    for (Task t : tasks) {
      Assert.areEqual(opp.Id, t.WhatId, 'Action items hang off the deal');
      Assert.areEqual(
        log.Id,
        t.Huddle_Source_Strategy_Log__c,
        'Every task traces back to the meeting'
      );
      Assert.isTrue(
        t.Description.contains('From the recap:'),
        'The source sentence travels with the task'
      );
    }

    List<Huddle_Change_Log__c> audit = [
      SELECT Assigned_To__c, Rep_Confirmed__c, Detail__c
      FROM Huddle_Change_Log__c
      WHERE Change_Type__c = :Huddle_Constants.CHANGE_TASK_CREATED
    ];
    Assert.areEqual(3, audit.size(), 'One audit row per task, no exceptions');
    for (Huddle_Change_Log__c c : audit) {
      Assert.isTrue(
        c.Rep_Confirmed__c,
        'Reaching apply=true means the attendee confirmed'
      );
      Assert.isNotNull(
        c.Assigned_To__c,
        'Who the work landed on is a first-class audit column'
      );
    }
  }

  @IsTest
  static void unresolvableOwnerIsFlaggedNotGuessed() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.UNRESOLVABLE_OWNER_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.apply = true;

    Test.startTest();
    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.areEqual(1, res[0].taskCount);
    Assert.areEqual(
      1,
      res[0].unresolvedOwnerCount,
      'A name matching no user must not be silently resolved'
    );

    Task t = [
      SELECT OwnerId, Huddle_Owner_Unclear__c, Description
      FROM Task
      WHERE Huddle_Generated__c = TRUE
      LIMIT 1
    ];
    Assert.isTrue(
      t.Huddle_Owner_Unclear__c,
      'The ambiguity is flagged on the record'
    );
    Assert.areEqual(
      UserInfo.getUserId(),
      t.OwnerId,
      'It is parked with the note-taker, not a plausible stranger'
    );
    Assert.isTrue(
      t.Description.contains('OWNER UNCLEAR'),
      'And the reason travels with the task'
    );
  }

  @IsTest
  static void roleOnlyOwnerIsAlsoFlagged() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.ROLE_ONLY_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.apply = false;

    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );

    Assert.areEqual(
      1,
      res[0].unresolvedOwnerCount,
      '"the sales engineer" is a role, not a resolvable person'
    );
    Assert.isTrue(
      res[0].assignments.contains('OWNER UNCLEAR'),
      'The preview says so plainly before anything is written'
    );
  }

  @IsTest
  static void ownerOverrideRedirectsAMisattributedItem() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    User teammate = Huddle_TestUtil.createTeammate('Zeta', 'Quillfeather');
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.UNRESOLVABLE_OWNER_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.apply = true;
    req.ownerOverrides = '1=' + teammate.Id;

    Test.startTest();
    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.areEqual(
      0,
      res[0].unresolvedOwnerCount,
      'An explicit correction settles the ambiguity'
    );
    Task t = [
      SELECT OwnerId, Huddle_Owner_Unclear__c
      FROM Task
      WHERE Huddle_Generated__c = TRUE
      LIMIT 1
    ];
    Assert.areEqual(
      teammate.Id,
      t.OwnerId,
      'The task goes where the attendee said it should'
    );
    Assert.isFalse(t.Huddle_Owner_Unclear__c);
  }

  @IsTest
  static void skippedItemIsNeverCreated() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.apply = true;
    req.skipItems = '1, 2';

    Test.startTest();
    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.areEqual(
      1,
      res[0].taskCount,
      'Two items the attendee rejected must not be created'
    );
    Assert.areEqual(
      1,
      [SELECT COUNT() FROM Task WHERE Huddle_Generated__c = TRUE]
    );
  }

  @IsTest
  static void noActionItemsMeansNoInventedTasks() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.NO_OWNER_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.apply = true;

    List<Huddle_CreateActionItemsInvocable.Response> res = Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );

    Assert.areEqual(0, res[0].taskCount);
    Assert.isTrue(
      res[0]
        .summary.contains(
          'only creates tasks for work someone actually committed to'
        )
    );
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Task WHERE Huddle_Generated__c = TRUE]
    );
  }

  @IsTest
  static void openDecisionsAreRaisedAndDeduplicated() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP
    );

    Huddle_IdentifyOpenDecisionsInvocable.Request req = new Huddle_IdentifyOpenDecisionsInvocable.Request();
    req.strategyLogId = log.Id;
    req.opportunityId = opp.Id;

    Test.startTest();
    List<Huddle_IdentifyOpenDecisionsInvocable.Response> first = Huddle_IdentifyOpenDecisionsInvocable.run(
      new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{ req }
    );
    List<Huddle_IdentifyOpenDecisionsInvocable.Response> second = Huddle_IdentifyOpenDecisionsInvocable.run(
      new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.areEqual(1, first[0].decisionCount);
    Assert.areEqual(
      0,
      second[0].decisionCount,
      'Re-running on the same recap must not pile up duplicates'
    );
    Assert.areEqual(1, second[0].skippedDuplicateCount);

    Huddle_Open_Decision__c d = [
      SELECT
        Question__c,
        Status__c,
        Needed_By__c,
        Raised_On__c,
        Strategy_Log__c,
        Opportunity__c
      FROM Huddle_Open_Decision__c
    ];
    Assert.areEqual(
      Date.today(),
      d.Raised_On__c,
      'A meeting held today raises its questions today'
    );
    Assert.areEqual(Huddle_Constants.DECISION_OPEN, d.Status__c);
    Assert.areEqual(
      log.Id,
      d.Strategy_Log__c,
      'The question links back to the meeting that raised it'
    );
    Assert.areEqual(
      Date.today().addDays(4),
      d.Needed_By__c,
      '"before the next call" is a real deadline cue'
    );
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM Huddle_Change_Log__c
        WHERE Change_Type__c = :Huddle_Constants.CHANGE_DECISION_RAISED
      ]
    );
  }

  @IsTest
  static void taskDueDatesAreRelativeToTheMeeting() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP,
      Date.today().addDays(-21)
    );

    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.opportunityId = opp.Id;
    req.apply = true;

    Test.startTest();
    Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );
    Test.stopTest();

    // "by Friday" on a meeting three weeks ago is three weeks ago plus three days.
    List<Task> tasks = [
      SELECT ActivityDate
      FROM Task
      WHERE Huddle_Generated__c = TRUE
      ORDER BY ActivityDate ASC
    ];
    Assert.areEqual(3, tasks.size());
    for (Task t : tasks) {
      Assert.isTrue(
        t.ActivityDate < Date.today(),
        'A task from a three-week-old huddle is already overdue, not due next week'
      );
    }
    Assert.areEqual(
      Date.today().addDays(-20),
      tasks[0].ActivityDate,
      '"tomorrow" means the day after the meeting'
    );
  }

  @IsTest
  static void decisionsAgeFromTheMeetingNotFromWhenItWasLogged() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    // A huddle held three weeks ago, only written up now.
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP,
      Date.today().addDays(-21)
    );

    Huddle_IdentifyOpenDecisionsInvocable.Request req = new Huddle_IdentifyOpenDecisionsInvocable.Request();
    req.strategyLogId = log.Id;
    req.opportunityId = opp.Id;

    Test.startTest();
    Huddle_IdentifyOpenDecisionsInvocable.run(
      new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{ req }
    );
    Test.stopTest();

    Huddle_Open_Decision__c d = [
      SELECT Raised_On__c, Needed_By__c, Days_Open__c
      FROM Huddle_Open_Decision__c
      LIMIT 1
    ];
    Assert.areEqual(
      Date.today().addDays(-21),
      d.Raised_On__c,
      'The question has been open since the meeting, not since the write-up'
    );
    Assert.areEqual(
      21,
      d.Days_Open__c,
      'Aging counts from the meeting, so a late write-up does not reset the clock'
    );
    Assert.areEqual(
      Date.today().addDays(-17),
      d.Needed_By__c,
      '"before the next call" was a deadline set in the room, and it has passed'
    );
  }

  @IsTest
  static void nothingUnresolvedMeansNoDecisionsRaised() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.NO_OWNER_RECAP
    );

    Huddle_IdentifyOpenDecisionsInvocable.Request req = new Huddle_IdentifyOpenDecisionsInvocable.Request();
    req.strategyLogId = log.Id;

    List<Huddle_IdentifyOpenDecisionsInvocable.Response> res = Huddle_IdentifyOpenDecisionsInvocable.run(
      new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{ req }
    );

    Assert.areEqual(0, res[0].decisionCount);
    Assert.isTrue(
      res[0].summary.contains('did not flag anything as unresolved')
    );
  }

  @IsTest
  static void digestGivesReasoningActionItemsAndOpenQuestions() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP
    );

    Huddle_CreateActionItemsInvocable.Request taskReq = new Huddle_CreateActionItemsInvocable.Request();
    taskReq.strategyLogId = log.Id;
    taskReq.opportunityId = opp.Id;
    taskReq.apply = true;
    Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ taskReq }
    );

    Huddle_IdentifyOpenDecisionsInvocable.Request decReq = new Huddle_IdentifyOpenDecisionsInvocable.Request();
    decReq.strategyLogId = log.Id;
    decReq.opportunityId = opp.Id;
    Huddle_IdentifyOpenDecisionsInvocable.run(
      new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{ decReq }
    );

    Huddle_DealTeamDigestInvocable.Request req = new Huddle_DealTeamDigestInvocable.Request();
    req.opportunityId = opp.Id;

    Test.startTest();
    List<Huddle_DealTeamDigestInvocable.Response> res = Huddle_DealTeamDigestInvocable.run(
      new List<Huddle_DealTeamDigestInvocable.Request>{ req }
    );
    Test.stopTest();

    Assert.isTrue(res[0].success);
    Assert.areEqual(1, res[0].strategySessionCount);
    Assert.areEqual(3, res[0].openActionItemCount);
    Assert.areEqual(1, res[0].openDecisionCount);
    Assert.isTrue(
      res[0].digest.contains('WHY'),
      'The reasoning section is the point of the digest'
    );
    Assert.isTrue(res[0].digest.contains('margin risk'));
    Assert.isTrue(
      res[0].digest.contains('Internal strategy only'),
      'The digest states its own internal-only status'
    );
    Assert.areEqual(
      1,
      [
        SELECT COUNT()
        FROM Huddle_Change_Log__c
        WHERE Change_Type__c = :Huddle_Constants.CHANGE_DIGEST_GENERATED
      ],
      'Even a read-only digest is audited'
    );
  }

  @IsTest
  static void digestOnAnUntouchedDealSaysSoPlainly() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_DealTeamDigestInvocable.Request req = new Huddle_DealTeamDigestInvocable.Request();
    req.opportunityId = opp.Id;

    List<Huddle_DealTeamDigestInvocable.Response> res = Huddle_DealTeamDigestInvocable.run(
      new List<Huddle_DealTeamDigestInvocable.Request>{ req }
    );

    Assert.isTrue(res[0].success);
    Assert.isTrue(res[0].summary.contains('nothing logged'));
    Assert.areEqual(
      0,
      [SELECT COUNT() FROM Huddle_Change_Log__c],
      'Nothing happened, so nothing is audited'
    );
  }

  @IsTest
  static void digestWithoutAnOpportunityAsksForOne() {
    Huddle_DealTeamDigestInvocable.Request req = new Huddle_DealTeamDigestInvocable.Request();
    req.opportunityId = null;

    List<Huddle_DealTeamDigestInvocable.Response> res = Huddle_DealTeamDigestInvocable.run(
      new List<Huddle_DealTeamDigestInvocable.Request>{ req }
    );

    Assert.isFalse(res[0].success);
    Assert.isTrue(res[0].summary.contains('Which deal'));
  }

  @IsTest
  static void ownerResolverResolvesMeRolesAndMisses() {
    Id runningUser = UserInfo.getUserId();

    Test.startTest();
    Map<String, Huddle_OwnerResolver.Resolution> res = Huddle_OwnerResolver.resolveAll(
      new List<String>{ 'me', 'Legal', '', 'Zzyzxqvist' },
      runningUser
    );
    Test.stopTest();

    Assert.isTrue(res.get('me').resolved);
    Assert.areEqual(runningUser, res.get('me').userId);

    Assert.isFalse(res.get('legal').resolved, 'A role is not a person');
    Assert.isTrue(res.get('legal').reason.contains('role'));

    Assert.isFalse(res.get('').resolved, 'No hint at all cannot resolve');
    Assert.isTrue(res.get('').reason.contains('not who owns it'));

    Assert.isFalse(res.get('zzyzxqvist').resolved);
    Assert.isTrue(res.get('zzyzxqvist').reason.contains('No active user'));
  }

  @IsTest
  static void ownerResolverMatchesARealUserByName() {
    User teammate = Huddle_TestUtil.createTeammate('Zeta', 'Quillfeather');

    Test.startTest();
    Huddle_OwnerResolver.Resolution byFull = Huddle_OwnerResolver.resolve(
      'Zeta Quillfeather',
      UserInfo.getUserId()
    );
    Test.stopTest();

    Assert.isTrue(byFull.resolved, 'A full-name match is unambiguous');
    Assert.areEqual(teammate.Id, byFull.userId);
  }
}
