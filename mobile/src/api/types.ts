// Shapes of /api/mobile/v1/ (backend/mobileapi). Dates are Bikram Sambat
// "YYYY-MM-DD"; timestamps are ISO 8601.

export type Role = 'parent' | 'student' | 'staff' | 'admin';

export type School = {
  id: number;
  code: string;
  name: string;
  address: string;
  logo_url: string | null;
};

export type SchoolLookup = {
  school: School;
  sign_in: Record<Role, 'password' | 'email_code'>;
};

export type Tokens = {
  access_token: string;
  access_expires_at: number;
  refresh_token: string;
  token_type: 'Bearer';
};

export type Child = {
  id: number;
  name: string;
  class_name: string;
  roll_no: string | null;
  photo_url: string | null;
};

export type Me = {
  role: Role;
  session_id: string;
  school: School;
  profile: {
    id?: number;
    name: string;
    username?: string;
    email?: string | null;
    phone_last_digits?: string;
    class_name?: string;
    roll_no?: string | null;
    designation?: string;
    photo_url?: string | null;
  };
  children?: Child[];
  permissions?: number[];
};

export type SignedIn = { tokens: Tokens; me: Me };

export type CodeSent = { sent_to: string; resend_after: number; expires_in: number };

export type PhoneSession = {
  id: string;
  platform: 'android' | 'ios' | null;
  device_label: string;
  app_version: string;
  created_at: string;
  last_seen_at: string;
  current: boolean;
};
