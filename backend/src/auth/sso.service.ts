import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import type { SsoTokenResponse, SsoUser } from './auth.types';

interface SsoValidationResponse {
  authenticated?: boolean;
  user?: SsoUser;
}

@Injectable()
export class SsoService {
  private readonly baseUrl: URL;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    const configuredUrl =
      this.config.get<string>('PGC_SSO_URL') ?? 'https://sso.cagayan.gov.ph';
    let url: URL;

    try {
      url = new URL(configuredUrl);
    } catch {
      throw new InternalServerErrorException('PGC_SSO_URL is invalid.');
    }

    if (url.protocol !== 'https:') {
      throw new InternalServerErrorException('PGC_SSO_URL must use HTTPS.');
    }

    this.baseUrl = url;
  }

  async login(username: string, password: string): Promise<SsoTokenResponse> {
    const response = await this.request<SsoTokenResponse>({
      method: 'POST',
      url: this.endpoint('/api/auth/login'),
      headers: this.projectHeaders(),
      data: { username, password },
    });

    if (response.status === 401 || response.status === 422) {
      throw new UnauthorizedException('Invalid username or password.');
    }
    this.ensureUpstreamSuccess(response, 'PGC SSO could not sign you in.');

    const result = response.data;
    if (
      !result ||
      typeof result.access_token !== 'string' ||
      !result.access_token ||
      typeof result.token_type !== 'string' ||
      result.token_type.toLowerCase() !== 'bearer'
    ) {
      throw new BadGatewayException('PGC SSO returned an invalid login response.');
    }

    return {
      access_token: result.access_token,
      token_type: result.token_type,
    };
  }

  async validateToken(authorization: string): Promise<SsoUser> {
    const response = await this.request<SsoValidationResponse>({
      method: 'POST',
      url: this.endpoint('/api/auth/validate'),
      headers: this.projectHeaders(authorization),
    });

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Unauthorized access.');
    }
    this.ensureUpstreamSuccess(response, 'PGC SSO could not validate the session.');

    const result = response.data;
    if (
      result?.authenticated !== true ||
      !result.user ||
      typeof result.user.emp_no !== 'string'
    ) {
      throw new UnauthorizedException('Unauthorized access.');
    }

    return result.user;
  }

  async getProfile(authorization: string): Promise<unknown> {
    const response = await this.request<unknown>({
      method: 'POST',
      url: this.endpoint('/api/auth/me'),
      headers: this.projectHeaders(authorization),
    });

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Unable to retrieve authenticated user.');
    }
    this.ensureUpstreamSuccess(response, 'Unable to retrieve authenticated user.');
    return response.data;
  }

  async logout(authorization: string): Promise<unknown> {
    const response = await this.request<unknown>({
      method: 'POST',
      url: this.endpoint('/api/auth/logout'),
      headers: this.projectHeaders(authorization),
    });

    if (response.status === 401 || response.status === 403) {
      throw new UnauthorizedException('Unable to logout.');
    }
    this.ensureUpstreamSuccess(response, 'Unable to logout.');
    return response.data;
  }

  private async request<T>(
    request: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    try {
      return await firstValueFrom(
        this.http.request<T>({
          ...request,
          validateStatus: () => true,
        }),
      );
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        throw new ServiceUnavailableException('Unable to connect to PGC SSO.');
      }
      throw error;
    }
  }

  private endpoint(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private projectHeaders(authorization?: string): Record<string, string> {
    const projectKey = this.config.get<string>('PGC_SSO_PROJECT_KEY');
    if (!projectKey) {
      throw new InternalServerErrorException(
        'PGC SSO project key is not configured.',
      );
    }

    return {
      'X-PGC-Project-Key': projectKey,
      ...(authorization ? { Authorization: authorization } : {}),
    };
  }

  private ensureUpstreamSuccess<T>(
    response: AxiosResponse<T>,
    message: string,
  ): void {
    if (response.status >= 500) {
      throw new ServiceUnavailableException(message);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new BadGatewayException(message);
    }
  }
}
