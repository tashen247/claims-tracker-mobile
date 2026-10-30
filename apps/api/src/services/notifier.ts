import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import type { FastifyBaseLogger } from 'fastify';
import { CLAIM_STATUS_LABELS, type ClaimStatus } from '@claims/shared';

export interface ClaimStatusNotification {
  tokens: string[];
  claimId: string;
  reference: string;
  status: ClaimStatus;
}

export interface Notifier {
  claimStatusChanged(notification: ClaimStatusNotification): Promise<{ invalidTokens: string[] }>;
}

export function buildStatusMessage(n: ClaimStatusNotification): Omit<ExpoPushMessage, 'to'> {
  return {
    title: `Claim ${n.reference} updated`,
    body: `Your claim is now ${CLAIM_STATUS_LABELS[n.status]}.`,
    sound: 'default',
    data: { claimId: n.claimId, status: n.status, url: `claimstracker://claims/${n.claimId}` },
  };
}

/** Sends push notifications through Expo's push service. Failures are logged, never thrown. */
export class ExpoNotifier implements Notifier {
  private readonly expo: Expo;

  constructor(
    private readonly log: FastifyBaseLogger,
    accessToken?: string,
  ) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  async claimStatusChanged(n: ClaimStatusNotification): Promise<{ invalidTokens: string[] }> {
    const valid = n.tokens.filter((token) => Expo.isExpoPushToken(token));
    const invalidTokens: string[] = n.tokens.filter((token) => !Expo.isExpoPushToken(token));
    if (valid.length === 0) return { invalidTokens };

    const base = buildStatusMessage(n);
    const messages: ExpoPushMessage[] = valid.map((to) => ({ ...base, to }));
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, index) => {
          if (ticket.status === 'error') {
            const to = chunk[index]?.to;
            this.log.warn(
              { claimId: n.claimId, error: ticket.details?.error },
              'push ticket error',
            );
            if (ticket.details?.error === 'DeviceNotRegistered' && typeof to === 'string') {
              invalidTokens.push(to);
            }
          }
        });
      } catch (error) {
        this.log.error({ err: error, claimId: n.claimId }, 'failed to send push notifications');
      }
    }
    return { invalidTokens };
  }
}

export class NoopNotifier implements Notifier {
  async claimStatusChanged(): Promise<{ invalidTokens: string[] }> {
    return { invalidTokens: [] };
  }
}
