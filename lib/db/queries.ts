// lib/db/queries.ts
import { getSession } from "@/lib/auth/session";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "./drizzle";
import { userProfiles, userSubscriptions, users } from "./schema";

async function getUserInternal() {
  // getSession ora gestisce internamente: cookie missing, JWT non valido,
  // sessione revocata/scaduta/idle, utente banned/soft-deleted. Se ritorna
  // un valore, è valido — non serve ricontrollare expires.
  const sessionData = await getSession();
  if (!sessionData) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
      isAdmin: users.isAdmin,
      bannedAt: users.bannedAt,
      bannedReason: users.bannedReason,
      emailVerified: users.emailVerified,
      acceptedTermsAt: users.acceptedTermsAt,
      acceptedTermsVersion: users.acceptedTermsVersion,
      acceptedPrivacyAt: users.acceptedPrivacyAt,
      acceptedPrivacyVersion: users.acceptedPrivacyVersion,
      acceptedMarketingAt: users.acceptedMarketingAt,
      acceptedMarketingVersion: users.acceptedMarketingVersion,
      onboardingCompletedAt: users.onboardingCompletedAt,
      pendingEmail: users.pendingEmail,
      pendingEmailRequestedAt: users.pendingEmailRequestedAt,
      locale: users.locale,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
      // profile
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      username: userProfiles.username,
      avatarUrl: userProfiles.avatarUrl,
      bio: userProfiles.bio,
      // subscription
      stripeCustomerId: userSubscriptions.stripeCustomerId,
      stripeSubscriptionId: userSubscriptions.stripeSubscriptionId,
      stripeProductId: userSubscriptions.stripeProductId,
      planName: userSubscriptions.planName,
      subscriptionStatus: userSubscriptions.subscriptionStatus,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .leftJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .where(
      and(
        eq(users.id, sessionData.user.id),
        isNull(users.deletedAt),
        isNull(users.bannedAt),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return rows[0];
}

export const getUser = cache(getUserInternal);

export async function getUserByStripeCustomerId(customerId: string) {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
      isAdmin: users.isAdmin,
      bannedAt: users.bannedAt,
      bannedReason: users.bannedReason,
      emailVerified: users.emailVerified,
      acceptedTermsAt: users.acceptedTermsAt,
      acceptedTermsVersion: users.acceptedTermsVersion,
      acceptedPrivacyAt: users.acceptedPrivacyAt,
      acceptedPrivacyVersion: users.acceptedPrivacyVersion,
      acceptedMarketingAt: users.acceptedMarketingAt,
      acceptedMarketingVersion: users.acceptedMarketingVersion,
      onboardingCompletedAt: users.onboardingCompletedAt,
      pendingEmail: users.pendingEmail,
      pendingEmailRequestedAt: users.pendingEmailRequestedAt,
      locale: users.locale,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
      // profile
      firstName: userProfiles.firstName,
      lastName: userProfiles.lastName,
      username: userProfiles.username,
      avatarUrl: userProfiles.avatarUrl,
      bio: userProfiles.bio,
      // subscription
      stripeCustomerId: userSubscriptions.stripeCustomerId,
      stripeSubscriptionId: userSubscriptions.stripeSubscriptionId,
      stripeProductId: userSubscriptions.stripeProductId,
      planName: userSubscriptions.planName,
      subscriptionStatus: userSubscriptions.subscriptionStatus,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .innerJoin(userSubscriptions, eq(userSubscriptions.userId, users.id))
    .where(eq(userSubscriptions.stripeCustomerId, customerId))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

export async function updateUserSubscription(
  userId: string,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  },
) {
  await db
    .insert(userSubscriptions)
    .values({
      userId,
      ...subscriptionData,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSubscriptions.userId,
      set: {
        ...subscriptionData,
        updatedAt: new Date(),
      },
    });
}
