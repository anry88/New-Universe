import { User } from './user.js';

export interface AuthResponse {
  user: User;
  token: string;
}
