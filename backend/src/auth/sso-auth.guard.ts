import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.types';
import { SsoService } from './sso.service';

@Injectable()
export class SsoAuthGuard implements CanActivate {
  constructor(private readonly sso: SsoService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      throw new UnauthorizedException('Unauthorized access.');
    }

    request.user = await this.sso.validateToken(authorization);
    return true;
  }
}
