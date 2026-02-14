export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  initialPhrase: string;
  status: 'active' | 'archived' | 'deleted';
  settings: ProjectSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSettings {
  maxDepth?: number;
  enableLLM?: boolean;
  scoringWeights?: ScoringWeights;
}

export interface ScoringWeights {
  pronounceability: number;
  brandability: number;
  semanticFit: number;
  technicalQuality: number;
}
