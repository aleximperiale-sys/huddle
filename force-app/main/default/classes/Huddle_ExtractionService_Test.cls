/**
 * Tests for the extraction engine. The assertions worth caring about are the
 * negative ones: that a decision with no named owner does NOT become somebody's
 * task, that an unresolved question does NOT get filed as an action item, and that
 * a thin recap admits it is thin instead of producing confident nonsense.
 */
@IsTest
private class Huddle_ExtractionService_Test {
  @IsTest
  static void fullRecapSeparatesStrategyActionsAndQuestions() {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      Huddle_TestUtil.FULL_RECAP
    );

    Assert.isFalse(
      parse.lowConfidence,
      'A detailed recap should not be flagged low confidence'
    );
    Assert.areEqual(
      3,
      parse.actionItems.size(),
      'Three people committed to something in this recap'
    );
    Assert.areEqual(
      1,
      parse.openQuestions.size(),
      'One question was explicitly left unresolved'
    );
    Assert.isTrue(
      parse.strategySummary.contains('hold the discount'),
      'The decision belongs in the strategy summary'
    );
    Assert.isTrue(
      parse.reasoning.contains('margin risk'),
      'The reasoning behind the decision must be preserved separately from the outcome'
    );
    Assert.areEqual(
      2,
      parse.attendees.size(),
      'The explicit attendee line should be used'
    );
  }

  @IsTest
  static void ownersComeFromTheTextNotFromInference() {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      Huddle_TestUtil.FULL_RECAP
    );

    Map<String, String> ownerByAction = new Map<String, String>();
    for (Huddle_MeetingParse.ActionItem a : parse.actionItems) {
      ownerByAction.put(a.text, a.ownerHint);
    }
    Boolean sawPriya = false;
    Boolean sawDan = false;
    Boolean sawSelf = false;
    for (Huddle_MeetingParse.ActionItem a : parse.actionItems) {
      if (a.ownerHint == 'Priya') {
        sawPriya = true;
        Assert.areEqual(
          3,
          a.dueInDays,
          '"by Friday" should map to a three-day window'
        );
      }
      if (a.ownerHint == 'Dan Ortiz') {
        sawDan = true;
        Assert.areEqual(7, a.dueInDays, '"next week" should map to seven days');
      }
      if (a.ownerHint == 'me') {
        sawSelf = true;
        Assert.areEqual(1, a.dueInDays, '"tomorrow" should map to one day');
      }
    }
    Assert.isTrue(sawPriya, 'A first-name owner should be picked up');
    Assert.isTrue(sawDan, 'A full-name owner should be picked up');
    Assert.isTrue(
      sawSelf,
      'First person singular means the note-taker owns it'
    );
  }

  @IsTest
  static void decisionWithNoNamedOwnerNeverBecomesATask() {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      Huddle_TestUtil.NO_OWNER_RECAP
    );

    Assert.areEqual(
      0,
      parse.actionItems.size(),
      '"We decided to push the close date" is a team decision, not an assignable action item'
    );
    Assert.isTrue(
      parse.strategySummary.contains('push the close date'),
      'It still belongs in the strategy'
    );
    Assert.isTrue(
      parse.reasoning.contains('budget cycle'),
      'And its reasoning is still captured'
    );
  }

  @IsTest
  static void roleOnlyOwnerIsKeptAsAHintNotResolved() {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      Huddle_TestUtil.ROLE_ONLY_RECAP
    );

    Assert.areEqual(1, parse.actionItems.size());
    Assert.areEqual(
      'Sales Engineer',
      parse.actionItems[0].ownerHint,
      'A named role is a legitimate hint even though it is not a person'
    );
  }

  @IsTest
  static void openQuestionIsNotAlsoAnActionItem() {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      'We still need to decide whether to send the revised quote before the next call.'
    );

    Assert.areEqual(
      1,
      parse.openQuestions.size(),
      'The sentence is an unresolved question'
    );
    Assert.areEqual(
      0,
      parse.actionItems.size(),
      'It contains "send" but nobody committed to it, so it must not become a task'
    );
    Assert.isTrue(
      parse.openQuestions[0].question.toLowerCase().startsWith('whether'),
      'The lead-in should be stripped so the record reads as the question'
    );
  }

  @IsTest
  static void thinRecapDegradesInsteadOfGuessing() {
    Huddle_MeetingParse parse = Huddle_ExtractionService.parse(
      Huddle_TestUtil.THIN_RECAP
    );

    Assert.isTrue(
      parse.lowConfidence,
      'A two-word recap cannot support confident extraction'
    );
    Assert.areEqual(0, parse.actionItems.size());
    Assert.areEqual(0, parse.openQuestions.size());
    Assert.isTrue(
      String.isNotBlank(parse.notes),
      'It should say why it is unsure'
    );
  }

  @IsTest
  static void emptyRecapIsHandledWithoutThrowing() {
    Assert.isTrue(Huddle_ExtractionService.parse(null).lowConfidence);
    Assert.isTrue(Huddle_ExtractionService.parse('').lowConfidence);
    Assert.isTrue(Huddle_ExtractionService.parse('   ').lowConfidence);
  }

  @IsTest
  static void resolveReusesTheCachedExtraction() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = Huddle_TestUtil.createStrategyLog(
      opp.Id,
      Huddle_TestUtil.FULL_RECAP
    );

    Test.startTest();
    Huddle_MeetingParse parse = Huddle_ExtractionService.resolve(log.Id, null);
    Test.stopTest();

    Assert.areEqual(
      3,
      parse.actionItems.size(),
      'The cached parse should come back intact'
    );
    Assert.areEqual(1, parse.openQuestions.size());
  }

  @IsTest
  static void resolveFallsBackToReparsingWhenNoCacheExists() {
    Opportunity opp = Huddle_TestUtil.createOpportunity();
    Huddle_Strategy_Log__c log = new Huddle_Strategy_Log__c(
      Opportunity__c = opp.Id,
      Meeting_Recap__c = Huddle_TestUtil.FULL_RECAP
    );
    insert log;

    Huddle_MeetingParse parse = Huddle_ExtractionService.resolve(log.Id, null);
    Assert.areEqual(
      3,
      parse.actionItems.size(),
      'A log without cached JSON should be re-parsed from the recap'
    );

    Huddle_MeetingParse direct = Huddle_ExtractionService.resolve(
      null,
      Huddle_TestUtil.NO_OWNER_RECAP
    );
    Assert.areEqual(
      0,
      direct.actionItems.size(),
      'With no log id at all it parses the passed recap'
    );
  }

  @IsTest
  static void timingCuesMapToDayOffsets() {
    Assert.areEqual(0, Huddle_Util.inferDueInDays('get it done today'));
    Assert.areEqual(1, Huddle_Util.inferDueInDays('by tomorrow'));
    Assert.areEqual(3, Huddle_Util.inferDueInDays('by friday'));
    Assert.areEqual(7, Huddle_Util.inferDueInDays('next week'));
    Assert.areEqual(14, Huddle_Util.inferDueInDays('end of month'));
    Assert.areEqual(30, Huddle_Util.inferDueInDays('next month'));
    Assert.areEqual(10, Huddle_Util.inferDueInDays('in 10 days'));
    Assert.areEqual(14, Huddle_Util.inferDueInDays('in 2 weeks'));
    Assert.isNull(
      Huddle_Util.inferDueInDays('sometime'),
      'No cue means no invented deadline'
    );
    Assert.isNull(Huddle_Util.inferDueInDays(null));
  }

  @IsTest
  static void utilCoercionsDegradeGracefully() {
    Assert.isNull(Huddle_Util.toIdOrNull(null));
    Assert.isNull(Huddle_Util.toIdOrNull('not-an-id'));
    Assert.areEqual(
      UserInfo.getUserId(),
      Huddle_Util.toIdOrRunningUser('garbage')
    );
    Assert.areEqual(
      Date.newInstance(2026, 8, 1),
      Huddle_Util.toDateOrNull('2026-08-01')
    );
    Assert.isNull(Huddle_Util.toDateOrNull('whenever'));
    Assert.isNull(Huddle_Util.clip(null, 10));
    Assert.areEqual('abcde', Huddle_Util.clip('abcdefghij', 5));
  }

  @IsTest
  static void meetingParseSurvivesAJsonRoundTrip() {
    Huddle_MeetingParse original = Huddle_ExtractionService.parse(
      Huddle_TestUtil.FULL_RECAP
    );
    Huddle_MeetingParse restored = Huddle_MeetingParse.fromJson(
      original.toJsonString()
    );

    Assert.areEqual(original.actionItems.size(), restored.actionItems.size());
    Assert.areEqual(original.reasoning, restored.reasoning);
    Assert.areEqual(
      0,
      Huddle_MeetingParse.fromJson(null).actionItems.size(),
      'Blank JSON yields an empty parse'
    );
  }
}
