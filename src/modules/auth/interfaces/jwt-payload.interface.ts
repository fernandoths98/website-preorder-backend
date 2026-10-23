import { AdminRole } from '../../../common/enums/admin-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: AdminRole | 'merchant';
  merchantId?: string;
  sessionStamp?: string;
}
