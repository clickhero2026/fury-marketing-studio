import type { User, Session } from '@supabase/supabase-js';

export type UserRole = 'owner' | 'admin' | 'viewer';
export type OrgPlan = 'free' | 'pro' | 'enterprise';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  current_organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  status: 'pending' | 'accepted' | 'expired';
  created_at: string;
  expires_at: string;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'trial' | 'cancelled' | null;
  organization_id: string | null;
  subscription_plan: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  organization: Organization | null;
  company: Company | null;
  role: UserRole | null;
  organizations: Organization[];
  isLoading: boolean;
}

export interface SignUpData {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  slug: string;
  plan: OrgPlan;
  avatarSeed: string;
}

export interface SignInData {
  email: string;
  password: string;
}
