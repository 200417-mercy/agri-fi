/**
 * FraudDetectionService (#1157)
 *
 * Rule-based fraud scoring for transactions and KYC anomalies.
 * Produces a FraudScore (low / medium / high) with explainable signals
 * to feed the manual review queue and compliance alerts.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { PinoLogger } from 'nestjs-pino';
import { Investment } from '../investments/entities/investment.entity';
import { User } from '../auth/entities/user.entity';
import { SystemAuditLog } from '../audit/entities/system-audit-log.entity';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface FraudSignal {
  rule: string;
  weight: number;
  detail: string;
}

export interface FraudScore {
  entityId: string;
  entityType: 'investment' | 'user';
  score: number;
  riskLevel: RiskLevel;
  signals: FraudSignal[];
  evaluatedAt: Date;
}

export interface FraudReviewItem {
  fraudScore: FraudScore;
  requiresManualReview: boolean;
  assignedTo?: string;
}

// Score thresholds
const MEDIUM_THRESHOLD = 40;
const HIGH_THRESHOLD = 70;

@Injectable()
export class FraudDetectionService {
  constructor(
    @InjectRepository(Investment)
    private readonly investmentRepo: Repository<Investment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SystemAuditLog)
    private readonly auditRepo: Repository<SystemAuditLog>,
    private readonly logger: PinoLogger,
  ) {
    (this.logger as any).setContext(FraudDetectionService.name);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async scoreInvestment(investmentId: string): Promise<FraudScore> {
    const investment = await this.investmentRepo.findOne({
      where: { id: investmentId } as any,
      relations: ['investor'],
    });

    if (!investment) {
      throw new Error(`Investment ${investmentId} not found`);
    }

    const signals: FraudSignal[] = [];

    // Rule 1: Unusually large single investment
    const amount = Number(investment.amount_usd ?? 0);
    if (amount > 500_000) {
      signals.push({
        rule: 'LARGE_SINGLE_INVESTMENT',
        weight: 30,
        detail: `Investment amount $${amount.toLocaleString()} exceeds $500,000 threshold`,
      });
    } else if (amount > 100_000) {
      signals.push({
        rule: 'ELEVATED_INVESTMENT_AMOUNT',
        weight: 15,
        detail: `Investment amount $${amount.toLocaleString()} exceeds $100,000 threshold`,
      });
    }

    // Rule 2: Rapid successive investments from same investor
    const investorId = (investment as any).investorId ?? (investment as any).investor?.id;
    if (investorId) {
      const window = new Date(Date.now() - 60 * 60 * 1000); // last hour
      const recentCount = await this.investmentRepo.count({
        where: {
          ...(({ investorId }) => ({ investorId }))(investment as any),
          createdAt: Between(window, new Date()) as any,
        },
      });
      if (recentCount >= 5) {
        signals.push({
          rule: 'RAPID_SUCCESSIVE_INVESTMENTS',
          weight: 25,
          detail: `${recentCount} investments from same investor within 1 hour`,
        });
      }
    }

    // Rule 3: Investment immediately after account creation
    const user = investorId
      ? await this.userRepo.findOne({ where: { id: investorId } as any })
      : null;
    if (user && (investment as any).createdAt && (user as any).createdAt) {
      const accountAgeMs =
        new Date((investment as any).createdAt).getTime() -
        new Date((user as any).createdAt).getTime();
      const oneDay = 24 * 60 * 60 * 1000;
      if (accountAgeMs < oneDay) {
        signals.push({
          rule: 'NEW_ACCOUNT_HIGH_VALUE',
          weight: 35,
          detail: `Account created ${Math.round(accountAgeMs / 3_600_000)}h before investment`,
        });
      }
    }

    return this.buildScore(investmentId, 'investment', signals);
  }

  async scoreUser(userId: string): Promise<FraudScore> {
    const user = await this.userRepo.findOne({ where: { id: userId } as any });
    if (!user) throw new Error(`User ${userId} not found`);

    const signals: FraudSignal[] = [];

    // Rule 1: KYC document anomaly — rejected then re-submitted multiple times
    const kycAttempts = await this.auditRepo.count({
      where: { actorId: userId, route: 'kyc' as any } as any,
    });
    if (kycAttempts > 5) {
      signals.push({
        rule: 'REPEATED_KYC_SUBMISSIONS',
        weight: 40,
        detail: `${kycAttempts} KYC submission attempts detected`,
      });
    }

    // Rule 2: Unverified KYC with active investments
    if ((user as any).kycStatus !== 'verified') {
      const activeInvestments = await this.investmentRepo.count({
        where: { status: 'confirmed' } as any,
      });
      if (activeInvestments > 0) {
        signals.push({
          rule: 'UNVERIFIED_KYC_WITH_INVESTMENTS',
          weight: 50,
          detail: `User has ${activeInvestments} active investment(s) without verified KYC`,
        });
      }
    }

    // Rule 3: Unusual authentication patterns (many failed logins)
    const failedAuths = await this.auditRepo.count({
      where: {
        actorId: userId,
        statusCode: 401,
        timestamp: Between(
          new Date(Date.now() - 24 * 60 * 60 * 1000),
          new Date(),
        ) as any,
      } as any,
    });
    if (failedAuths >= 10) {
      signals.push({
        rule: 'EXCESSIVE_FAILED_AUTH',
        weight: 30,
        detail: `${failedAuths} failed authentication attempts in last 24h`,
      });
    }

    return this.buildScore(userId, 'user', signals);
  }

  /** Batch-score all investments created in the last 24 hours. */
  async runDailyInvestmentScan(): Promise<FraudReviewItem[]> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const investments = await this.investmentRepo.find({
      where: { createdAt: Between(since, new Date()) as any },
      take: 500,
    });

    const results: FraudReviewItem[] = [];
    for (const inv of investments) {
      const score = await this.scoreInvestment((inv as any).id);
      const requiresManualReview = score.riskLevel !== 'low';
      results.push({ fraudScore: score, requiresManualReview });
      if (requiresManualReview) {
        this.logger.warn(
          { investmentId: (inv as any).id, riskLevel: score.riskLevel, score: score.score },
          'Investment flagged for manual fraud review',
        );
      }
    }

    return results;
  }

  /** Return all high-risk items requiring manual review. */
  async getManualReviewQueue(): Promise<FraudReviewItem[]> {
    const items = await this.runDailyInvestmentScan();
    return items.filter((i) => i.requiresManualReview);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private buildScore(
    entityId: string,
    entityType: 'investment' | 'user',
    signals: FraudSignal[],
  ): FraudScore {
    const score = Math.min(100, signals.reduce((s, sig) => s + sig.weight, 0));
    const riskLevel: RiskLevel =
      score >= HIGH_THRESHOLD ? 'high' : score >= MEDIUM_THRESHOLD ? 'medium' : 'low';

    return {
      entityId,
      entityType,
      score,
      riskLevel,
      signals,
      evaluatedAt: new Date(),
    };
  }
}
