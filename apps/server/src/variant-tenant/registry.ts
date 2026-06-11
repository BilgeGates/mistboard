/**
 * VariantTenant registry — the extension point that makes "a new variant is
 * one registry entry" true at the dispatch layer.
 *
 * Registrations are variant-type-ERASED: they carry routing identity (kind,
 * gameSpecId, roomIdPrefix, flag) plus bound closures over the tenant's
 * concrete types, so dispatch sites (index.ts room resolution,
 * server-ws-connection, lobby/create routes) can route without knowing any
 * variant's Color/Move/State. Tenants register at module load from their
 * adapter (see server-ws-dark-mini-xiangqi.ts).
 *
 * P0 status: DMX registers; dispatch sites still hand-code their per-variant
 * branches. Collapsing those branches onto this registry is the P1/P2 step —
 * do it once two or more tenants are live on the generic runtime.
 */

export type VariantTenantRegistration = {
  kind: string;
  gameSpecId: string;
  roomIdPrefix: string;
  enabled(): boolean;
};

const registrationsByPrefix = new Map<string, VariantTenantRegistration>();

export function registerVariantTenant(registration: VariantTenantRegistration): void {
  const existing = registrationsByPrefix.get(registration.roomIdPrefix);
  if (existing && existing.kind !== registration.kind) {
    throw new Error(
      `variant tenant room-id prefix collision: '${registration.roomIdPrefix}' claimed by both '${existing.kind}' and '${registration.kind}'`,
    );
  }
  registrationsByPrefix.set(registration.roomIdPrefix, registration);
}

export function variantTenantForRoomId(roomId: string): VariantTenantRegistration | null {
  for (const registration of registrationsByPrefix.values()) {
    if (roomId.startsWith(registration.roomIdPrefix)) return registration;
  }
  return null;
}

export function variantTenantForSpecId(gameSpecId: string): VariantTenantRegistration | null {
  for (const registration of registrationsByPrefix.values()) {
    if (registration.gameSpecId === gameSpecId) return registration;
  }
  return null;
}

export function registeredVariantTenants(): VariantTenantRegistration[] {
  return [...registrationsByPrefix.values()];
}
