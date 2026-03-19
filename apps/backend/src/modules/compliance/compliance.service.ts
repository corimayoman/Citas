import { IntegrationType, ComplianceLevel } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';
import { auditService } from '../audit/audit.service';

export interface ComplianceCheckInput {
  connectorId: string;
  termsChecked: boolean;
  robotsTxtChecked: boolean;
  apiDocsChecked: boolean;
  hasOfficialApi: boolean;
  hasAuthorizedIntegration: boolean;
  requiresCaptchaBypass: boolean;
  requiresAntiBotEvasion: boolean;
  requiresRateLimitEvasion: boolean;
  requiresAuthBypass: boolean;
  legalBasis?: string;
  notes?: string;
  reviewedBy?: string;
}

export interface ComplianceDecision {
  decision: IntegrationType;
  riskLevel: ComplianceLevel;
  canActivate: boolean;
  reasons: string[];
  warnings: string[];
}

/**
 * Core compliance engine.
 * Determines the allowed integration mode for a connector.
 * 
 * RULES (non-negotiable):
 * - Any connector requiring captcha bypass, anti-bot evasion, rate limit evasion
 *   or auth bypass is ALWAYS set to MANUAL_ASSISTED and cannot be activated automatically.
 * - Only connectors with official API or explicit authorization can operate in automated mode.
 */
export const complianceService = {
  evaluate(input: ComplianceCheckInput): ComplianceDecision {
    const reasons: string[] = [];
    const warnings: string[] = [];

    // Hard blockers — these always result in manual-only mode
    const hardBlockers: string[] = [];

    if (input.requiresCaptchaBypass) {
      hardBlockers.push('Requiere evasión de CAPTCHA — no permitido');
    }
    if (input.requiresAntiBotEvasion) {
      hardBlockers.push('Requiere evasión de sistemas anti-bot — no permitido');
    }
    if (input.requiresRateLimitEvasion) {
      hardBlockers.push('Requiere evasión de rate limiting — no permitido');
    }
    if (input.requiresAuthBypass) {
      hardBlockers.push('Requiere bypass de autenticación — no permitido');
    }
    if (!input.termsChecked) {
      warnings.push('Términos de uso no verificados — se requiere revisión manual');
    }
    if (!input.robotsTxtChecked) {
      warnings.push('robots.txt no verificado');
    }

    if (hardBlockers.length > 0) {
      return {
        decision: IntegrationType.MANUAL_ASSISTED,
        riskLevel: ComplianceLevel.CRITICAL,
        canActivate: false,
        reasons: hardBlockers,
        warnings,
      };
    }

    // Determine integration type
    if (input.hasOfficialApi && input.apiDocsChecked && input.termsChecked) {
      return {
        decision: IntegrationType.OFFICIAL_API,
        riskLevel: ComplianceLevel.LOW,
        canActivate: true,
        reasons: ['API oficial documentada y términos verificados'],
        warnings,
      };
    }

    if (input.hasAuthorizedIntegration && input.termsChecked) {
      return {
        decision: IntegrationType.AUTHORIZED_INTEGRATION,
        riskLevel: ComplianceLevel.MEDIUM,
        canActivate: true,
        reasons: ['Integración autorizada con términos verificados'],
        warnings,
      };
    }

    // Default: manual assisted
    reasons.push('No se ha verificado API oficial ni autorización explícita');
    return {
      decision: IntegrationType.MANUAL_ASSISTED,
      riskLevel: ComplianceLevel.HIGH,
      canActivate: false,
      reasons,
      warnings,
    };
  },

  async reviewConnector(input: ComplianceCheckInput, reviewedBy?: string) {
    const connector = await prisma.connector.findUnique({ where: { id: input.connectorId } });
    if (!connector) throw new AppError(404, 'Conector no encontrado', 'CONNECTOR_NOT_FOUND');

    const decision = this.evaluate(input);

    const review = await prisma.complianceReview.create({
      data: {
        connectorId: input.connectorId,
        reviewedBy,
        decision: decision.decision,
        riskLevel: decision.riskLevel,
        notes: [input.notes, ...decision.reasons, ...decision.warnings].filter(Boolean).join('\n'),
        termsChecked: input.termsChecked,
        robotsTxtChecked: input.robotsTxtChecked,
        apiDocsChecked: input.apiDocsChecked,
        legalBasis: input.legalBasis,
        approvedAt: decision.canActivate ? new Date() : null,
        expiresAt: decision.canActivate
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
          : null,
      },
    });

    // Update connector based on decision
    await prisma.connector.update({
      where: { id: input.connectorId },
      data: {
        integrationType: decision.decision,
        complianceLevel: decision.riskLevel,
        status: decision.canActivate ? 'ACTIVE' : 'PENDING_REVIEW',
        lastComplianceCheck: new Date(),
        canBook: decision.canActivate && connector.canBook,
        canCheckAvailability: decision.canActivate && connector.canCheckAvailability,
      },
    });

    await auditService.log({
      userId: reviewedBy,
      action: 'COMPLIANCE_CHECK',
      entityType: 'Connector',
      entityId: input.connectorId,
      after: { decision: decision.decision, riskLevel: decision.riskLevel },
    });

    return { review, decision };
  },

  async getConnectorCompliance(connectorId: string) {
    return prisma.complianceReview.findMany({
      where: { connectorId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
