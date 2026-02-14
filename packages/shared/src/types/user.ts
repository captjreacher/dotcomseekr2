export interface User {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  subscriptionStatus: 'free' | 'pro' | 'enterprise';
  creditsRemaining: number;
  createdAt: Date;
  updatedAt: Date;
}
