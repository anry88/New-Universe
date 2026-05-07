export interface User {
  id: string;
  tgId: string;
  tgUsername: string | null;
  tgFirstName: string | null;
  createdAt: string;
  premiumUntil: string | null;
  powerScore: number;
}
