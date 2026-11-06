export interface SsoTokenResponse {
  access_token: string;
  token_type: string;
}

export interface SsoUser {
  emp_no: string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
  };
  user: SsoUser;
  inventoryRole?: 'USER' | 'ADMIN' | 'SUPERADMIN';
}
