import type { IssuerRegistryEntry } from '@eduvault/shared';
import type { InstitutionCheckDTO } from '@edubridge/shared';
import { institutionsMatch } from '../eduvault/verify';
import { vaultClient } from '../eduvault/vaultClient';

/**
 * "Is this institution registered?" — answered from the EduVault issuer registry, so EduBridge and
 * EduVault agree on which institutions exist. The list changes rarely, so it is cached briefly.
 */
const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; items: IssuerRegistryEntry[] } | null = null;

async function issuers() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.items;
  const { items } = await vaultClient.listIssuers();
  cache = { at: Date.now(), items };
  return items;
}

export function clearRegistryCache() {
  cache = null;
}

export async function checkInstitution(entered: { institutionName?: string; university?: string }): Promise<InstitutionCheckDTO> {
  let list: IssuerRegistryEntry[];
  try {
    list = await issuers();
  } catch {
    return { result: 'UNAVAILABLE', entered };
  }
  const name = entered.institutionName ?? '';
  const found = name ? list.find((i) => institutionsMatch(i.name, name)) : undefined;
  if (!found) return { result: 'NOT_FOUND', entered };
  return {
    result: 'REGISTERED',
    entered,
    match: { institutionId: found.institutionId, name: found.name, university: found.university, code: found.code, status: found.status },
  };
}
