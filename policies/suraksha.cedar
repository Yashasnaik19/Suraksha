// Suraksha Cedar Policy Set (Default-Deny, Forbid-Wins)
// Enforced outside the LLM at AWS Bedrock AgentCore Gateway + Lambda Interceptor

// 1. Hard Tier 3 Prohibitions (Forbid always wins)
forbid (
  principal,
  action in [
    SurakshaAction::"reply_to_scammer",
    SurakshaAction::"converse_with_scammer",
    SurakshaAction::"click_untrusted_url",
    SurakshaAction::"execute_upi_payment",
    SurakshaAction::"open_banking_app",
    SurakshaAction::"disclose_otp_pin",
    SurakshaAction::"install_remote_access_app",
    SurakshaAction::"auto_submit_police_report",
    SurakshaAction::"claim_payment_safe"
  ],
  resource
);

// 2. Forbid Family Tier 2 tools whenever Lambda Interceptor validation fails
forbid (
  principal,
  action in [
    FamilyMCP::Action::"alert_guardians",
    FamilyMCP::Action::"send_family_voice_message"
  ],
  resource
) unless {
  context.cognito_authorized == true &&
  context.interceptor.signature_valid == true &&
  context.interceptor.not_expired == true &&
  context.interceptor.alert_id_match == true &&
  context.interceptor.one_time_unused == true &&
  context.interceptor.scope_authorized == true
};

// 3. Permit Tier 1 Listen & Scam-Intel tools without approval token
permit (
  principal == Orchestrator::"suraksha-lambda",
  action in [
    ListenMCP::Action::"get_transcript_window",
    ScamIntelMCP::Action::"match_scam_playbook",
    ScamIntelMCP::Action::"score_signals",
    ScamIntelMCP::Action::"check_url",
    ScamIntelMCP::Action::"prepare_evidence_pack"
  ],
  resource
) when {
  context.cognito_authorized == true
};

// 4. Permit Family Tier 2 tools ONLY when Interceptor verified bound single-use token
permit (
  principal == Orchestrator::"suraksha-lambda",
  action in [
    FamilyMCP::Action::"alert_guardians",
    FamilyMCP::Action::"send_family_voice_message"
  ],
  resource
) when {
  context.cognito_authorized == true &&
  context.interceptor.signature_valid == true &&
  context.interceptor.not_expired == true &&
  context.interceptor.alert_id_match == true &&
  context.interceptor.one_time_unused == true &&
  context.interceptor.scope_authorized == true
};

// 5. Permit Audit MCP strictly for append-only event logging
permit (
  principal == Orchestrator::"suraksha-lambda",
  action == AuditMCP::Action::"append_event",
  resource
) when {
  context.cognito_authorized == true
};
