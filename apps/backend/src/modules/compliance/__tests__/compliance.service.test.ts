import { complianceService } from '../compliance.service';

describe('ComplianceService.evaluate', () => {
  const base = {
    connectorId: 'test-id',
    termsChecked: true,
    robotsTxtChecked: true,
    apiDocsChecked: true,
    hasOfficialApi: false,
    hasAuthorizedIntegration: false,
    requiresCaptchaBypass: false,
    requiresAntiBotEvasion: false,
    requiresRateLimitEvasion: false,
    requiresAuthBypass: false,
  };

  it('returns OFFICIAL_API when official API is verified', () => {
    const result = complianceService.evaluate({ ...base, hasOfficialApi: true });
    expect(result.decision).toBe('OFFICIAL_API');
    expect(result.canActivate).toBe(true);
    expect(result.riskLevel).toBe('LOW');
  });

  it('returns AUTHORIZED_INTEGRATION when authorized', () => {
    const result = complianceService.evaluate({ ...base, hasAuthorizedIntegration: true });
    expect(result.decision).toBe('AUTHORIZED_INTEGRATION');
    expect(result.canActivate).toBe(true);
  });

  it('returns MANUAL_ASSISTED when no API or authorization', () => {
    const result = complianceService.evaluate(base);
    expect(result.decision).toBe('MANUAL_ASSISTED');
    expect(result.canActivate).toBe(false);
  });

  it('ALWAYS returns MANUAL_ASSISTED and blocks activation when captcha bypass required', () => {
    const result = complianceService.evaluate({ ...base, hasOfficialApi: true, requiresCaptchaBypass: true });
    expect(result.decision).toBe('MANUAL_ASSISTED');
    expect(result.canActivate).toBe(false);
    expect(result.riskLevel).toBe('CRITICAL');
  });

  it('ALWAYS blocks when anti-bot evasion required', () => {
    const result = complianceService.evaluate({ ...base, hasOfficialApi: true, requiresAntiBotEvasion: true });
    expect(result.decision).toBe('MANUAL_ASSISTED');
    expect(result.canActivate).toBe(false);
  });

  it('ALWAYS blocks when rate limit evasion required', () => {
    const result = complianceService.evaluate({ ...base, hasOfficialApi: true, requiresRateLimitEvasion: true });
    expect(result.decision).toBe('MANUAL_ASSISTED');
    expect(result.canActivate).toBe(false);
  });

  it('ALWAYS blocks when auth bypass required', () => {
    const result = complianceService.evaluate({ ...base, hasOfficialApi: true, requiresAuthBypass: true });
    expect(result.decision).toBe('MANUAL_ASSISTED');
    expect(result.canActivate).toBe(false);
  });
});
