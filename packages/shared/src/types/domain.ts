export interface DomainCandidate {
  id: string;
  projectId: string;
  domainName: string;
  tld: string;
  sourceNodeIds: string[];
  recombinationStrategy: string;
  scoreTotal: number;
  scorePronounceability?: number;
  scoreBrandability?: number;
  scoreSemanticFit?: number;
  scoreTechnicalQuality?: number;
  scoringMetadata: Record<string, unknown>;
  groupId?: string;
  groupLabel?: string;
  availabilityStatus?: 'available' | 'taken' | 'unknown' | 'premium';
  availabilityCheckedAt?: Date;
  registrationPriceCents?: number;
  userRating?: number;
  userFavorited: boolean;
  userNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainScore {
  total: number;
  pronounceability: number;
  brandability: number;
  semanticFit: number;
  technicalQuality: number;
}
