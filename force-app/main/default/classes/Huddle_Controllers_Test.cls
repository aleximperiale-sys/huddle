/**
 * Tests for the two LWC controllers behind the Huddle app's review surface.
 */
@IsTest
private class Huddle_Controllers_Test {
  /** Log a meeting, create its action items and raise its open decision. */
  private static Huddle_Strategy_Log__c seedDeal(Opportunity opp) {
    Huddle_LogStrategyInvocable.Request logReq = new Huddle_LogStrategyInvocable.Request();
    logReq.meetingRecap = Huddle_TestUtil.FULL_RECAP;
    logReq.opportunityId = opp.Id;
    String logId = Huddle_LogStrategyInvocable.run(
        new List<Huddle_LogStrategyInvocable.Request>{ logReq }
      )[0]
      .strategyLogId;

    Huddle_CreateActionItemsInvocable.Request taskReq = new Huddle_CreateActionItemsInvocable.Request();
    taskReq.strategyLogId = logId;
    taskReq.opportunityId = opp.Id;
    taskReq.apply = true;
    Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ taskReq }
    );

    Huddle_IdentifyOpenDecisionsInvocable.Request decReq = new Huddle_IdentifyOpenDecisionsInvocable.Request();
    decReq.strategyLogId = logId;
    decReq.opportunityId = opp.Id;
    Huddle_IdentifyOpenDecisionsInvocable.run(
      new List<Huddle_IdentifyOpenDecisionsInvocable.Request>{ decReq }
    );

    return [SELECT Id, Name FROM Huddle_Strategy_Log__c WHERE Id = :logId];
  }

  @IsTest
  static void consoleReturnsEveryChangeWithAssignmentDetail() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    seedDeal(opp);

    Test.startTest();
    List<Huddle_ChangeLogConsoleController.ChangeRow> rows = Huddle_ChangeLogConsoleController.getChanges(
      null,
      null,
      null,
      null,
      null,
      null
    );
    Test.stopTest();

    // 1 strategy logged + 3 tasks created + 1 decision raised.
    Assert.areEqual(5, rows.size());
    Boolean sawAssignment = false;
    for (Huddle_ChangeLogConsoleController.ChangeRow r : rows) {
      Assert.isNotNull(r.changeType);
      if (r.changeType == Huddle_Constants.CHANGE_TASK_CREATED) {
        Assert.isNotNull(
          r.assignedToName,
          'The console must show who each task landed on'
        );
        Assert.isNotNull(
          r.sourceStrategyLogId,
          'Each row links back to the source meeting recap'
        );
        sawAssignment = true;
      }
    }
    Assert.isTrue(sawAssignment);
  }

  @IsTest
  static void consoleFiltersNarrowTheAuditTrail() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    seedDeal(opp);

    Test.startTest();
    List<Huddle_ChangeLogConsoleController.ChangeRow> byType = Huddle_ChangeLogConsoleController.getChanges(
      UserInfo.getUserId(),
      opp.Id,
      Huddle_Constants.CHANGE_TASK_CREATED,
      Date.today().addDays(-1),
      Date.today(),
      50
    );
    List<Huddle_ChangeLogConsoleController.ChangeRow> byOpp = Huddle_ChangeLogConsoleController.getChangesForOpportunity(
      opp.Id
    );
    Test.stopTest();

    Assert.areEqual(
      3,
      byType.size(),
      'Filtering by rep, deal, type and date should isolate the three tasks'
    );
    Assert.areEqual(5, byOpp.size());
    Assert.areEqual(
      0,
      Huddle_ChangeLogConsoleController.getChangesForOpportunity(null).size()
    );
  }

  @IsTest
  static void badgeSummaryCountsSessionsItemsAndDecisions() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    seedDeal(opp);

    Test.startTest();
    Huddle_ChangeLogConsoleController.OpportunitySummary s = Huddle_ChangeLogConsoleController.getOpportunitySummary(
      opp.Id
    );
    Test.stopTest();

    Assert.areEqual(1, s.strategySessions);
    Assert.areEqual(3, s.actionItems);
    Assert.areEqual(1, s.openDecisions);
    Assert.isNotNull(s.lastSessionDate);
    Assert.isNotNull(s.lastStrategyLogId);

    Huddle_ChangeLogConsoleController.OpportunitySummary empty = Huddle_ChangeLogConsoleController.getOpportunitySummary(
      null
    );
    Assert.areEqual(
      0,
      empty.strategySessions,
      'No record id yields an empty summary rather than an error'
    );
  }

  @IsTest
  static void filterOptionsCoverRepsOpportunitiesAndTypes() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    seedDeal(opp);

    Test.startTest();
    Huddle_ChangeLogConsoleController.FilterOptions opts = Huddle_ChangeLogConsoleController.getFilterOptions();
    Test.stopTest();

    Assert.areEqual(1, opts.reps.size());
    Assert.areEqual(1, opts.opportunities.size());
    Assert.areEqual(
      5,
      opts.changeTypes.size(),
      'All five change types should be selectable'
    );
  }

  @IsTest
  static void dashboardRollsUpSessionsItemsAndAgingDecisions() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    seedDeal(opp);

    // One task completed, so created-vs-completed is not trivially equal.
    Task t = [
      SELECT Id, Status
      FROM Task
      WHERE Huddle_Generated__c = TRUE
      LIMIT 1
    ];
    t.Status = 'Completed';
    update t;

    Test.startTest();
    Huddle_HomeDashboardController.Summary s = Huddle_HomeDashboardController.getSummary();
    Test.stopTest();

    Assert.areEqual(1, s.sessionsThisWeek);
    Assert.areEqual(1, s.sessionsAllTime);
    Assert.areEqual(3, s.actionItemsCreated);
    Assert.areEqual(1, s.actionItemsCompleted);
    Assert.areEqual(1, s.openDecisions);
    Assert.areEqual(
      7,
      s.trend.size(),
      'The trend is zero-filled across seven days'
    );
    Assert.isFalse(s.byType.isEmpty());
    Assert.isFalse(s.topContributors.isEmpty());
    Assert.areEqual(
      0,
      s.agingDecisionCount,
      'A decision raised today is not yet aging; the rollup only surfaces genuinely stale ones'
    );
  }

  @IsTest
  static void dashboardCountsUnclearOwnersSeparately() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.UNRESOLVABLE_OWNER_RECAP
    );
    Huddle_CreateActionItemsInvocable.Request req = new Huddle_CreateActionItemsInvocable.Request();
    req.strategyLogId = log.Id;
    req.apply = true;
    Huddle_CreateActionItemsInvocable.run(
      new List<Huddle_CreateActionItemsInvocable.Request>{ req }
    );

    Test.startTest();
    Huddle_HomeDashboardController.Summary s = Huddle_HomeDashboardController.getSummary();
    Test.stopTest();

    Assert.areEqual(
      1,
      s.actionItemsOwnerUnclear,
      'Tasks Huddle could not confidently assign need their own count'
    );
  }

  @IsTest
  static void dashboardHandlesAnEmptyOrg() {
    Test.startTest();
    Huddle_HomeDashboardController.Summary s = Huddle_HomeDashboardController.getSummary();
    Test.stopTest();

    Assert.areEqual(0, s.sessionsAllTime);
    Assert.areEqual(0, s.openDecisions);
    Assert.areEqual(7, s.trend.size());
    Assert.isTrue(s.agingDecisions.isEmpty());
  }
}
